import type { RunScope, RunState } from './runner.types'
import type { WorkflowGraph } from '@/features/graph/graph.types'

/**
 * 运行相关的 REST 调用。
 *
 * 设计文档 §6.4：**store 只存状态，异步请求放 composable / api 层。**
 * 这里是纯异步函数，不碰 store —— 调用方拿到结果再写进去。
 *
 * 用原生 `fetch` 而不是设计文档提到的 `ofetch`：后者还没装，为几个请求引入
 * 一个依赖不划算。若要换，改动只在这个文件里。
 */

const BASE = '/api/v1'

/** 契约统一的错误信封（API 契约 §1） */
export class ApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(params: { code: string, message: string, retryable: boolean, status: number }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.retryable = params.retryable
    this.status = params.status
  }
}

interface ErrorEnvelope {
  error?: { code?: unknown, message?: unknown, retryable?: unknown }
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope = {}
  try {
    envelope = (await response.json()) as ErrorEnvelope
  }
  catch {
    // 非 JSON 响应（网关错误页之类）也不该让调用方拿到一个裸的 SyntaxError
  }

  const code = typeof envelope.error?.code === 'string' ? envelope.error.code : 'UNKNOWN'
  const message = typeof envelope.error?.message === 'string' ? envelope.error.message : `请求失败（HTTP ${response.status}）`
  const retryable = envelope.error?.retryable === true

  return new ApiError({ code, message, retryable, status: response.status })
}

export interface SubmitRunPayload {
  scope: RunScope
  /** 图快照。契约里可选（省略则后端取已保存版本），但 mock 后端依赖它。 */
  graph?: WorkflowGraph
  /** 让 mock 演练部分失败（设计文档 §4.4）。真实后端会忽略它。 */
  simulate?: { failNodeId?: string }
}

/** `POST /workflows/:id/runs` —— 契约里标注为最高频的端点 */
export async function submitRun(workflowId: string, payload: SubmitRunPayload): Promise<RunState> {
  const response = await fetch(`${BASE}/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }
  return (await response.json()) as RunState
}

/** `GET /runs/:id` —— 页面刷新后重建首屏（SSE 只推增量） */
export async function fetchRun(runId: string): Promise<RunState> {
  const response = await fetch(`${BASE}/runs/${encodeURIComponent(runId)}`)
  if (!response.ok) {
    throw await toApiError(response)
  }
  return (await response.json()) as RunState
}

/** `POST /runs/:id/cancel` */
export async function cancelRunRequest(runId: string): Promise<void> {
  const response = await fetch(`${BASE}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
}
