import type { NodeRunState, NodeRunStatus, RunnerEvent, RunState } from './runner.types'
import type { WorkflowGraph } from '@/features/graph/graph.types'
import { downstreamOf } from './dag'
import { idleNodeState } from './runner.types'

/**
 * 事件 → 运行状态的纯归约函数。
 *
 * 设计文档 §4.2 的两级状态机都收敛在这里。之所以做成纯函数：设计文档 §8 把
 * 「事件归约状态机和断线补齐逻辑」列为最密、出错代价最高的一块，纯函数能直接单测，
 * 不必拉起 store 和网络。
 *
 * 纪律：**不做重试决策**。哪些错误可重试由后端在 `error.retryable` 里给，
 * 前端只透传（设计文档 §4.5）。
 */

/** 到达后不再变化的节点状态 */
const TERMINAL_NODE_STATUSES: ReadonlySet<NodeRunStatus> = new Set<NodeRunStatus>([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
])

/** 就地把某个节点替换掉，返回新的 run（不修改入参） */
function patchNode(
  run: RunState,
  nodeId: string,
  fn: (current: NodeRunState) => NodeRunState,
): RunState {
  const current = run.nodes[nodeId] ?? idleNodeState()
  return {
    ...run,
    nodes: { ...run.nodes, [nodeId]: fn(current) },
  }
}

/**
 * 节点失败后，把它的全部下游标成 skipped（设计文档 §4.4）。
 *
 * 「无依赖关系的其他分支继续执行」这条靠 `downstreamOf` 只走传递闭包来保证 ——
 * 旁支不在闭包内，自然不受影响。
 *
 * 已经到达终态的下游不覆盖：真跑出来的结果比推导出来的 skipped 更可信。
 */
function skipDownstream(run: RunState, graph: WorkflowGraph, failedNodeId: string, at: number): RunState {
  const targets = downstreamOf(graph, failedNodeId)
  if (targets.length === 0) {
    return run
  }

  const nodes = { ...run.nodes }
  let changed = false

  for (const id of targets) {
    const existing = nodes[id]
    if (existing !== undefined && TERMINAL_NODE_STATUSES.has(existing.status)) {
      continue
    }
    nodes[id] = {
      ...(existing ?? idleNodeState()),
      status: 'skipped',
      finishedAt: at,
    }
    changed = true
  }

  return changed ? { ...run, nodes } : run
}

function applyNodeStatus(
  run: RunState,
  event: Extract<RunnerEvent, { type: 'node.status' }>,
  graph: WorkflowGraph | undefined,
): RunState {
  const terminal = TERMINAL_NODE_STATUSES.has(event.status)

  const next = patchNode(run, event.nodeId, (current) => {
    const patch: NodeRunState = { ...current, status: event.status }

    // 首次进入 running 时打点，后续重复的 running 事件不刷新它
    if (event.status === 'running' && current.startedAt === undefined) {
      patch.startedAt = event.at
    }
    if (terminal) {
      patch.finishedAt = event.at
    }
    // 显式判 undefined 而不是直接赋值 —— tsconfig 开了 exactOptionalPropertyTypes
    if (event.reused !== undefined) {
      patch.reused = event.reused
    }
    if (event.error !== undefined) {
      patch.error = event.error
    }

    return patch
  })

  if (event.status !== 'failed' || graph === undefined) {
    return next
  }

  return skipDownstream(next, graph, event.nodeId, event.at)
}

/**
 * 折叠单个事件，返回新的 run。
 *
 * `graph` 只被失败传播用到（设计文档 §4.4：失败节点的下游全部 skipped）。
 * 不传则不做传播 —— 不崩，也不误标。跑图与渲染可能不在同一拍，所以它是可选的。
 */
export function reduceEvent(
  run: RunState,
  event: RunnerEvent,
  graph?: WorkflowGraph | undefined,
): RunState {
  switch (event.type) {
    case 'run.status': {
      return {
        ...run,
        status: event.status,
        ...(event.cost !== undefined ? { cost: event.cost } : {}),
        ...(run.startedAt === undefined && event.status !== 'idle' ? { startedAt: event.at } : {}),
      }
    }

    case 'node.status':
      return applyNodeStatus(run, event, graph)

    case 'node.progress':
      return patchNode(run, event.nodeId, current => ({ ...current, progress: event.progress }))

    case 'node.candidates':
      // 整体替换而非追加：重跑会产生一批新候选，旧候选不该混进来
      return patchNode(run, event.nodeId, current => ({ ...current, candidates: event.candidates }))

    case 'run.done': {
      return {
        ...run,
        status: event.status,
        cost: event.cost,
        finishedAt: event.at,
      }
    }
  }
}

/** 按顺序折叠一串事件 */
export function reduceEvents(
  run: RunState,
  events: readonly RunnerEvent[],
  graph?: WorkflowGraph | undefined,
): RunState {
  let state = run
  for (const event of events) {
    state = reduceEvent(state, event, graph)
  }
  return state
}

export { TERMINAL_NODE_STATUSES }
