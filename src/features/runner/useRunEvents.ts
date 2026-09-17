import type { RunnerEvent } from './runner.types'
import { getCurrentInstance, onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import { useRunnerStore } from '@/stores/runner.store'
import { parseWireEvent } from './wire'

/**
 * SSE 消费端（设计文档 §5.5）。
 *
 * 连接的是**项目级单通道** `GET /projects/:id/events` —— 一条连接推该项目下所有 run 的事件。
 *
 * 认证走 Cookie 而非 Bearer：`EventSource` 无法自定义请求头，带不了 `Authorization`。
 * 也**不要**改成 URL query 传 token —— 那会进服务器访问日志、浏览器历史、Referer
 * （API 契约 §5.1）。
 *
 * 重连补齐由浏览器负责：断线后它会自动带上 `Last-Event-ID`（即最后一帧的 `id:` 行），
 * 后端据此补发。前端唯一要做的是别把 `id` 弄丢，所以 mock 端必须发 `id:` 行。
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface UseRunEventsOptions {
  /** 是否在组件挂载时自动连接（默认 true） */
  autoConnect?: boolean
}

export function useRunEvents(projectId: string, options: UseRunEventsOptions = {}) {
  const store = useRunnerStore()

  const status = ref<ConnectionStatus>('idle')
  /** 已收到的最大 seq。仅用于展示与排查，重连游标由浏览器管理。 */
  const lastSeq = ref(0)
  /** 解析失败被丢弃的事件数。持续增长说明前后端线格式对不上了。 */
  const droppedEvents = ref(0)

  let source: EventSource | undefined

  /** 待写入 store 的事件缓冲。攒到下一帧一次性 flush */
  let pending: RunnerEvent[] = []
  let rafId = 0

  /**
   * 事件进 store 的**唯一入口**：先攒进缓冲，由 rAF 每帧一次性写入。
   *
   * 设计文档 §5.5② 要求合帧；§8 风险 3 说「先做直连、压测后再决定是否加」。
   * 压测做完了，结论是**该加**：9 节点、进度事件密度拉到 77 条/秒时，
   * 直连版本主线程累计阻塞 4.6 秒、掉帧 4.5%、最差单帧 434ms。
   * 根因是每条事件都写一次 store → `runs` 换引用 → 渲染 meta 重算
   * → Vue Flow 全量 diff 节点 data，成本乘以事件数。
   *
   * 合帧后写入次数上限就是帧率（60/秒），且同一节点的多条进度会在
   * reduce 里被折叠掉中间态、只留最后一个值。
   *
   * mock 默认只有 3.3 条/秒，直连也不卡；但真实后端按百分比上报很容易到几十条，
   * 这个悬崖不该留着。
   */
  function commit(event: RunnerEvent): void {
    pending.push(event)
    if (rafId === 0) {
      rafId = requestAnimationFrame(flush)
    }
  }

  function flush(): void {
    rafId = 0
    if (pending.length === 0) {
      return
    }
    const batch = pending
    pending = []
    store.applyEvents(batch)
  }

  function handleMessage(raw: string): void {
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    }
    catch {
      droppedEvents.value += 1
      return
    }

    const event = parseWireEvent(payload)
    if (event === null) {
      droppedEvents.value += 1
      return
    }

    if (event.seq > lastSeq.value) {
      lastSeq.value = event.seq
    }
    commit(event)
  }

  function connect(): void {
    if (source !== undefined) {
      return
    }
    if (typeof EventSource === 'undefined') {
      // SSR / 测试环境没有 EventSource
      status.value = 'closed'
      return
    }

    status.value = 'connecting'
    const es = new EventSource(`/api/v1/projects/${encodeURIComponent(projectId)}/events`)
    source = es

    es.onopen = () => {
      status.value = 'open'
    }

    // 事件类型是 run.status / node.status / ... ，与后端的 `event:` 行一一对应。
    // 用 onmessage 只能收到无 event 行的默认消息，所以逐类型注册。
    const types = ['run.status', 'node.status', 'node.progress', 'node.candidates', 'run.done'] as const
    for (const type of types) {
      es.addEventListener(type, (e) => {
        handleMessage((e as MessageEvent<string>).data)
      })
    }

    // onerror 在断线时触发，EventSource 会自己重连
    es.onerror = () => {
      status.value = es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting'
    }
  }

  function disconnect(): void {
    if (source === undefined) {
      return
    }
    source.close()
    source = undefined
    status.value = 'closed'

    // 缓冲里可能还有没来得及 flush 的事件，丢掉会让 UI 少最后一帧的进度
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
    }
    flush()
  }

  if (options.autoConnect !== false) {
    if (getCurrentInstance() !== null) {
      onMounted(connect)
      onBeforeUnmount(disconnect)
    }
    else {
      connect()
    }
  }

  return {
    status: readonly(status),
    lastSeq: readonly(lastSeq),
    droppedEvents: readonly(droppedEvents),
    connect,
    disconnect,
  }
}
