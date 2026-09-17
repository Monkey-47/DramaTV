/**
 * graph 数据模型 → Vue Flow 数据结构的转换层。
 *
 * 设计文档 §6.1 要求：唯一允许 import @vue-flow/* 的地方。
 * 这里抹平三个差异：
 *   1. GraphEdge 用嵌套 { source: { nodeId, portId }, target: ... }，
 *      Vue Flow 要扁平的 source / target / sourceHandle / targetHandle 字符串。
 *   2. 节点的端口与摘要来自节点类型定义（`nodeTypes` 入参，由 view 从注册表取）。
 *      canvas 不认识注册表，只认识这里声明的 RenderNodeDefinition 结构。
 *   3. Project 持有多 Workflow（每个有自己的 placement），Vue Flow 要
 *      单图 + GroupNode 嵌套 + parentNode 引用。
 *
 * 纯函数，便于测试。
 */

import type {
  NodeRenderMeta,
  RenderInput,
  RenderNodeTypeMap,
  RenderOutput,
  VueFlowEdge,
  VueFlowGroupNode,
  VueFlowNode,
} from './mapping.types'
import type { GraphEdge, GraphNode, Workflow, WorkflowGraph } from '@/features/graph/graph.types'
import { computeWorkflowSize } from './partition'

/** 把 PortRef 拍扁为 Vue Flow handle 字符串：`<nodeId>::<portId>` */
export function portRefHandle(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`
}

const EMPTY_META: NodeRenderMeta = {}

/**
 * 组装一个 Vue Flow 节点的 data。
 *
 * 摘要优先级：运行态 meta.summary > 类型定义 summarize(data) > 无。
 * 前者是「本次运行的实际结果」，后者是「按当前参数的预期」，运行态更具体。
 */
function buildNodeData(
  node: GraphNode,
  nodeTypes: RenderNodeTypeMap,
  metaMap: Record<string, NodeRenderMeta>,
): VueFlowNode['data'] {
  const def = nodeTypes[node.type]
  const meta = metaMap[node.id] ?? EMPTY_META

  let summary = meta.summary
  if (summary === undefined && def?.summarize) {
    try {
      summary = def.summarize(node.data)
    }
    catch {
      // 参数缺失或类型不符时不该炸掉整张画布，降级为无摘要
      summary = undefined
    }
  }

  return {
    node,
    inputs: def?.inputs ?? [],
    outputs: def?.outputs ?? [],
    // 显示名优先级：运行态覆盖 > 用户起的别名 > 类型定义的 label > 类型 key
    label: meta.title ?? node.label ?? def?.label ?? node.type,
    ...(def?.icon !== undefined ? { icon: def.icon } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(meta.retryable !== undefined ? { retryable: meta.retryable } : {}),
    meta,
  }
}

function findNodeType(graph: WorkflowGraph, nodeId: string): string {
  return graph.nodes.find(n => n.id === nodeId)?.type ?? ''
}

export function toVueFlowNodes(graph: WorkflowGraph, input: RenderInput): VueFlowNode[] {
  const metaMap = input.meta ?? {}
  return graph.nodes.map(node => ({
    id: node.id,
    type: 'canvas-node' as const,
    position: { x: node.position.x, y: node.position.y },
    data: buildNodeData(node, input.nodeTypes, metaMap),
  }))
}

/**
 * 边转换。引用的节点不在 graph.nodes 里时静默丢弃 —— 与 topo/cycle 的
 * "dangling edge 不报错" 约定一致（见 P1-a 计划 graph 实现的处理方式）。
 */
export function toVueFlowEdges(graph: WorkflowGraph, nodeTypes: RenderNodeTypeMap): VueFlowEdge[] {
  const nodeSet = new Set(graph.nodes.map(n => n.id))

  const out: VueFlowEdge[] = []
  for (const edge of graph.edges) {
    if (!nodeSet.has(edge.source.nodeId) || !nodeSet.has(edge.target.nodeId))
      continue

    const sourcePorts = nodeTypes[findNodeType(graph, edge.source.nodeId)]?.outputs ?? []
    const targetPorts = nodeTypes[findNodeType(graph, edge.target.nodeId)]?.inputs ?? []

    out.push({
      id: edge.id,
      source: edge.source.nodeId,
      target: edge.target.nodeId,
      sourceHandle: portRefHandle(edge.source.nodeId, edge.source.portId),
      targetHandle: portRefHandle(edge.target.nodeId, edge.target.portId),
      type: 'default',
      data: {
        sourceType: sourcePorts.find(p => p.id === edge.source.portId)?.type ?? 'any',
        targetType: targetPorts.find(p => p.id === edge.target.portId)?.type ?? 'any',
      },
    })
  }
  return out
}

/** 单工作流渲染入口 */
export function renderGraph(input: RenderInput): RenderOutput {
  return {
    nodes: toVueFlowNodes(input.graph, input),
    edges: toVueFlowEdges(input.graph, input.nodeTypes),
  }
}

/** 导出单条边转换供测试用 */
export function edgeToVueFlow(
  edge: GraphEdge,
  nodeTypes: RenderNodeTypeMap,
  graph: WorkflowGraph,
): VueFlowEdge | null {
  const ids = new Set(graph.nodes.map(n => n.id))
  if (!ids.has(edge.source.nodeId))
    return null
  if (!ids.has(edge.target.nodeId))
    return null
  return toVueFlowEdges({ nodes: graph.nodes, edges: [edge] }, nodeTypes)[0] ?? null
}

// ============================================================================
// 多工作流模式（P1-c）
// ============================================================================

export interface RenderProjectInput extends Omit<RenderInput, 'graph'> {
  workflows: Workflow[]
  meta?: Record<string, NodeRenderMeta> | undefined
}

export interface RenderProjectOutput {
  groupNodes: VueFlowGroupNode[]
  nodes: VueFlowNode[]
  edges: VueFlowEdge[]
}

/**
 * 把 Project 折叠成 Vue Flow 数据：
 * - 每个 workflow 一个 GroupNode，position = placement，尺寸按内容算
 * - 子节点 position 保持 workflow 内相对坐标，parentNode 指向所属 workflow
 * - 子节点 extent='parent'，拖不出分区
 *
 * 跨工作流边不在这里过滤 —— 交给 Vue Flow 的 isValidConnection 走拒绝流程，
 * 用户能看到「禁止光标 + 端口变暗」的反馈（设计文档 §6.1），静默丢弃就没有反馈了。
 */
export function renderProject(input: RenderProjectInput): RenderProjectOutput {
  const groupNodes: VueFlowGroupNode[] = []
  const nodes: VueFlowNode[] = []
  const allEdges: GraphEdge[] = []
  const metaMap = input.meta ?? {}

  for (const wf of input.workflows) {
    const size = computeWorkflowSize(wf.graph.nodes)

    groupNodes.push({
      id: wf.id,
      type: 'group-node',
      position: { x: wf.placement.x, y: wf.placement.y },
      style: {
        width: `${size.width}px`,
        height: `${size.height}px`,
        // 分区主体不吃指针事件，否则整块分区会吞掉拖拽，
        // 用户在分区内没法框选节点（一拖就变成搬分区）。
        // 分区改由标题栏拖动 —— 标题的事件会冒泡到节点元素，d3-drag 照常触发。
        pointerEvents: 'none',
      },
      data: { workflowId: wf.id, name: wf.name, color: wf.placement.color ?? 1 },
    })

    for (const node of wf.graph.nodes) {
      nodes.push({
        id: node.id,
        type: 'canvas-node',
        parentNode: wf.id,
        extent: 'parent',
        position: { x: node.position.x, y: node.position.y },
        data: buildNodeData(node, input.nodeTypes, metaMap),
      })
    }

    allEdges.push(...wf.graph.edges)
  }

  const edges = toVueFlowEdges(
    { nodes: input.workflows.flatMap(wf => wf.graph.nodes), edges: allEdges },
    input.nodeTypes,
  )

  return { groupNodes, nodes, edges }
}
