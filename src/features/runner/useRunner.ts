import type { RunScope, RunState } from './runner.types'
import type { WorkflowGraph } from '@/features/graph/graph.types'
import { ref } from 'vue'
import { useRunnerStore } from '@/stores/runner.store'
import { ApiError, cancelRunRequest, submitRun } from './runs.api'
import { useRunEvents } from './useRunEvents'

/**
 * 执行编排层 —— 把 REST 提交、SSE 消费、store 写入串起来。
 *
 * 设计文档 §6.4：store 不调 API，异步在 composable。这里是那层 composable。
 *
 * **runId 的归属**：不能先本地建 run 再提交。SSE 事件带的是后端 runId，
 * 本地自己造一个 id 的话，事件回来时 `applyEvent` 认不出、整条流全被丢弃。
 * 所以顺序必须是「先 POST 拿真身 → 再 hydrateRun」。
 */

export interface UseRunnerResult {
  /** SSE 连接状态，用于顶栏提示断线 */
  connection: ReturnType<typeof useRunEvents>['status']
  /** 解析失败被丢弃的事件数 */
  droppedEvents: ReturnType<typeof useRunEvents>['droppedEvents']
  /** 最近一次提交失败的原因 */
  lastError: ReturnType<typeof ref<string | undefined>>
  submit: (workflowId: string, scope: RunScope, graph: WorkflowGraph, simulate?: { failNodeId?: string }) => Promise<void>
  cancel: (runId: string) => Promise<void>
}

export function useRunner(projectId: string): UseRunnerResult {
  const store = useRunnerStore()
  const { status: connection, droppedEvents } = useRunEvents(projectId)

  const lastError = ref<string | undefined>(undefined)

  async function submit(
    workflowId: string,
    scope: RunScope,
    graph: WorkflowGraph,
    simulate?: { failNodeId?: string },
  ): Promise<void> {
    lastError.value = undefined
    try {
      const payload = simulate !== undefined
        ? { scope, graph, simulate }
        : { scope, graph }

      const submitted: RunState = await submitRun(workflowId, payload)
      // hydrate 之后，带同一个 runId 的 SSE 事件才会被 store 认领
      store.hydrateRun(submitted)
    }
    catch (error) {
      lastError.value = error instanceof ApiError
        ? `${error.code}：${error.message}`
        : error instanceof Error ? error.message : '提交失败'
      throw error
    }
  }

  async function cancel(runId: string): Promise<void> {
    // 本地先落状态让 UI 立刻响应，再发请求；后端也会推 cancelled 事件覆盖
    store.cancelRun(runId)
    try {
      await cancelRunRequest(runId)
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : '取消失败'
    }
  }

  return { connection, droppedEvents, lastError, submit, cancel }
}
