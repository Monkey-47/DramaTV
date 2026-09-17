import type { WorkflowGraph } from '@/features/graph/graph.types'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseWireEvent } from '@/features/runner/wire'
import { resetFakeBackend, setMockSpeed } from '../fake-backend'
import { server } from '../server'

/**
 * SSE 端点的集成测试：真跑一遍 MSW 的流式响应。
 *
 * jsdom 没有 `EventSource`，所以这里用 `fetch` 直接读流 —— 覆盖的是 handler 的
 * 分帧、`id:` 行、以及 `Last-Event-ID` 补齐这几件事，它们正是浏览器里最容易坏、
 * 又最难靠单测发现的部分。
 *
 * 用绝对 URL 是必要的：Node 的 fetch 解析不了相对路径（浏览器里可以）。
 * 且必须以 jsdom 的 origin 为前缀 —— handler 里的相对路径就是按它解析的，
 * 写成别的 host 会全部落到「未处理请求」上。
 */

const BASE = `${location.origin}/api/v1`

/** 运行的终止态 */
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'partial'])

const GRAPH: WorkflowGraph = {
  nodes: [
    { id: 'a', type: 'stub', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', type: 'stub', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [{ id: 'e1', source: { nodeId: 'a', portId: 'out' }, target: { nodeId: 'b', portId: 'in' } }],
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// 真实节奏下一次 run 要 1–4 秒，集成测试等不起；压缩到 1/6，事件顺序与内容不变
beforeEach(() => setMockSpeed(6))
afterEach(() => {
  server.resetHandlers()
  resetFakeBackend()
})
afterAll(() => {
  setMockSpeed(1)
  server.close()
})

async function submitRun(simulate?: { failNodeId?: string }): Promise<{ id: string }> {
  const response = await fetch(`${BASE}/workflows/wf_1/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: { kind: 'workflow' }, graph: GRAPH, ...(simulate ? { simulate } : {}) }),
  })
  expect(response.status).toBe(202)
  return (await response.json()) as { id: string }
}

interface Frame {
  id: number
  event: string
  data: unknown
}

/** 从流里读若干帧；读满 count、超时、或流关闭即停（连接是长开的，不会自然结束） */
async function readFrames(lastEventId: number | undefined, count: number, timeoutMs: number): Promise<Frame[]> {
  const controller = new AbortController()
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  if (lastEventId !== undefined) {
    headers['Last-Event-ID'] = String(lastEventId)
  }

  const response = await fetch(`${BASE}/projects/proj_1/events`, {
    headers,
    signal: controller.signal,
  })
  expect(response.headers.get('content-type')).toContain('text/event-stream')

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const frames: Frame[] = []
  const deadline = Date.now() + timeoutMs

  try {
    let buffer = ''

    while (frames.length < count && Date.now() < deadline) {
      // 不能只依赖 AbortController 取消：MSW 的流式响应不保证响应 abort，
      // reader.read() 会永远挂着。用 race 给每次读兜一个上限，超时就回去查 deadline。
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>(resolve => setTimeout(resolve, 200, null)),
      ])

      if (chunk === null) {
        continue
      }
      if (chunk.done) {
        break
      }

      buffer += decoder.decode(chunk.value, { stream: true })

      // SSE 以空行分帧
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1 && frames.length < count) {
        const raw = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)

        // 以 ':' 开头的是注释帧（保活心跳）
        if (!raw.startsWith(':')) {
          const idLine = raw.split('\n').find(l => l.startsWith('id: '))
          const eventLine = raw.split('\n').find(l => l.startsWith('event: '))
          const dataLine = raw.split('\n').find(l => l.startsWith('data: '))
          if (idLine && dataLine) {
            frames.push({
              id: Number(idLine.slice(4)),
              event: eventLine?.slice(7) ?? '',
              data: JSON.parse(dataLine.slice(6)),
            })
          }
        }
        separator = buffer.indexOf('\n\n')
      }
    }
  }
  catch {
    // 流被中断是预期的收尾方式之一
  }
  finally {
    controller.abort()
  }

  return frames
}

/** 轮询 run 直到满足条件或超时。比固定 sleep 稳，也不会因为调参而变慢。 */
async function waitForRun(
  runId: string,
  predicate: (state: { status: string, nodes: Record<string, { status: string }> }) => boolean,
  timeoutMs = 10_000,
): Promise<{ status: string, nodes: Record<string, { status: string }> }> {
  const deadline = Date.now() + timeoutMs
  let last: { status: string, nodes: Record<string, { status: string }> } | undefined

  while (Date.now() < deadline) {
    const response = await fetch(`${BASE}/runs/${runId}`)
    last = (await response.json()) as { status: string, nodes: Record<string, { status: string }> }
    if (predicate(last)) {
      return last
    }
    await new Promise(resolve => setTimeout(resolve, 120))
  }

  throw new Error(`等待 run 状态超时，最后状态：${JSON.stringify(last)}`)
}

describe('事件流端点（SSE）', () => {
  it('以 text/event-stream 响应，并逐帧带 id: 行', async () => {
    await submitRun()
    const frames = await readFrames(undefined, 3, 4000)
    expect(frames.length).toBeGreaterThanOrEqual(3)
    for (const frame of frames) {
      expect(Number.isFinite(frame.id)).toBe(true)
    }
  }, 8000)

  it('seq 单调递增', async () => {
    await submitRun()
    const frames = await readFrames(undefined, 5, 4000)
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]!.id).toBeGreaterThan(frames[i - 1]!.id)
    }
  }, 8000)

  it('data 行能被 parseWireEvent 解析（前后端线格式一致）', async () => {
    await submitRun()
    const frames = await readFrames(undefined, 3, 4000)
    for (const frame of frames) {
      expect(parseWireEvent(frame.data)).not.toBeNull()
    }
  }, 8000)

  it('event: 行与 data 里的 event 字段一致', async () => {
    await submitRun()
    const frames = await readFrames(undefined, 3, 4000)
    for (const frame of frames) {
      expect((frame.data as { event: string }).event).toBe(frame.event)
    }
  }, 8000)

  it('带 Last-Event-ID 时补发之后的事件（断线补齐）', async () => {
    const run = await submitRun({ failNodeId: 'a' })
    // 等这次 run 跑完，事件全部落进日志
    await waitForRun(run.id, s => s.status === 'partial')

    const all = await readFrames(0, 4, 4000)
    expect(all.length).toBeGreaterThanOrEqual(4)

    const midpoint = all[1]!.id
    const tail = await readFrames(midpoint, 2, 4000)

    expect(tail.length).toBeGreaterThanOrEqual(2)
    // 补发回来的第一条必须严格大于请求里的 Last-Event-ID
    expect(tail[0]!.id).toBeGreaterThan(midpoint)
    // 且与全量读取里 midpoint 之后的那条对得上
    expect(tail[0]!.id).toBe(all[2]!.id)
  }, 20000)

  it('失败的 run 会推出 partial 终止事件', async () => {
    await submitRun({ failNodeId: 'a' })
    // 读到 run.done 为止；不设固定帧数，因为事件条数随图大小变
    const frames = await readFrames(0, 200, 6000)
    const done = frames.find(f => f.event === 'run.done')
    expect(done).toBeDefined()
    expect((done!.data as { status: string }).status).toBe('partial')
  }, 15000)

  it('从 GET /runs/:id 能取到与事件流一致的最终状态', async () => {
    const run = await submitRun()
    // 必须等真正的终止态：run 在首个事件到达前是 idle，用「不是 running」当条件会立刻返回
    const state = await waitForRun(run.id, s => TERMINAL.has(s.status))
    expect(state.status).toBe('succeeded')
    expect(state.nodes.a?.status).toBe('succeeded')
    expect(state.nodes.b?.status).toBe('succeeded')
  }, 20000)

  it('取消后停止推流并落 cancelled', async () => {
    const run = await submitRun()
    await fetch(`${BASE}/runs/${run.id}/cancel`, { method: 'POST' })

    const state = await waitForRun(run.id, s => s.status === 'cancelled', 5000)
    expect(state.status).toBe('cancelled')
  }, 15000)
})

describe('提交 run 的参数校验', () => {
  it('缺少 graph 且无已保存版本时返回 400 错误信封', async () => {
    const response = await fetch(`${BASE}/workflows/wf_fresh/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: { kind: 'workflow' } }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string, retryable: boolean } }
    expect(body.error.code).toBe('GRAPH_REQUIRED')
    expect(body.error.retryable).toBe(false)
  })

  it('scope 非法时返回 400', async () => {
    const response = await fetch(`${BASE}/workflows/wf_1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: { kind: 'nonsense' }, graph: GRAPH }),
    })
    expect(response.status).toBe(400)
  })

  it('查询不存在的 run 返回 404', async () => {
    const response = await fetch(`${BASE}/runs/run_ghost`)
    expect(response.status).toBe(404)
  })
})
