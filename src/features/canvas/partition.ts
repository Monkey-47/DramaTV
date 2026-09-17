/**
 * 工作流分区逻辑 —— 设计文档 §6.1
 *
 * 把 Project 持有的多个 Workflow 折叠成一张扁平画布图。
 * 节点 position 是 workflow 内相对坐标；这里叠加 placement.x/y 偏移。
 * 跨工作流边由 isCrossWorkflowEdge 检测，交给 Vue Flow 的 isValidConnection 拒绝。
 *
 * 这个文件是 features/canvas 内唯一抹平多工作流逻辑的地方（边界规则）。
 */

import type { GraphEdge, GraphNode, Workflow, WorkflowGraph } from '@/features/graph/graph.types'

/** 把 Project 的所有 workflow 折叠成一个扁平的 WorkflowGraph（带 placement 偏移） */
export function flattenProjectToGraph(workflows: Workflow[]): WorkflowGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const wf of workflows) {
    const offsetX = wf.placement.x
    const offsetY = wf.placement.y

    for (const node of wf.graph.nodes) {
      nodes.push({
        ...node,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
      })
    }

    edges.push(...wf.graph.edges)
  }

  return { nodes, edges }
}

/** 节点是否属于某个 workflow（按 id 查） */
export function nodeBelongsToWorkflow(wf: Workflow, nodeId: string): boolean {
  return wf.graph.nodes.some(n => n.id === nodeId)
}

/** 给定一个扁平节点列表 + workflows，按 workflow.id 分组 */
export function groupNodesByWorkflow(
  flatNodes: GraphNode[],
  workflows: Workflow[],
): Map<string, GraphNode[]> {
  const result = new Map<string, GraphNode[]>()
  for (const wf of workflows) {
    result.set(wf.id, [])
  }

  for (const node of flatNodes) {
    const owner = workflows.find(wf => wf.graph.nodes.some(n => n.id === node.id))
    if (owner) {
      result.get(owner.id)!.push(node)
    }
  }

  return result
}

/** 一条边是否跨工作流。任一端点不在同一个 workflow 内都算（防御 dangling） */
export function isCrossWorkflowEdge(edge: GraphEdge, workflows: Workflow[]): boolean {
  const sourceWfs = workflows.filter(wf => nodeBelongsToWorkflow(wf, edge.source.nodeId))
  const targetWfs = workflows.filter(wf => nodeBelongsToWorkflow(wf, edge.target.nodeId))

  if (sourceWfs.length === 0 || targetWfs.length === 0)
    return true
  if (sourceWfs[0]!.id !== targetWfs[0]!.id)
    return true
  return false
}

// ============================================================================
// 分区尺寸计算
// ============================================================================

/**
 * 节点外框尺寸估算。Vue Flow 的 group node 必须有显式尺寸，否则塌成 0×0，
 * 子节点会被 `extent: 'parent'` 锁死在一个零面积盒子里、完全拖不动。
 *
 * 渲染前拿不到真实测量值，所以按节点卡片的最小尺寸估。取 160×84 而非
 * min-width:140 —— 留出端口圆点溢出与内容换行的余量。
 */
export const NODE_SIZE_ESTIMATE = { width: 160, height: 84 } as const

/**
 * 分区右下内边距。子节点可以向左/上拖回 (0,0)，向右/下拖只有这么多余量，
 * 所以这个值决定"重新摆位"的手感，给宽一点。
 */
export const WORKFLOW_PAD = { right: 100, bottom: 100 } as const

/** 空分区 / 极小分区的兜底尺寸，保证边框始终可见 */
export const WORKFLOW_MIN_SIZE = { width: 320, height: 220 } as const

/**
 * 按分区内节点位置算分区包围盒。
 *
 * 只扩右/下：子节点坐标是分区内相对坐标，左/上的呼吸空间来自节点自身的
 * 初始摆位（mock 里从 x=40 / y=60 起），不需要再额外加。
 */
export function computeWorkflowSize(nodes: GraphNode[]): { width: number, height: number } {
  let maxX = 0
  let maxY = 0

  for (const n of nodes) {
    maxX = Math.max(maxX, n.position.x + NODE_SIZE_ESTIMATE.width)
    maxY = Math.max(maxY, n.position.y + NODE_SIZE_ESTIMATE.height)
  }

  return {
    width: Math.max(WORKFLOW_MIN_SIZE.width, Math.round(maxX + WORKFLOW_PAD.right)),
    height: Math.max(WORKFLOW_MIN_SIZE.height, Math.round(maxY + WORKFLOW_PAD.bottom)),
  }
}
