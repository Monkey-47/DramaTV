import type { GraphNode, Port, PortType, WorkflowGraph } from '@/features/graph/graph.types'
import type { NodeStatus } from '@/shared/constants/theme'

/**
 * canvas 渲染一个节点类型所需的最小形状。
 *
 * 刻意用结构类型而不是 import features/nodes 的 NodeTypeDefinition ——
 * canvas 只声明"我需要什么"，注册表那边定义更全，结构化地满足即可。
 * 这样 canvas 不依赖 nodes（节点组件除外，那个是渲染必需的）。
 */
export interface RenderNodeDefinition {
  label?: string
  icon?: string
  inputs: Port[]
  outputs: Port[]
  /** 由 params 生成单行摘要。注册表驱动渲染的关键。 */
  summarize?: (params: any) => string
}

export type RenderNodeTypeMap = Record<string, RenderNodeDefinition>

/**
 * 运行态数据。设计文档 §3.2 的 NodeRunState 是 run-scoped 的，
 * 与 GraphNode（定义态）严格分离 —— 所以它走单独一份 map，不进图。
 *
 * P1-e 接 runner 后，这份 map 改由 store 提供。
 */
export interface NodeRenderMeta {
  /** 覆盖定义里的 label */
  title?: string
  /** 覆盖定义 summarize() 的结果 */
  summary?: string
  status?: NodeStatus
  /** 叠加标记 */
  frozen?: boolean
  reused?: boolean
  /** 0–100 */
  progress?: number
  /**
   * 本轮跑出了几个候选。
   *
   * 用来在节点上画一个「候选 N」入口 —— 候选面板不能只靠双击打开：
   * 单击节点会弹出配置弹窗，它的全屏遮罩会吃掉双击手势的后半段，
   * 两个手势在浏览器层面互斥。
   */
  candidateCount?: number
  /**
   * 失败时后端给的可重试标记（来自 `NodeRunState.error.retryable`）。
   *
   * 右键菜单用它决定「重试运行」是否可点。**前端不做重试决策**（设计文档 §4.5），
   * 这里只是把后端的判断透出来。缺省视为不可重试。
   */
  retryable?: boolean
}

/** 渲染时把 GraphNode 平铺出来用的扩展结构 */
export type NodeWithMeta = GraphNode & { meta?: NodeRenderMeta }

/** Vue Flow 节点位置（pixel，workflow 内相对坐标） */
export interface VueFlowNode {
  id: string
  type: 'canvas-node'
  /** Vue Flow GroupNode 的父节点 id；单工作流时省略 */
  parentNode?: string
  position: { x: number, y: number }
  /** 子节点被限制在父分区范围内，拖不出工作流 */
  extent?: 'parent'
  data: {
    node: GraphNode
    inputs: Port[]
    outputs: Port[]
    /** 节点类型定义里的显示名，如「文生图」 */
    label: string
    icon?: string
    /** 已由定义 summarize() 算好；meta.summary 会覆盖它 */
    summary?: string
    meta: NodeRenderMeta
  }
}

/** 工作流分组节点（对应设计文档 §6.1 的 GroupNode） */
export interface VueFlowGroupNode {
  id: string
  type: 'group-node'
  position: { x: number, y: number }
  /**
   * 尺寸必须显式给，否则 Vue Flow 的 group 塌成 0×0（边框看不见、
   * extent:'parent' 会把子节点锁死在零面积盒子里拖不动）。
   *
   * pointerEvents 也走这里而不是 CSS：Vue Flow 会给节点元素写内联的
   * `pointer-events: all`，内联样式压过任何样式表规则，只能用内联覆盖。
   */
  style?: { width?: string, height?: string, pointerEvents?: 'none' | 'all' }
  data: {
    workflowId: string
    name: string
    color: 1 | 2 | 3 | 4 | 5
  }
}

/** Vue Flow 边：把嵌套 PortRef 拍扁为字符串 handle */
export interface VueFlowEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  type: 'default'
  data: {
    sourceType: PortType
    targetType: PortType
  }
}

/** 入参：渲染所需的全部数据 */
export interface RenderInput {
  graph: WorkflowGraph
  /** type → 节点类型定义，由 view 从注册表取（registry.buildNodeTypeMap()） */
  nodeTypes: RenderNodeTypeMap
  /** nodeId → 运行态；缺省则节点显示为 idle */
  meta?: Record<string, NodeRenderMeta> | undefined
}

export interface RenderOutput {
  nodes: VueFlowNode[]
  edges: VueFlowEdge[]
}
