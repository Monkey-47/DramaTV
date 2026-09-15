/** 端口承载的数据类型。`any` 是逃生舱口，应尽量少用。 */
export type PortType = 'text' | 'image' | 'video' | 'audio' | 'number' | 'any'

/** 节点上的一个输入/输出端口。`id` 在所属节点内唯一。 */
export interface Port {
  id: string
  label: string
  type: PortType
  required?: boolean
}

/** 节点位置（workflow 内的相对坐标，不含 placement 偏移）。 */
export interface NodePosition {
  x: number
  y: number
}

/** 用户"采用"的产出 —— 持久化，跨运行保持。见设计文档 §3.2 */
export interface AdoptedOutput {
  assetId: string
  frozen: boolean
}

export interface GraphNode {
  id: string
  /** 对应 nodes/registry 里的节点类型 key */
  type: string
  position: NodePosition
  /** 该节点的参数值 */
  data: Record<string, unknown>
  adopted?: AdoptedOutput
}

export interface PortRef {
  nodeId: string
  portId: string
}

export interface GraphEdge {
  id: string
  source: PortRef
  target: PortRef
}

/**
 * 工作流的图。
 * 注意：不含 viewport —— 画布是项目级的，viewport 属于 Project（设计文档 §3.1）。
 */
export interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
