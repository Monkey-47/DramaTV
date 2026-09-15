import type { GraphEdge, GraphNode, WorkflowGraph } from '../graph.types'
import { describe, expect, it } from 'vitest'
import { topologicalSort } from '../topo'

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return {
    id,
    source: { nodeId: from, portId: 'out' },
    target: { nodeId: to, portId: 'in' },
  }
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges }
}

describe('topologicalSort', () => {
  it('空图返回空数组', () => {
    expect(topologicalSort(graph([], []))).toEqual([])
  })

  it('单节点返回它自己', () => {
    expect(topologicalSort(graph([node('a')], []))).toEqual(['a'])
  })

  it('链式依赖按顺序返回', () => {
    const g = graph([node('a'), node('b'), node('c')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')])
    expect(topologicalSort(g)).toEqual(['a', 'b', 'c'])
  })

  it('钻石依赖中，分叉节点排在汇聚节点之前', () => {
    const g = graph(
      [node('a'), node('b'), node('c'), node('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')],
    )
    const order = topologicalSort(g)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('互不相连的节点全部出现在结果里', () => {
    const order = topologicalSort(graph([node('a'), node('b'), node('c')], []))
    expect(order.slice().sort()).toEqual(['a', 'b', 'c'])
  })

  it('有环时抛错', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])
    expect(() => topologicalSort(g)).toThrowError(/环/)
  })

  it('指向不存在节点的边会被忽略，不影响其余排序', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')])
    const order = topologicalSort(g)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
  })
})
