/**
 * 工作流持久化（MVP 1.18）。
 *
 * 现阶段落 localStorage，但**载荷形状对齐 API 契约**（§3 `PUT /workflows/:id`
 * 全量覆盖），这样将来换成真后端时只是把 `saveProject` 的实现换掉，调用方不动。
 *
 * ── 一条硬性验收（设计文档 §10）──────────────────────────────────────────
 * **保存工作流时不序列化任何运行态与 UI 态。**
 *
 * 运行态（status / candidates / progress / error / reused）属于 NodeRunState，
 * 由 runner store 按 runId 持有；UI 态（selected / hovered / dragging / collapsed）
 * 属于 Vue Flow 内部。两者都不该跟着图落盘 —— 落盘了就会在下次打开时
 * 显示上次的幽灵状态。
 *
 * 所以这里**用白名单重建**而不是黑名单删除：只有显式列出的字段能进载荷。
 * 黑名单会在新增字段时漏掉，白名单不会。
 */

import type { GraphEdge, GraphNode, Workflow, WorkflowGraph, WorkflowPlacement } from '@/features/graph/graph.types'

/** localStorage 键前缀 */
const KEY_PREFIX = 'dramatv:project:'

/** 当前载荷版本。将来形状变了靠它做迁移。 */
export const PAYLOAD_VERSION = 1

/**
 * 运行态 / UI 态键名。
 *
 * 用途有二：一是 `data` 里出现的这些键会被剔除；二是测试直接引用这个常量，
 * 保证「哪些算脏数据」这件事只有一个定义。
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  // 运行态（NodeRunState）
  'status',
  'candidates',
  'progress',
  'error',
  'reused',
  'startedAt',
  'finishedAt',
  // UI 态（Vue Flow 内部）
  'selected',
  'hovered',
  'dragging',
  'collapsed',
  'dimensions',
  'computedPosition',
  'resizing',
]

/** 与 API 契约的 Workflow 实体对齐 */
export interface WorkflowPayload {
  id: string
  name: string
  placement: WorkflowPlacement
  graph: WorkflowGraph
}

export interface ProjectPayload {
  version: number
  id: string
  updatedAt: string
  workflows: WorkflowPayload[]
}

// ── 序列化 ────────────────────────────────────────────────────────────────

/** 剔除 `data` 里的运行态 / UI 态。节点参数本身是用户输入，保留。 */
function scrubParams(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      continue
    }
    out[key] = value
  }
  return out
}

/**
 * 白名单重建一个节点。
 *
 * 不用 `{ ...node }` 再删 —— 拿到的 `node` 可能是 Vue Flow 处理过的对象，
 * 上面挂着 `dimensions` / `computedPosition` 之类；白名单能一次挡掉，
 * 而且将来 Vue Flow 加新字段时不会意外漏进来。
 */
export function serializeNode(node: GraphNode): GraphNode {
  const out: GraphNode = {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: scrubParams(node.data),
  }

  // adopted 是**用户决定**（定义态），必须持久化（设计文档 §3.2）
  if (node.adopted !== undefined) {
    out.adopted = { assetId: node.adopted.assetId, frozen: node.adopted.frozen }
  }

  return out
}

function serializeEdge(edge: GraphEdge): GraphEdge {
  return {
    id: edge.id,
    source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
    target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
  }
}

function serializeWorkflow(wf: Workflow): WorkflowPayload {
  return {
    id: wf.id,
    name: wf.name,
    placement: {
      x: wf.placement.x,
      y: wf.placement.y,
      ...(wf.placement.color !== undefined ? { color: wf.placement.color } : {}),
    },
    graph: {
      nodes: wf.graph.nodes.map(serializeNode),
      edges: wf.graph.edges.map(serializeEdge),
    },
  }
}

export function toPayload(projectId: string, workflows: Workflow[], now = new Date()): ProjectPayload {
  return {
    version: PAYLOAD_VERSION,
    id: projectId,
    updatedAt: now.toISOString(),
    workflows: workflows.map(serializeWorkflow),
  }
}

