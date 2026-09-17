import type { WireEventMessage } from './wire-serialize'
import type { WorkflowGraph } from '@/features/graph/graph.types'
import type { AssetRef, RunnerEvent, RunScope, RunState } from '@/features/runner/runner.types'
import { topologicalSort } from '@/features/graph/topo'
import { downstreamOf, resolveRunTargets, upstreamOf } from '@/features/runner/dag'
import { reduceEvent } from '@/features/runner/reduce'
import { idleRunState } from '@/features/runner/runner.types'
import { toWireEvent } from './wire-serialize'

/**
 * 内存版假后端。
 *
 * 职责：把「提交一次 run」变成一串带时间间隔的 SSE 事件，并维护足够的状态让
 * `GET /runs/:id` 和 `Last-Event-ID` 补齐都能工作。
 *
 * 所有状态是模块级的（单个标签页一份），刷新即清空 —— 与 MSW 的定位一致：
 * 它只负责让前端在真后端就位前能跑通，不承担持久化。
 *
 * `buildRunSchedule` 是纯函数（时间以相对偏移表达），单测直接覆盖它，
 * 不必和定时器打交道；下面那层才把偏移变成真正的 setTimeout。
 */

// ── 时间参数（毫秒）────────────────────────────────────────────────────────

export const TIMING = {
  submit: 60,
  reusedNode: 180,
  nodeQueued: 140,
  nodeRunning: 260,
  progressTick: 170,
  progressTicks: 6,
  candidates: 120,
  nodeSettle: 160,
  skipped: 90,
  done: 200,
  /** 单次 run 的最短总耗时，防止图很小时瞬间跑完、UI 来不及展示状态流转 */
  minDuration: 1200,
} as const

/** 每个候选的估算单价，用来凑出一个像样的 cost */
const COST_PER_CANDIDATE = 0.04

export interface ScheduledEvent {
  /** 相对于 run 开始的延迟 */
  delayMs: number
  event: RunnerEvent
}

export interface BuildScheduleOptions {
  runId: string
  workflowId: string
  graph: WorkflowGraph
  scope: RunScope
  /** 起始 seq。项目级单调递增，由调用方给 */
  startSeq: number
  startAt: number
  currency?: string
  /** 指定某个节点失败，用来演练「下游 skipped + run partial」（设计文档 §4.4）。不传则全部成功。 */
  failNodeId?: string
}

/** 按拓扑序排列目标节点；有环时退回图里的声明顺序（不该让 mock 因为环而炸掉） */
function orderedTargets(graph: WorkflowGraph, targets: readonly string[]): string[] {
  const targetSet = new Set(targets)
  let order: string[]
  try {
    order = topologicalSort(graph)
  }
  catch {
    order = graph.nodes.map(n => n.id)
  }
  const ranked = order.filter(id => targetSet.has(id))
  // 拓扑排序会漏掉不在图里的目标；补在末尾，保证不丢
  const missing = targets.filter(id => !ranked.includes(id))
  return [...ranked, ...missing]
}

/**
 * 哪些节点走缓存（`reused: true`）。
 *
 * 设计文档 §3.4：局部执行时上游不重新跑，直接取缓存产出喂进来。
 * 所以「目标节点的上游」才是复用集合；与目标无依赖关系的节点既不复用也不执行。
 */
function computeReusedNodes(graph: WorkflowGraph, scope: RunScope, targets: readonly string[]): string[] {
  const targetSet = new Set(targets)

  switch (scope.kind) {
    case 'workflow':
      // 整图执行没有缓存可复用
      return []
    case 'node': {
      const reused = new Set<string>()
      for (const id of scope.nodeIds) {
        for (const up of upstreamOf(graph, id)) {
          if (!targetSet.has(up)) {
            reused.add(up)
          }
        }
      }
      return [...reused]
    }
    case 'downstream': {
      const reused = new Set<string>()
      for (const up of upstreamOf(graph, scope.nodeId)) {
        if (!targetSet.has(up)) {
          reused.add(up)
        }
      }
      return [...reused]
    }
  }
}

/** mime → 文件扩展名。直接取下划线后的子类型会得到 `.plain` 这种怪东西 */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'text/plain': 'txt',
}

/** 造一批像样的候选产出 */
function makeCandidates(nodeId: string, count: number, mime: string): AssetRef[] {
  const ext = EXT_BY_MIME[mime] ?? 'bin'
  const isVisual = mime.startsWith('image/') || mime.startsWith('video/')
  return Array.from({ length: count }, (_, i) => ({
    assetId: `asset_${nodeId}_${i + 1}`,
    url: `https://cdn.example.com/${nodeId}/${i + 1}.${ext}`,
    mime,
    // 文本产出没有尺寸概念，给 undefined 而不是编一个
    ...(isVisual ? { width: 1024, height: 1536 } : {}),
  }))
}

