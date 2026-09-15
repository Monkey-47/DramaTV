import type { WorkflowGraph } from './graph.types'

/**
 * 对图做拓扑排序（Kahn 算法），返回节点 id 的执行顺序。
 *
 * 指向不存在节点的边会被忽略 —— 这类边通常来自正在编辑中的中间状态，
 * 不应该让整个排序失败。
 *
 * @throws 图中有环时抛错
 */
export function topologicalSort(graph: WorkflowGraph): string[] {
  const indegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of graph.nodes) {
    indegree.set(node.id, 0)
    children.set(node.id, [])
  }

  for (const edge of graph.edges) {
    const from = edge.source.nodeId
    const to = edge.target.nodeId
    if (!indegree.has(from) || !indegree.has(to)) {
      continue
    }
    const list = children.get(from)
    if (list !== undefined) {
      list.push(to)
    }
    indegree.set(to, (indegree.get(to) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const node of graph.nodes) {
    if (indegree.get(node.id) === 0) {
      queue.push(node.id)
    }
  }

  const order: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) {
      break
    }
    order.push(current)

    for (const child of children.get(current) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1
      indegree.set(child, next)
      if (next === 0) {
        queue.push(child)
      }
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error('工作流中存在环，无法确定执行顺序')
  }

  return order
}
