import type { GraphEdge, GraphNode, WorkflowGraph } from '../graph.types'
import { describe, expect, it } from 'vitest'
import { findCycle } from '../cycle'

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

describe('findCycle', () => {
  it('无环图返回 null', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b')])
    expect(findCycle(g)).toBeNull()
  })

  it('空图返回 null', () => {
    expect(findCycle(graph([], []))).toBeNull()
  })

  it('自环能检出，返回该节点', () => {
    const g = graph([node('a')], [edge('e1', 'a', 'a')])
    expect(findCycle(g)).toEqual(['a'])
  })

  it('两节点互指能检出', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])
    const cycle = findCycle(g)
    expect(cycle).not.toBeNull()
    expect(cycle).toHaveLength(2)
    expect(cycle?.slice().sort()).toEqual(['a', 'b'])
  })

  it('三节点环路能检出，只包含环上的节点', () => {
    const g = graph(
      [node('a'), node('b'), node('c'), node('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a'), edge('e4', 'c', 'd')],
    )
    const cycle = findCycle(g)
    expect(cycle).not.toBeNull()
    expect(cycle?.slice().sort()).toEqual(['a', 'b', 'c'])
  })

  it('指向不存在节点的边不会导致误报', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')])
    expect(findCycle(g)).toBeNull()
  })
})