/**
 * 节点产出形态表。
 *
 * 真实后端从模型注册表拿到这些信息（设计文档 §6.3「前端定节点，后端定模型」），
 * 但 mock 不该 import 前端注册表 —— 依赖方向是 views → features → shared，
 * shared 反向依赖 features 就成环了。所以在这里列一份，
 * **新增节点类型时记得同步这里**（真实后端不需要）。
 */
const OUTPUT_SHAPE: Record<string, { mime: string, candidates: number }> = {
  'llm-script': { mime: 'text/plain', candidates: 1 },
  'text-to-image': { mime: 'image/png', candidates: 4 },
  'image-to-image': { mime: 'image/png', candidates: 4 },
  // 放大是确定性处理，不出候选（设计文档 §2.3 节点类型表：候选数 1）
  'upscale': { mime: 'image/png', candidates: 1 },
  'image-to-video': { mime: 'video/mp4', candidates: 4 },
}

const DEFAULT_SHAPE = { mime: 'image/png', candidates: 4 }

function shapeFor(graph: WorkflowGraph, nodeId: string): { mime: string, candidates: number } {
  const type = graph.nodes.find(n => n.id === nodeId)?.type
  return (type !== undefined ? OUTPUT_SHAPE[type] : undefined) ?? DEFAULT_SHAPE
}

/** 节点产出几个候选：优先读节点参数，否则按类型给个合理默认 */
function candidateCountFor(graph: WorkflowGraph, nodeId: string): number {
  const node = graph.nodes.find(n => n.id === nodeId)
  const raw = node?.data.candidateCount
  if (typeof raw === 'number' && raw > 0) {
    return raw
  }
  return shapeFor(graph, nodeId).candidates
}

function mimeFor(graph: WorkflowGraph, nodeId: string): string {
  return shapeFor(graph, nodeId).mime
}

/**
 * 生成一次 run 的完整事件时间表（纯函数，无定时器）。
 *
 * 事件序列：run queued → [复用节点秒回] → 逐节点 queued/running/进度/候选/落定
 * → [失败则下游 skipped] → run.done
 */
export function buildRunSchedule(opts: BuildScheduleOptions): ScheduledEvent[] {
  const { graph, scope, runId, startSeq, startAt } = opts
  const currency = opts.currency ?? 'CNY'
  const out: ScheduledEvent[] = []

  let seq = startSeq
  let elapsed = 0

  function push(delayMs: number, event: Omit<RunnerEvent, 'seq' | 'runId' | 'at'> & Record<string, unknown>): void {
    elapsed += delayMs
    seq += 1
    out.push({
      delayMs: elapsed,
      event: { ...event, seq, runId, at: startAt + elapsed } as RunnerEvent,
    })
  }

  const targets = resolveRunTargets(graph, scope)
  const ordered = orderedTargets(graph, targets)
  const reused = computeReusedNodes(graph, scope, targets)
  const reusedSet = new Set(reused)

  const estimated = targets.reduce((sum, id) => sum + candidateCountFor(graph, id) * COST_PER_CANDIDATE, 0)

  push(TIMING.submit, { type: 'run.status', status: 'queued', cost: { currency, estimated } })
  push(0, { type: 'run.status', status: 'running' })

  // 走缓存的节点：秒回，带 reused 标记（设计文档 §4.3 要求前端能区分复用与真跑）
  for (const nodeId of reused) {
    push(TIMING.reusedNode, { type: 'node.status', nodeId, status: 'queued' })
    push(0, {
      type: 'node.status',
      nodeId,
      status: 'succeeded',
      reused: true,
    })
    push(0, {
      type: 'node.candidates',
      nodeId,
      candidates: makeCandidates(nodeId, candidateCountFor(graph, nodeId), mimeFor(graph, nodeId)),
    })
  }

  let actual = 0
  let anyFailed = false

  /** 因上游失败而没机会跑的节点。它们已经在 failed 分支里被播报过 skipped，不能再走正常流程。 */
  const skipped = new Set<string>()

  for (const nodeId of ordered) {
    if (skipped.has(nodeId)) {
      continue
    }

    const willFail = opts.failNodeId === nodeId
    const count = candidateCountFor(graph, nodeId)

    push(TIMING.nodeQueued, { type: 'node.status', nodeId, status: 'queued' })
    push(TIMING.nodeRunning, { type: 'node.status', nodeId, status: 'running' })

    for (let tick = 1; tick <= TIMING.progressTicks; tick += 1) {
      const percent = Math.round((tick / (TIMING.progressTicks + 1)) * 100)
      push(TIMING.progressTick, { type: 'node.progress', nodeId, progress: percent })
    }

    if (willFail) {
      anyFailed = true
      push(TIMING.nodeSettle, {
        type: 'node.status',
        nodeId,
        status: 'failed',
        error: {
          code: 'MODEL_LOAD_FAILED',
          // 生成类失败不可自动重试 —— 直接烧钱（设计文档 §4.5）
          retryable: false,
          message: '模型加载失败',
        },
      })

      // 下游全部 skipped；旁支不受影响由 downstreamOf 只走传递闭包保证
      for (const downstreamId of downstreamOf(graph, nodeId)) {
        // 已被缓存喂饱的节点不该被标 skipped —— 它的产出真实存在
        if (reusedSet.has(downstreamId)) {
          continue
        }
        skipped.add(downstreamId)
        push(TIMING.skipped, { type: 'node.status', nodeId: downstreamId, status: 'skipped' })
      }
      continue
    }

    push(TIMING.candidates, {
      type: 'node.candidates',
      nodeId,
      candidates: makeCandidates(nodeId, count, mimeFor(graph, nodeId)),
    })
    push(TIMING.nodeSettle, { type: 'node.status', nodeId, status: 'succeeded' })
    actual += count * COST_PER_CANDIDATE
  }

  const remaining = TIMING.minDuration - elapsed
  push(Math.max(TIMING.done, remaining), {
    type: 'run.done',
    status: anyFailed ? 'partial' : 'succeeded',
    cost: { currency, estimated, actual: Number(actual.toFixed(4)) },
  })

  return out
}

