import type { RunnerEvent } from '@/features/runner/runner.types'

/**
 * 内部事件 → SSE 线格式的序列化。是 `features/runner/wire.ts` 里 `parseWireEvent` 的逆运算，
 * 两者配对使用，不变量由 `__tests__/wire-roundtrip.test.ts` 的往返测试守住。
 *
 * 只有 mock 层需要序列化（真实后端由服务端产出线格式），所以它放在 mocks 下，
 * 不污染 runner 的生产代码。
 */

export interface WireEventMessage {
  seq: number
  workflowId: string
  runId: string
  event: string
  ts: number
  /** 其余字段随事件类型而异；用索引签名避免逐类型枚举 */
  [key: string]: unknown
}

/** 内部 0–100 → 线上 0..1 */
function toRatio(percent: number): number {
  return percent / 100
}

export function toWireEvent(event: RunnerEvent, workflowId: string): WireEventMessage {
  const base = {
    seq: event.seq,
    workflowId,
    runId: event.runId,
    event: event.type,
    ts: event.at,
  }

  switch (event.type) {
    case 'run.status':
      return {
        ...base,
        status: event.status,
        ...(event.cost !== undefined ? { cost: event.cost } : {}),
      }

    case 'node.status':
      return {
        ...base,
        nodeId: event.nodeId,
        status: event.status,
        // 契约示例里 reused 与 error 是常驻字段，error 用 null 表示"无错误"
        ...(event.reused !== undefined ? { reused: event.reused } : {}),
        error: event.error ?? null,
      }

    case 'node.progress':
      return { ...base, nodeId: event.nodeId, progress: toRatio(event.progress) }

    case 'node.candidates':
      return { ...base, nodeId: event.nodeId, candidates: event.candidates }

    case 'run.done':
      return { ...base, status: event.status, cost: event.cost }
  }
}

/**
 * 把一条已序列化的报文编码成一帧 SSE（含 id: 与 event: 行，以及结尾空行）。
 *
 * `id:` 行必须是 seq —— 浏览器重连时自动把它放进 `Last-Event-ID`，
 * 后端据此补发之后的事件（API 契约 §5.2）。这是断线补齐的唯一依据。
 */
export function encodeMessageFrame(message: WireEventMessage): string {
  return `id: ${message.seq}\nevent: ${message.event}\ndata: ${JSON.stringify(message)}\n\n`
}

/** 把一条内部事件编码成一帧 SSE 报文 */
export function encodeSseFrame(event: RunnerEvent, workflowId: string): string {
  return encodeMessageFrame(toWireEvent(event, workflowId))
}

/** 心跳帧：注释行保活，防止代理断连（API 契约 §5.4） */
export const SSE_KEEPALIVE = ': keepalive\n\n'
