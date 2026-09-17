import type { RunScope } from './runner.types'
import type { WorkflowGraph } from '@/features/graph/graph.types'

/**
 * 图的邻接查询。runner 用它实现设计文档 §4.4 的「部分失败策略」：
 * 节点失败 → 其所有下游 skipped，无依赖关系的分支继续跑。
 */

/** 出边邻接表。指向不存在节点的边会被忽略，与 topo/cycle 的处理一致。 */
function buildAdjacency(graph: WorkflowGraph): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const node of graph.nodes) {
    children.set(node.id, [])
  }
  for (const edge of graph.edges) {
    const list = children.get(edge.source.nodeId)
    // 目标不存在时也忽略：这类边来自正在编辑中的中间状态
    if (list === undefined || !children.has(edge.target.nodeId)) {
      continue
    }
    list.push(edge.target.nodeId)
  }
  return children
}

/**
 * `nodeId` 的全部下游节点（传递闭包，不含自己）。
 *
 * 用 visited 集合而不是依赖无环前提 —— 图中的环能通过 `cycle.ts` 检出并提示用户，
 * 但检测与渲染是异步的，这里碰到环必须能停下来，不能挂死。
 */
export function downstreamOf(graph: WorkflowGraph, nodeId: string): string[] {
  const children = buildAdjacency(graph)
  const visited = new Set<string>()
  const result: string[] = []

  const queue = [...(children.get(nodeId) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current)) {
      continue
    }
    visited.add(current)
    result.push(current)
    for (const child of children.get(current) ?? []) {
      if (!visited.has(child)) {
        queue.push(child)
      }
    }
  }

  return result
}

/** `nodeId` 的全部上游节点（传递闭包，不含自己）。局部执行时用它找出走缓存的节点。 */
export function upstreamOf(graph: WorkflowGraph, nodeId: string): string[] {
  const parents = new Map<string, string[]>()
  for (const node of graph.nodes) {
    parents.set(node.id, [])
  }
  for (const edge of graph.edges) {
    const list = parents.get(edge.target.nodeId)
    if (list === undefined || !parents.has(edge.source.nodeId)) {
      continue
    }
    list.push(edge.source.nodeId)
  }

  const visited = new Set<string>()
  const result: string[] = []

  const queue = [...(parents.get(nodeId) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current)) {
      continue
    }
    visited.add(current)
    result.push(current)
    for (const parent of parents.get(current) ?? []) {
      if (!visited.has(parent)) {
        queue.push(parent)
      }
    }
  }

  return result
}

/**
 * 一次执行实际要跑的节点集合（设计文档 §3.4 的三种作用域）。
 *
 * - `node`       只跑指定节点，其余不动
 * - `downstream` 指定节点 + 其全部下游
 * - `workflow`   全图
 */
export function resolveRunTargets(graph: WorkflowGraph, scope: RunScope): string[] {
  const known = new Set(graph.nodes.map(n => n.id))

  switch (scope.kind) {
    case 'node':
      return scope.nodeIds.filter(id => known.has(id))
    case 'downstream': {
      if (!known.has(scope.nodeId)) {
        return []
      }
      return [scope.nodeId, ...downstreamOf(graph, scope.nodeId)]
    }
    case 'workflow':
      return graph.nodes.map(n => n.id)
  }
}
