import type { WorkflowGraph } from '@/features/graph/graph.types'
import type { RunScope } from '@/features/runner/runner.types'
import { http, HttpResponse } from 'msw'
import {
  cancelFakeRun,
  eventsAfter,
  getFakeRun,
  submitFakeRun,
  subscribe,
} from './fake-backend'
import { encodeMessageFrame, SSE_KEEPALIVE } from './wire-serialize'

/**
 * MSW 请求处理器 —— 按 API 契约实现前端用到的那几个端点。
 *
 * 走网络层而不是在业务代码里塞假数据：将来接真后端时，只需停掉 worker，
 * 业务代码一行不用改（设计文档 §6 技术栈选 MSW 的理由）。
 */

const BASE = '/api/v1'

/** 后端保存的图。契约里 POST runs 的 graph 是可选的，省略则取已保存版本。 */
const savedGraphs = new Map<string, WorkflowGraph>()

interface SubmitRunBody {
  scope?: RunScope
  graph?: WorkflowGraph
  simulate?: { failNodeId?: string }
}

/** 契约统一的错误信封（API 契约 §1） */
function errorResponse(status: number, code: string, message: string, retryable = false) {
  return HttpResponse.json({ error: { code, message, retryable } }, { status })
}

function isValidScope(value: unknown): value is RunScope {
  if (typeof value !== 'object' || value === null)
    return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'node' || kind === 'downstream' || kind === 'workflow'
}

export const handlers = [
  /** 提交一次 run。契约里这是最高频的端点（API 契约 §4）。 */
  http.post(`${BASE}/workflows/:id/runs`, async ({ params, request }) => {
    const workflowId = String(params.id)
    const body = (await request.json().catch(() => null)) as SubmitRunBody | null

    if (body === null || !isValidScope(body.scope)) {
      return errorResponse(400, 'INVALID_SCOPE', 'scope 缺失或非法')
    }

    if (body.graph !== undefined) {
      savedGraphs.set(workflowId, body.graph)
    }
    const graph = body.graph ?? savedGraphs.get(workflowId)

    if (graph === undefined) {
      // mock 没有持久化后端，只能依赖请求带上图快照
      return errorResponse(400, 'GRAPH_REQUIRED', 'mock 后端需要请求体带上 graph 快照')
    }

    const run = submitFakeRun({
      workflowId,
      scope: body.scope,
      graph,
      ...(body.simulate?.failNodeId !== undefined ? { failNodeId: body.simulate.failNodeId } : {}),
    })

    return HttpResponse.json(run, { status: 202 })
  }),

  /** 运行详情。页面刷新后靠它重建首屏（SSE 只推增量）。 */
  http.get(`${BASE}/runs/:id`, ({ params }) => {
    const run = getFakeRun(String(params.id))
    if (run === undefined) {
      return errorResponse(404, 'RUN_NOT_FOUND', '运行不存在')
    }
    return HttpResponse.json(run)
  }),

  /** 取消运行 */
  http.post(`${BASE}/runs/:id/cancel`, ({ params }) => {
    const ok = cancelFakeRun(String(params.id))
    if (!ok) {
      return errorResponse(404, 'RUN_NOT_FOUND', '运行不存在')
    }
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * 项目级 SSE 单通道。
   *
   * 一条连接推该项目下所有 run 的事件 —— 按 run 订阅会在多工作流并行时撞上
   * 浏览器同域 6 条连接的限制（API 契约 §5.1）。
   */
  http.get(`${BASE}/projects/:id/events`, ({ request }) => {
    // 重连时浏览器自动带上 Last-Event-ID；首连没有，视为 0
    const rawLastId = request.headers.get('Last-Event-ID')
    const lastEventId = rawLastId === null ? 0 : Number(rawLastId) || 0

    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | undefined
    let keepalive: ReturnType<typeof setInterval> | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false

        const write = (chunk: string): void => {
          if (closed)
            return
          try {
            controller.enqueue(encoder.encode(chunk))
          }
          catch {
            // 客户端已经断开：停掉保活与订阅，避免泄漏
            closed = true
            clearInterval(keepalive)
            unsubscribe?.()
          }
        }

        // 先把断线期间漏掉的事件补齐，再接上实时流 —— 顺序不能反，
        // 否则新事件会插到补发事件前面（设计文档 §9.1）
        for (const message of eventsAfter(lastEventId)) {
          write(encodeMessageFrame(message))
        }

        unsubscribe = subscribe((message) => {
          write(encodeMessageFrame(message))
        })

        // 30s 注释行保活，防止代理掐掉闲置连接（API 契约 §5.4）
        keepalive = setInterval(write, 30_000, SSE_KEEPALIVE)
      },

      cancel() {
        clearInterval(keepalive)
        unsubscribe?.()
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // 关闭 MSW/中间层对 SSE 的缓冲
        'X-Accel-Buffering': 'no',
      },
    })
  }),
]
