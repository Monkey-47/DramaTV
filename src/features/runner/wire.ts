import type { AssetRef, NodeRunError, NodeRunStatus, RunCost, RunnerEvent, RunStatus } from './runner.types'

/**
 * SSE 线格式 → 内部事件的解析层。
 *
 * 线上格式与内部类型有几处刻意的差异，全部在这里一次性抹平（而不是散到各处）：
 *
 *   1. 时间戳线上叫 `ts`，内部叫 `at`
 *   2. **进度单位不同**：线上是 0..1（API 契约 §5.3 `"progress": 0.35`），
 *      内部统一成 0–100（ui-design-spec 的进度条按百分比渲染）。
 *      换算只在边界做一次，域内只有一种单位。
 *   3. 线上 `error: null` 表示"无错误"，内部用「字段不存在」表达
 *      （tsconfig 的 exactOptionalPropertyTypes 不接受显式 undefined）
 *   4. 线上带 `workflowId`，内部不带 —— reducer 按 runId 路由，run 自己记得 workflowId
 *
 * 任何解析失败都返回 null 而不是抛错：这是一条长连接，一条脏数据不该让整条流崩掉。
 */

const RUN_STATUSES: ReadonlySet<string> = new Set<RunStatus>([
  'idle',
  'submitting',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'partial',
])

const NODE_STATUSES: ReadonlySet<string> = new Set<NodeRunStatus>([
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
])

const EVENT_TYPES = new Set([
  'run.status',
  'node.status',
  'node.progress',
  'node.candidates',
  'run.done',
])

// ── 窄化辅助 ────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseCost(value: unknown): RunCost | undefined {
  if (!isRecord(value))
    return undefined
  const currency = asString(value.currency)
  if (currency === undefined)
    return undefined

  const estimated = asNumber(value.estimated)
  const actual = asNumber(value.actual)

  return {
    currency,
    ...(estimated !== undefined ? { estimated } : {}),
    ...(actual !== undefined ? { actual } : {}),
  }
}

function parseError(value: unknown): NodeRunError | undefined {
  // 线上用 null 表示"无错误"
  if (value === null || value === undefined)
    return undefined
  if (!isRecord(value))
    return undefined

  const code = asString(value.code)
  const message = asString(value.message)
  if (code === undefined || message === undefined)
    return undefined

  return { code, message, retryable: value.retryable === true }
}

/** 丢弃缺字段的候选，而不是让一条脏数据毁掉整批 */
function parseCandidates(value: unknown): AssetRef[] | undefined {
  if (!Array.isArray(value))
    return undefined

  const out: AssetRef[] = []
  for (const item of value) {
    if (!isRecord(item))
      continue
    const assetId = asString(item.assetId)
    const url = asString(item.url)
    const mime = asString(item.mime)
    if (assetId === undefined || url === undefined || mime === undefined)
      continue

    const width = asNumber(item.width)
    const height = asNumber(item.height)
    const duration = asNumber(item.duration)

    out.push({
      assetId,
      url,
      mime,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(duration !== undefined ? { duration } : {}),
    })
  }
  return out
}

/** 线上 0..1 → 内部 0–100，并夹紧到合法区间 */
function toPercent(value: number): number {
  const percent = value * 100
  if (percent < 0)
    return 0
  if (percent > 100)
    return 100
  return percent
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

export function parseWireEvent(raw: unknown): RunnerEvent | null {
  if (!isRecord(raw))
    return null

  const seq = asNumber(raw.seq)
  const runId = asString(raw.runId)
  const type = asString(raw.event)

  if (seq === undefined || runId === undefined || type === undefined)
    return null
  if (!EVENT_TYPES.has(type))
    return null

  // 缺时间戳时回退到 0 而不是整条丢弃 —— 重连补齐的事件可能不带 ts
  const at = asNumber(raw.ts) ?? 0
  const base = { seq, runId, at }

  switch (type) {
    case 'run.status': {
      const status = asString(raw.status)
      if (status === undefined || !RUN_STATUSES.has(status))
        return null
      const cost = parseCost(raw.cost)
      return {
        ...base,
        type: 'run.status',
        status: status as RunStatus,
        ...(cost !== undefined ? { cost } : {}),
      }
    }

    case 'node.status': {
      const nodeId = asString(raw.nodeId)
      const status = asString(raw.status)
      if (nodeId === undefined || status === undefined || !NODE_STATUSES.has(status))
        return null

      const error = parseError(raw.error)
      return {
        ...base,
        type: 'node.status',
        nodeId,
        status: status as NodeRunStatus,
        // 显式判 undefined 而非直接赋值 —— false 是有效值，必须保留
        ...(typeof raw.reused === 'boolean' ? { reused: raw.reused } : {}),
        ...(error !== undefined ? { error } : {}),
      }
    }

    case 'node.progress': {
      const nodeId = asString(raw.nodeId)
      const progress = asNumber(raw.progress)
      if (nodeId === undefined || progress === undefined)
        return null
      return { ...base, type: 'node.progress', nodeId, progress: toPercent(progress) }
    }

    case 'node.candidates': {
      const nodeId = asString(raw.nodeId)
      const candidates = parseCandidates(raw.candidates)
      if (nodeId === undefined || candidates === undefined)
        return null
      return { ...base, type: 'node.candidates', nodeId, candidates }
    }

    case 'run.done': {
      const status = asString(raw.status)
      if (status === undefined || !RUN_STATUSES.has(status))
        return null
      const cost = parseCost(raw.cost)
      return {
        ...base,
        type: 'run.done',
        status: status as RunStatus,
        cost: cost ?? { currency: 'CNY' },
      }
    }

    default:
      return null
  }
}
