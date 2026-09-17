/**
 * 画布内的操作通道。
 *
 * 为什么用 provide/inject 而不是把回调塞进 node data：
 * mapping.renderProject() 是纯函数，往 data 里塞函数会让它凭空多一份副作用通道，
 * 也会让「节点 data 就是 GraphNode 的投影」这条不变式变模糊。
 *
 * 为什么节点组件不直接调 store：
 * features/canvas 不该认识应用级 store（设计文档 §5.1 的依赖方向）。
 * 画布只负责"用户点了删除"，至于删了之后状态怎么变，由 view 层决定。
 */

import type { InjectionKey } from 'vue'

/** 右键菜单里点出来的动作。key 与 node-menu.ts 里 MenuItem.key 一一对应 */
export interface CanvasActions {
  // ── 分区 ────────────────────────────────────────────────────────────────
  /** 删除整个工作流分区 */
  removeWorkflow: (workflowId: string) => void
  /** 重命名工作流分区 */
  renameWorkflow: (workflowId: string, name: string) => void
  /** 新建一个空分区 */
  addWorkflow: () => void

  // ── 节点：打开面板 ──────────────────────────────────────────────────────
  /** 打开节点的详细配置弹窗（单击节点触发） */
  openNodeConfig: (nodeId: string) => void
  /** 打开候选集面板 */
  openNodeCandidates: (nodeId: string) => void
  /** 在指针位置打开右键菜单。坐标是视口坐标 */
  openNodeMenu: (nodeId: string, clientX: number, clientY: number) => void

  // ── 节点：运行相关 ──────────────────────────────────────────────────────
  /** 只跑这一个节点（上游走缓存） */
  runNode: (nodeId: string) => void
  /** 停止该节点所在 run 里这个节点的执行 */
  stopNode: (nodeId: string) => void
  /** 冻结已采用的产出 —— 重跑不再覆盖它 */
  adoptFrozen: (nodeId: string) => void
  /** 解冻 */
  unfreezeNode: (nodeId: string) => void
  /** 重跑失败的节点。可重试性由后端标记决定，见 node-menu.ts */
  retryNode: (nodeId: string) => void
  /** 查看该节点的运行历史 */
  viewRunHistory: (nodeId: string) => void
  /** 查看该节点的错误日志 */
  viewErrorLog: (nodeId: string) => void

  // ── 节点：编辑 ──────────────────────────────────────────────────────────
  /** 复制节点（连同参数） */
  duplicateNode: (nodeId: string) => void
  /** 重命名节点 */
  renameNode: (nodeId: string) => void
  /** 复制节点参数为 JSON */
  copyNodeParams: (nodeId: string) => void
  /** 删除节点。连带清理引用它的边由 store 负责 */
  removeNode: (nodeId: string) => void
}

export const CANVAS_ACTIONS: InjectionKey<CanvasActions> = Symbol('canvas-actions')
