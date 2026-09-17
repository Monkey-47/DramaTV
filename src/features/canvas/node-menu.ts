/**
 * 节点右键菜单的内容 —— 纯函数，无 Vue、无 DOM。
 *
 * 设计文档 §6.1 的「智能菜单」：菜单项随节点状态变化，而不是把所有功能
 * 一次性摊开。理由很简单 —— 菜单是快捷入口，不是功能大全。
 * 刚跑完的人需要的是「冻结这一张」，失败了的人需要的是「重试」，
 * 空闲的人需要的是「运行」。把这三套混在一起，谁都得先扫一遍才能找到自己要的。
 *
 * 长度硬约束：5–8 项。超了就说明在往菜单里塞功能，该挪到别处。
 */

import type { NodeRenderMeta } from './mapping.types'
import type { NodeStatus } from '@/shared/constants/theme'

/** 菜单需要知道的节点状态。字段全部可选 —— 缺省即「没有这条信息」。 */
export interface MenuContext {
  /** 运行态（设计文档 §4.2）。'idle' 与 undefined 等价，都表示没跑过 */
  status?: NodeStatus
  /** 定义态：已采用产出且被锁定（`node.adopted.frozen`） */
  frozen?: boolean
  /** 定义态：有已采用的产出（`node.adopted !== undefined`） */
  hasAdopted?: boolean
  /** 本轮跑出了候选可选 */
  hasCandidates?: boolean
  /** 候选数量，用于「查看候选（4 个）」 */
  candidateCount?: number
  /**
   * 后端给的可重试标记（设计文档 §4.5）。
   *
   * **前端不做重试决策，只展示后端给的结果。** 生成类失败永不自动重试
   * （重试就是直接烧钱），所以 `retryable !== true` 时重试项置灰而不是隐藏 ——
   * 隐藏会让用户以为这个功能不存在，置灰加原因才说明「不是不能，是不该」。
   */
  retryable?: boolean
}

export interface MenuItem {
  key: string
  label: string
  /** 左列的图标，单独一列便于对齐 */
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  /** 置灰原因。渲染成 label 下方的说明文字，不藏 tooltip */
  disabledReason?: string
}

export interface MenuSection {
  /** 省略则不渲染分组标题，只留一条分隔线 */
  title?: string
  items: MenuItem[]
}

/** 视为「正在跑」的状态 —— 这些状态下该给的是「停止」而不是「运行」 */
function isBusy(status: NodeStatus | undefined): boolean {
  return status === 'running' || status === 'queued' || status === 'pending'
}

/**
 * 从画布手上已有的数据组装菜单上下文。
 *
 * 两条来源合流：运行态在 `meta` 里（来自 runner store），
 * 定义态在 `node.adopted` 里（来自 project store）。菜单需要同时看两边 ——
 * 「能不能冻结」问的是定义态，「现在在不在跑」问的是运行态。
 */
export interface NodeMenuSource {
  meta?: NodeRenderMeta | undefined
  /** `GraphNode.adopted`，只有「有没有采用」和「锁没锁」两件事是菜单关心的 */
  adopted?: { frozen: boolean } | undefined
}

export function menuContextFrom(source: NodeMenuSource): MenuContext {
  const meta = source.meta
  const adopted = source.adopted
  const candidateCount = meta?.candidateCount

  return {
    ...(meta?.status !== undefined ? { status: meta.status } : {}),
    // 冻结以定义态为准，运行态的 meta.frozen 只是它的渲染投影
    frozen: adopted?.frozen === true,
    hasAdopted: adopted !== undefined,
    hasCandidates: candidateCount !== undefined && candidateCount > 0,
    ...(candidateCount !== undefined ? { candidateCount } : {}),
    ...(meta?.retryable !== undefined ? { retryable: meta.retryable } : {}),
  }
}

/**
 * 构建菜单。
 *
 * 分两段（不带标题，靠分隔线区分）：
 *   1. 运行相关 —— 当前状态下的「下一步」
 *   2. 节点编辑 —— 与运行态无关的通用操作
 */
export function buildNodeMenu(ctx: MenuContext): MenuSection[] {
  const runItems: MenuItem[] = []

  // ── 主操作 ────────────────────────────────────────────────────────────
  if (isBusy(ctx.status)) {
    runItems.push({ key: 'stopNode', label: '停止运行', icon: '■' })
  }
  else if (ctx.status === 'failed') {
    const retryable = ctx.retryable === true
    runItems.push({
      key: 'retryNode',
      label: '重试运行',
      icon: '🔄',
      disabled: !retryable,
      ...(retryable ? {} : { disabledReason: '该失败不可重试（生成类失败重试会直接产生费用）' }),
    })
  }
  else if (ctx.status === 'succeeded') {
    runItems.push({ key: 'runNode', label: '重新运行此节点', icon: '▶' })
  }
  else {
    runItems.push({ key: 'runNode', label: '运行此节点', icon: '▶' })
  }

  // ── 冻结 / 解冻 ──────────────────────────────────────────────────────
  // 冻结的是「产出」不是「节点」，所以没有已采用产出时不给这个入口。
  if (ctx.frozen === true) {
    runItems.push({ key: 'unfreezeNode', label: '解冻', icon: '🔓' })
  }
  else if (ctx.hasAdopted === true && ctx.status === 'succeeded') {
    runItems.push({ key: 'adoptFrozen', label: '冻结已选候选', icon: '🔒' })
  }

  // ── 候选 ──────────────────────────────────────────────────────────────
  if (ctx.hasCandidates === true) {
    const n = ctx.candidateCount
    runItems.push({
      key: 'openCandidates',
      label: n !== undefined && n > 0 ? `查看候选（${n} 个）` : '查看候选',
      icon: '▦',
    })
  }

  // ── 历史与日志 ────────────────────────────────────────────────────────
  // 失败时优先给日志（那是当下最需要的），其余情况给历史。
  if (ctx.status === 'failed') {
    runItems.push({ key: 'viewErrorLog', label: '查看错误日志', icon: '🐛' })
  }
  else if (ctx.hasAdopted === true || ctx.status === 'succeeded' || ctx.frozen === true) {
    runItems.push({ key: 'viewRunHistory', label: '查看历史运行', icon: '📜' })
  }

  // ── 编辑区（与运行态无关）─────────────────────────────────────────────
  const editItems: MenuItem[] = [
    { key: 'copyNodeParams', label: '复制参数 JSON', icon: '📋' },
    { key: 'duplicateNode', label: '复制节点', icon: '⧉' },
    { key: 'renameNode', label: '重命名', icon: '✏️', shortcut: 'F2' },
    { key: 'removeNode', label: '删除', icon: '🗑', shortcut: 'Del', danger: true },
  ]

  return [
    { items: runItems },
    { items: editItems },
  ]
}