// ── 反序列化 ──────────────────────────────────────────────────────────────

/**
 * 读回时再洗一遍。
 *
 * 磁盘上的数据可能是旧版本、或被人手改过。不信任外部输入的纪律，
 * 和写出去时一样。
 */
function deserializeWorkflow(raw: unknown): Workflow | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const wf = raw as Partial<WorkflowPayload>
  if (typeof wf.id !== 'string' || typeof wf.name !== 'string' || wf.placement === undefined) {
    return undefined
  }

  const graph = wf.graph
  const nodes = Array.isArray(graph?.nodes)
    ? graph.nodes.filter(n => typeof n?.id === 'string' && typeof n?.type === 'string').map(serializeNode)
    : []
  const edges = Array.isArray(graph?.edges)
    ? graph.edges.filter(e => e?.source?.nodeId !== undefined && e?.target?.nodeId !== undefined).map(serializeEdge)
    : []

  return {
    id: wf.id,
    name: wf.name,
    placement: {
      x: Number(wf.placement.x) || 0,
      y: Number(wf.placement.y) || 0,
      ...(wf.placement.color !== undefined ? { color: wf.placement.color } : {}),
    },
    graph: { nodes, edges },
  }
}

export function fromPayload(raw: unknown): Workflow[] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const payload = raw as Partial<ProjectPayload>
  if (!Array.isArray(payload.workflows)) {
    return undefined
  }
  return payload.workflows
    .map(deserializeWorkflow)
    .filter((wf): wf is Workflow => wf !== undefined)
}

// ── 读写 ──────────────────────────────────────────────────────────────────

function storage(): Storage | undefined {
  // SSR / 测试环境可能没有 localStorage
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  }
  catch {
    return undefined
  }
}

export function storageKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`
}

/** 保存。写失败（配额满 / 隐私模式）不应让画布崩掉。 */
export function saveProject(projectId: string, workflows: Workflow[]): boolean {
  const store = storage()
  if (store === undefined) {
    return false
  }
  try {
    store.setItem(storageKey(projectId), JSON.stringify(toPayload(projectId, workflows)))
    return true
  }
  catch {
    // 配额溢出等情况：草稿保存失败不该打断用户
    return false
  }
}

/** 读取。数据损坏时返回 undefined，让调用方回落到种子数据。 */
export function loadProject(projectId: string): Workflow[] | undefined {
  const store = storage()
  if (store === undefined) {
    return undefined
  }
  const raw = store.getItem(storageKey(projectId))
  if (raw === null) {
    return undefined
  }
  try {
    return fromPayload(JSON.parse(raw))
  }
  catch {
    // JSON 坏了就当没有草稿，别把整个画布卡在白屏
    return undefined
  }
}

export function clearProject(projectId: string): void {
  storage()?.removeItem(storageKey(projectId))
}

// ── 防抖自动保存 ──────────────────────────────────────────────────────────

/**
 * 防抖自动保存（设计文档 §5.6：草稿自动保存，防止浏览器崩溃丢失画布）。
 *
 * 2 秒是「用户停止操作」的经验值：拖节点时每帧都写 localStorage 是浪费，
 * 而 2 秒的窗口里即使崩溃也最多丢一次操作。
 */
export const AUTOSAVE_DELAY_MS = 2000

export interface Autosave {
  /** 请求一次延迟保存（重复调用会重置计时） */
  schedule: () => void
  /** 立即落盘并取消待执行的保存 */
  flush: () => void
  /** 取消待执行的保存（不落盘） */
  cancel: () => void
  /** 是否有待执行的保存 */
  isPending: () => boolean
}

export function createAutosave(
  projectId: string,
  getWorkflows: () => Workflow[],
  delayMs = AUTOSAVE_DELAY_MS,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function flush(): void {
    cancel()
    saveProject(projectId, getWorkflows())
  }

  return {
    schedule(): void {
      cancel()
      timer = setTimeout(() => {
        timer = undefined
        saveProject(projectId, getWorkflows())
      }, delayMs)
    },
    flush,
    cancel,
    isPending: () => timer !== undefined,
  }
}
