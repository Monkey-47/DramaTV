/**
 * UI 设计令牌 —— 规范附录 A 的单一真源。
 *
 * 同时被 UnoCSS（主题类名）和 JS（端口圆点 / 连线颜色）引用。
 * 修改这里会同时影响 CSS 类与运行时拼接的样式。
 *
 * 真实源见 docs/superpowers/specs/ui-design-spec.md v1.1 附录 A。
 */

import type { PortType } from '@/features/graph/graph.types'

/** 背景层级（从底到顶） */
export const BG = {
  canvas: '#131316',
  node: '#1c1c20',
  panel: '#1f1f24',
  hover: '#26262a',
} as const

/** 边框 */
export const BORDER = {
  default: '#3f3f46',
  subtle: '#2e2e32',
} as const

/** 文本层级 */
export const TEXT = {
  primary: '#e4e4e7',
  secondary: '#a1a1aa',
  tertiary: '#6b6b74',
  disabled: '#52525b',
} as const

/** 节点状态色（顶部 3px 色条） */
export const STATE = {
  idle: 'transparent',
  pending: 'transparent',
  queued: '#52525b',
  running: '#6366f1',
  succeeded: '#10b981',
  skipped: '#52525b',
  cancelled: '#52525b',
  frozen: '#f59e0b',
  error: '#ef4444',
} as const

export type NodeStatus
  = | 'idle' | 'pending' | 'queued' | 'running'
    | 'succeeded' | 'failed' | 'skipped' | 'cancelled'

/** 端口类型色（Tailwind -300 档，见头脑风暴会话 v3） */
export const PORT: Record<PortType, string> = {
  text: '#d4d4d8',
  image: '#93c5fd',
  video: '#c4b5fd',
  audio: '#6ee7b7',
  number: '#fcd34d',
  any: '#a1a1aa',
} as const

/** LOD 缩放阈值（zoom >= 1.0 = 100%） */
export const LOD = {
  far: { min: 0, max: 0.5 },
  mid: { min: 0.5, max: 1.2 },
  near: { min: 1.2, max: 4 },
} as const

export type LodLevel = 'far' | 'mid' | 'near'

export function getLod(zoom: number): LodLevel {
  if (zoom < LOD.far.max)
    return 'far'
  if (zoom < LOD.mid.max)
    return 'mid'
  return 'near'
}

/** 缩放范围 */
export const ZOOM = { min: 0.25, max: 4 } as const

/** 节点最小宽度 */
export const NODE_MIN_WIDTH = 140

/** 端口圆点尺寸 */
export const PORT_DOT = {
  default: 8,
  hover: 10,
} as const

/** 连线宽度 */
export const EDGE_WIDTH = 3

/**
 * 工作流分区配色。与 uno.config.ts 的 theme.colors.wf 保持一致
 * （那边是给 bg-wf-1 这类工具类用，这边是给 JS 拼接内联样式用）。
 */
export const WORKFLOW_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#6366f1',
  2: '#f59e0b',
  3: '#10b981',
  4: '#ef4444',
  5: '#8b5cf6',
} as const
