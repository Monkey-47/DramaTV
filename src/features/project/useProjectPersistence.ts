/**
 * 把持久化接到项目 store 上（MVP 1.18）。
 *
 * 放在 composable 而不是 store 里，是为了守住设计文档 §5.1 的依赖方向：
 * store 只存状态与同步 mutate，碰外部世界（localStorage、将来的 HTTP）的
 * 事情由上层来编排。
 *
 * 用法：在画布页面顶层调一次。它会在挂载时灌入草稿，
 * 之后任何定义态改动都会在 2 秒空闲后自动落盘。
 */

import { onBeforeUnmount, watch } from 'vue'
import { useProjectStore } from '@/stores/project.store'
import { AUTOSAVE_DELAY_MS, clearProject, createAutosave, loadProject } from './persistence'

/** 同一个 projectId 只灌一次 —— 否则组件重挂载会把内存里的改动冲回磁盘旧版 */
const hydrated = new Set<string>()

export interface UseProjectPersistence {
  /** 立即落盘（顶栏「保存」用） */
  saveNow: () => void
  /** 放弃草稿，回到初始演示数据 */
  discardDraft: () => void
  /** 磁盘上是否已有草稿 */
  hasDraft: () => boolean
}

export function useProjectPersistence(projectId: string): UseProjectPersistence {
  const store = useProjectStore()

  // ── 灌入 ────────────────────────────────────────────────────────────────
  if (!hydrated.has(projectId)) {
    hydrated.add(projectId)
    const draft = loadProject(projectId)
    // 没有草稿（或草稿损坏）就回落到种子数据，不要白屏
    store.replaceWorkflows(draft ?? store.seedWorkflows())
  }

  const autosave = createAutosave(projectId, () => store.workflows)

  // deep：节点位置、参数、adopted 都在嵌套对象里，浅监听抓不到
  watch(
    () => store.workflows,
    () => autosave.schedule(),
    { deep: true },
  )

  /**
   * 关标签页前冲一次。
   *
   * 防抖窗口有 2 秒，用户拖完节点立刻关页面就会丢 —— 而"改完就走"恰恰
   * 是最常见的结束方式。beforeunload 是同步的，只能同步写 localStorage，
   * 这里正好合适。
   */
  function onBeforeUnload(): void {
    autosave.flush()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
    // 组件卸载（换项目、热更新）时也别丢
    autosave.flush()
  })

  return {
    saveNow: () => autosave.flush(),
    discardDraft: () => {
      autosave.cancel()
      clearProject(projectId)
      store.replaceWorkflows(store.seedWorkflows())
    },
    hasDraft: () => loadProject(projectId) !== undefined,
  }
}

/** 仅测试用：清掉「已灌入」标记，让下一次调用重新读磁盘 */
export function __resetHydration(): void {
  hydrated.clear()
}

export { AUTOSAVE_DELAY_MS }
