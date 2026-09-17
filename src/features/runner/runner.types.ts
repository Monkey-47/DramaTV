/**
 * 执行引擎的类型契约 —— 设计文档 §3.2 / §3.3 / §3.4 / §4.2 / §5.3
 *
 * 这是 runner 与 canvas 两条线的接口。改动这里要同时通知两边。
 */

/** 产出物引用。数据按引用流动，不按值 —— 一段 5 秒视频几十 MB，不可能塞进图里传（设计文档 §3.3） */
export interface AssetRef {
  assetId: string
  url: string
  mime: string
  width?: number
  height?: number
  duration?: number
}

/** 节点级运行状态（设计文档 §4.2） */
export type NodeRunStatus
  = | 'pending' // 已纳入本次 run，等待上游
    | 'queued' // 已提交后端，等候执行
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'skipped' // 上游失败导致没机会跑
    | 'cancelled'

export interface NodeRunError {
  code: string
  /** 只有 true 才允许自动重试 —— 生成类失败永不自动重试，直接烧钱（设计文档 §4.5） */
  retryable: boolean
  message: string
}

/** 单节点在一次 run 里的运行态。注意：这是运行态，绝不写进 GraphNode（设计文档 §3.2） */
export interface NodeRunState {
  status: NodeRunStatus
  candidates: AssetRef[]
  /** 0–100 */
  progress?: number
  error?: NodeRunError
  /** 本次是复用缓存产出，而非真跑。必须与真跑在视觉上可区分（设计文档 §4.3） */
  reused?: boolean
  startedAt?: number
  finishedAt?: number
}

/** 运行级状态（设计文档 §4.2）。partial 是必需的终止态 —— 允许部分失败就得有词表达"跑完了但有几个节点挂了" */
export type RunStatus
  = | 'idle'
    | 'submitting'
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'partial'

/** 执行作用域（设计文档 §3.4）。node 是最高频的 —— 用户大部分时间只跑一个节点 */
export type RunScope
  = | { kind: 'node', nodeIds: string[] }
    | { kind: 'downstream', nodeId: string }
    | { kind: 'workflow' }

export interface RunCost {
  estimated?: number
  actual?: number
  currency: string
}

export interface RunState {
  id: string
  workflowId: string
  status: RunStatus
  scope: RunScope
  cost: RunCost
  startedAt?: number
  finishedAt?: number
  /** nodeId → 该节点在这次 run 里的状态 */
  nodes: Record<string, NodeRunState>
}

// ============================================================================
// SSE 事件（设计文档 §5.3 / API 契约 §5.3）
// ============================================================================

interface BaseEvent {
  /** 项目级单调递增序号。重连时靠 Last-Event-ID 补齐 */
  seq: number
  runId: string
  at: number
}

export interface RunStatusEvent extends BaseEvent {
  type: 'run.status'
  status: RunStatus
  cost?: RunCost
}

export interface NodeStatusEvent extends BaseEvent {
  type: 'node.status'
  nodeId: string
  status: NodeRunStatus
  /** 复用标记随状态一起下发（设计文档 §4.3） */
  reused?: boolean
  error?: NodeRunError
}

export interface NodeProgressEvent extends BaseEvent {
  type: 'node.progress'
  nodeId: string
  /** 0–100 */
  progress: number
}

export interface NodeCandidatesEvent extends BaseEvent {
  type: 'node.candidates'
  nodeId: string
  candidates: AssetRef[]
}

export interface RunDoneEvent extends BaseEvent {
  type: 'run.done'
  status: RunStatus
  cost: RunCost
}

export type RunnerEvent
  = | RunStatusEvent
    | NodeStatusEvent
    | NodeProgressEvent
    | NodeCandidatesEvent
    | RunDoneEvent

// ============================================================================
// 重试 / 取消作用域（设计文档 §4.5）
// ============================================================================

export type RetryScope
  = | { kind: 'node', nodeIds: string[] }
    | { kind: 'failed-subtree', nodeId: string }
    | { kind: 'all-failed' }

// ============================================================================
// 初始状态工厂
// ============================================================================

export function idleNodeState(): NodeRunState {
  return { status: 'pending', candidates: [] }
}

export function idleRunState(
  id: string,
  workflowId: string,
  scope: RunScope,
  currency = 'CNY',
): RunState {
  return {
    id,
    workflowId,
    status: 'idle',
    scope,
    cost: { currency },
    nodes: {},
  }
}
