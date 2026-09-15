import type { WorkflowGraph } from './graph.types'

const WHITE = 0 // 未访问
const GRAY = 1 // 在当前 DFS 路径上
const BLACK = 2 // 已完成

/**
 * 找出图中的一个环，返回环上的节点 id（按环路顺序）。
 * 无环返回 null。
 *
 * 用三色 DFS：遇到 GRAY 节点说明回到了当前路径上的点，即构成环。
 *
 * 拓扑排序能发现"有环"，但说不出环在哪；连线校验需要知道具体环路
 * 才能提示用户，这是本函数存在的理由。
 */
export function findCycle(graph: WorkflowGraph): string[] | null {
  const color = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of graph.nodes) {
    color.set(node.id, WHITE)
    children.set(node.id, [])
  }

  for (const edge of graph.edges) {
    const from = edge.source.nodeId
    const to = edge.target.nodeId
    if (!color.has(from) || !color.has(to)) {
      continue
    }
    children.get(from)?.push(to)
  }

  const stack: string[] = []

  function visit(id: string): string[] | null {
    color.set(id, GRAY)
    stack.push(id)

    for (const child of children.get(id) ?? []) {
      const childColor = color.get(child)
      if (childColor === GRAY) {
        const start = stack.indexOf(child)
        return stack.slice(start)
      }
      if (childColor === WHITE) {
        const found = visit(child)
        if (found !== null) {
          return found
        }
      }
    }

    stack.pop()
    color.set(id, BLACK)
    return null
  }

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE) {
      const found = visit(node.id)
      if (found !== null) {
        return found
      }
    }
  }

  return null
}