// ── 运行时（模块级内存状态）────────────────────────────────────────────────

const runs = new Map<string, RunState>()
const eventLog: WireEventMessage[] = []
const subscribers = new Set<(message: WireEventMessage) => void>()

let projectSeq = 0
let runCounter = 0
const timers = new Set<ReturnType<typeof setTimeout>>()

/**
 * 时间缩放。只影响「播放」时的实际延迟，不改变 `buildRunSchedule` 产出的时间表
 * （那是纯函数，按真实节奏表达，单测直接覆盖）。
 *
 * 存在的理由：一次真实节奏的 run 要 1–4 秒，集成测试若每次都等真实时间会拖垮套件。
 * 测试里调到 5，实际等待就降到几百毫秒，而事件顺序与内容完全不变。
 */
let speed = 1

export function setMockSpeed(factor: number): void {
  speed = factor > 0 ? factor : 1
}

/** 项目级单调递增序号，重连补齐靠它（API 契约 §5.2）。新 run 的 seq 从这个值往上接。 */
function currentSeq(): number {
  return projectSeq
}

function publish(message: WireEventMessage): void {
  eventLog.push(message)
  for (const notify of subscribers) {
    notify(message)
  }
}

export function subscribe(listener: (message: WireEventMessage) => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

/** `Last-Event-ID` 之后的全部事件（API 契约 §5.2 / 设计文档 §9.1） */
export function eventsAfter(lastEventId: number): WireEventMessage[] {
  return eventLog.filter(message => message.seq > lastEventId)
}

export function getFakeRun(runId: string): RunState | undefined {
  return runs.get(runId)
}

export function listFakeRuns(): RunState[] {
  return [...runs.values()]
}

export interface SubmitOptions {
  workflowId: string
  scope: RunScope
  graph: WorkflowGraph
  failNodeId?: string
}

/**
 * 提交一次 run：立刻登记状态并返回，事件按时间表陆续推给订阅者。
 *
 * 这里用 `reduceEvent`（与前端同一个 reducer）来维护服务端的 run 快照 ——
 * 这样 `GET /runs/:id` 返回的首屏重建结果与客户端逐步归约出来的状态天然一致，
 * 不会出现两套语义。
 */
export function submitFakeRun(opts: SubmitOptions): RunState {
  runCounter += 1
  const runId = `run_${Date.now().toString(36)}_${runCounter}`
  const startAt = Date.now()

  const run = idleRunState(runId, opts.workflowId, opts.scope)
  runs.set(runId, run)

  const schedule = buildRunSchedule({
    runId,
    workflowId: opts.workflowId,
    graph: opts.graph,
    scope: opts.scope,
    startSeq: currentSeq(),
    startAt,
    ...(opts.failNodeId !== undefined ? { failNodeId: opts.failNodeId } : {}),
  })

  for (const step of schedule) {
    const timer = setTimeout(() => {
      timers.delete(timer)

      // 若 run 已被取消，停止推流（真实后端同样会停）
      const current = runs.get(runId)
      if (current?.status === 'cancelled') {
        return
      }

      const next = reduceEvent(current ?? idleRunState(runId, opts.workflowId, opts.scope), step.event, opts.graph)
      runs.set(runId, next)
      publish(toWireEvent(step.event, opts.workflowId))
    }, Math.round(step.delayMs / speed))
    timers.add(timer)
  }

  return run
}

export function cancelFakeRun(runId: string): boolean {
  const run = runs.get(runId)
  if (run === undefined) {
    return false
  }
  runs.set(runId, { ...run, status: 'cancelled', finishedAt: Date.now() })
  return true
}

/** 仅测试 / HMR 用：清空全部内存状态并停掉未触发的定时器 */
export function resetFakeBackend(): void {
  for (const timer of timers) {
    clearTimeout(timer)
  }
  timers.clear()
  runs.clear()
  eventLog.length = 0
  subscribers.clear()
  projectSeq = 0
  runCounter = 0
}
