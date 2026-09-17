import type { WorkflowGraph } from '@/features/graph/graph.types'
import type { NodeRunState, RunnerEvent, RunScope, RunState, RunStatus } from '@/features/runner/runner.types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { reduceEvent } from '@/features/runner/reduce'
import { idleRunState } from '@/features/runner/runner.types'

/**
 * 运行态 store。
 *
 * 纪律（设计文档 §6.4）：**store 只存状态与同步 mutate，绝不发请求。**
 * 所有异步在 composable / api 层，拿到结果后调这里的 action 写入。
 * runner 的状态来源是 SSE 事件流而非请求，在 store 里塞异步会让状态与副作用耦合。
 *
 * 与定义态严格分离（设计文档 §3.2）：节点的运行状态**绝不**写进 GraphNode。
 * 这份 store 的数据是按 runId 组织的，和项目 store 里的图没有交集。
 */

/** 视为「正在跑」的状态 —— 顶栏的运行指示器读它 */
const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'submitting',
  'queued',
  'running',
])

/** 图解析器：由 view 注入，避免 runner store 直接依赖项目 store（会形成双向依赖） */
export type GraphResolver = (workflowId: string) => WorkflowGraph | undefined

let runCounter = 0

function nextRunId(): string {
  runCounter += 1
  return `run_${Date.now().toString(36)}_${runCounter}`
}

export const useRunnerStore = defineStore('runner', () => {
  /** runId → 运行态 */
  const runs = ref<Record<string, RunState>>({})

  /** 创建顺序，用来判断「某个工作流最近一次运行」 */
  const order = ref<string[]>([])

  let graphResolver: GraphResolver | undefined

  /**
   * 注入图解析器。
   *
   * reducer 的失败传播（设计文档 §4.4：失败节点的下游全部 skipped）需要图结构，
   * 但 store 不该认识项目 store。所以由 view 在装配时把「按 workflowId 取图」的能力传进来。
   */
  function setGraphResolver(resolver: GraphResolver | undefined): void {
    graphResolver = resolver
  }

  const activeRunIds = computed<string[]>(() =>
    order.value.filter((id) => {
      const run = runs.value[id]
      return run !== undefined && ACTIVE_STATUSES.has(run.status)
    }),
  )

  /** 开一次新 run。返回 runId；实际的网络提交由 composable 负责。 */
  function startRun(workflowId: string, scope: RunScope): string {
    const id = nextRunId()
    runs.value = { ...runs.value, [id]: idleRunState(id, workflowId, scope) }
    order.value = [...order.value, id]
    return id
  }

  /**
   * 应用一个已解析的事件。
   *
   * 认不出的 runId 直接忽略 —— 事件流是项目级的，可能包含别的标签页发起的 run，
   * 也可能在首屏重建（GET /runs/:id）完成前先到达。忽略比瞎建一个残缺 run 安全。
   */
  function applyEvent(event: RunnerEvent): void {
    const run = runs.value[event.runId]
    if (run === undefined) {
      return
    }
    const graph = graphResolver?.(run.workflowId)
    runs.value = { ...runs.value, [event.runId]: reduceEvent(run, event, graph) }
  }

  /**
   * 批量应用事件，**整批只写一次 store**。
   *
   * 为什么必须批量：每写一次 `runs` 就换一个新对象引用 → 派生的渲染 meta 重算
   * → Vue Flow 把全部节点的 data 重新 diff 一遍。单条写等于把这份成本乘以事件数。
   *
   * 压测数据（9 节点，计时器把进度事件密度拉到 77 条/秒）：
   *   主线程累计阻塞 4.6 秒、掉帧 4.5%、最差单帧 434ms。
   * 合并成每帧一次之后，写入次数上限就是帧率（60/秒），
   * 且同一节点的多条进度会被 reduce 折叠掉中间态，只留最后一个值。
   */
  function applyEvents(events: readonly RunnerEvent[]): void {
    if (events.length === 0) {
      return
    }
    const next = { ...runs.value }
    let touched = false

    for (const event of events) {
      const run = next[event.runId]
      if (run === undefined) {
        continue
      }
      const graph = graphResolver?.(run.workflowId)
      next[event.runId] = reduceEvent(run, event, graph)
      touched = true
    }

    if (touched) {
      runs.value = next
    }
  }

  /**
   * 取消一次运行。把 run 和所有未到终态的节点一起标掉 ——
   * 后端也会推 cancelled 事件，但本地先落状态能让 UI 立刻响应。
   */
  function cancelRun(runId: string): void {
    const run = runs.value[runId]
    if (run === undefined) {
      return
    }

    const nodes: Record<string, NodeRunState> = {}
    for (const [nodeId, state] of Object.entries(run.nodes)) {
      const terminal
        = state.status === 'succeeded'
          || state.status === 'failed'
          || state.status === 'skipped'
          || state.status === 'cancelled'
      nodes[nodeId] = terminal ? state : { ...state, status: 'cancelled', finishedAt: Date.now() }
    }

    runs.value = {
      ...runs.value,
      [runId]: { ...run, status: 'cancelled', nodes, finishedAt: Date.now() },
    }
  }

  /** 用全量 run 覆盖本地（页面刷新后靠 GET /runs/:id 重建首屏） */
  function hydrateRun(run: RunState): void {
    runs.value = { ...runs.value, [run.id]: run }
    if (!order.value.includes(run.id)) {
      order.value = [...order.value, run.id]
    }
  }

  /** 某个工作流最近一次运行的节点状态。画布把它映射成每节点的渲染 meta。 */
  function nodeStatesFor(workflowId: string): Record<string, NodeRunState> {
    for (let i = order.value.length - 1; i >= 0; i -= 1) {
      const id = order.value[i]
      if (id === undefined) {
        continue
      }
      const run = runs.value[id]
      if (run !== undefined && run.workflowId === workflowId) {
        return run.nodes
      }
    }
    return {}
  }

  /** 最近一次运行（不限于某个工作流） */
  function latestRun(): RunState | undefined {
    const id = order.value[order.value.length - 1]
    return id === undefined ? undefined : runs.value[id]
  }

  /** 顶栏指示器：当前几个任务在跑 */
  function runningCount(): number {
    return activeRunIds.value.length
  }

  /** 顶栏指示器：累计实际花费 */
  function totalCost(): number {
    return Object.values(runs.value).reduce((sum, run) => sum + (run.cost.actual ?? 0), 0)
  }

  /** 顶栏指示器：累计预估花费 */
  function totalEstimatedCost(): number {
    return Object.values(runs.value).reduce((sum, run) => sum + (run.cost.estimated ?? 0), 0)
  }

  /** 仅测试用 */
  function __reset(): void {
    runs.value = {}
    order.value = []
    graphResolver = undefined
  }

  return {
    runs,
    order,
    activeRunIds,
    setGraphResolver,
    startRun,
    applyEvent,
    applyEvents,
    cancelRun,
    hydrateRun,
    nodeStatesFor,
    latestRun,
    runningCount,
    totalCost,
    totalEstimatedCost,
    __reset,
  }
})
