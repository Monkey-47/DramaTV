import type { GraphEdge, GraphNode, WorkflowGraph } from '@/features/graph/graph.types'
import { describe, expect, it } from 'vitest'
import { downstreamOf, resolveRunTargets, upstreamOf } from '../dag'

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return { id, source: { nodeId: from, portId: 'out' }, target: { nodeId: to, portId: 'in' } }
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges }
}

// a → b → c，a → x
const BRANCHED = graph(
  [node('a'), node('b'), node('c'), node('x')],
  [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'x')],
)

describe('downstreamOf', () => {
  it('叶子节点没有下游', () => {
    expect(downstreamOf(BRANCHED, 'c')).toEqual([])
  })

  it('返回传递闭包，不只是直接子节点', () => {
    expect(downstreamOf(BRANCHED, 'a').sort()).toEqual(['b', 'c', 'x'])
  })

  it('不含自己', () => {
    expect(downstreamOf(BRANCHED, 'a')).not.toContain('a')
  })

  it('只走前向边，不回头', () => {
    expect(downstreamOf(BRANCHED, 'b')).toEqual(['c'])
  })

  it('旁支不会被算进另一条链的下游', () => {
    expect(downstreamOf(BRANCHED, 'b')).not.toContain('x')
  })

  it('孤立节点返回空', () => {
    expect(downstreamOf(graph([node('solo')], []), 'solo')).toEqual([])
  })

  it('未知节点返回空而不是抛错', () => {
    expect(downstreamOf(BRANCHED, 'ghost')).toEqual([])
  })

  it('有环时能终止（不挂死）', () => {
    const cyclic = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])
    expect(downstreamOf(cyclic, 'a').sort()).toEqual(['a', 'b'])
  })

  it('自环不会让自己出现两次', () => {
    const selfLoop = graph([node('a')], [edge('e1', 'a', 'a')])
    expect(downstreamOf(selfLoop, 'a')).toEqual(['a'])
  })

  it('指向不存在节点的边被忽略', () => {
    const g = graph([node('a')], [edge('e1', 'a', 'ghost')])
    expect(downstreamOf(g, 'a')).toEqual([])
  })

  it('菱形依赖里汇聚节点只出现一次', () => {
    const diamond = graph(
      [node('a'), node('b'), node('c'), node('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')],
    )
    expect(downstreamOf(diamond, 'a').filter(id => id === 'd')).toHaveLength(1)
  })
})

describe('upstreamOf', () => {
  it('源节点没有上游', () => {
    expect(upstreamOf(BRANCHED, 'a')).toEqual([])
  })

  it('返回传递闭包', () => {
    expect(upstreamOf(BRANCHED, 'c').sort()).toEqual(['a', 'b'])
  })

  it('不含自己', () => {
    expect(upstreamOf(BRANCHED, 'c')).not.toContain('c')
  })
})

describe('resolveRunTargets', () => {
  it('workflow 作用域跑全图', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'workflow' }).sort()).toEqual(['a', 'b', 'c', 'x'])
  })

  it('node 作用域只跑指定节点', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'node', nodeIds: ['b'] })).toEqual(['b'])
  })

  it('node 作用域过滤掉不存在的节点', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'node', nodeIds: ['b', 'ghost'] })).toEqual(['b'])
  })

  it('downstream 作用域含自己 + 全部下游', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'downstream', nodeId: 'b' }).sort()).toEqual(['b', 'c'])
  })

  it('downstream 作用域从根节点出发覆盖全图', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'downstream', nodeId: 'a' }).sort()).toEqual(['a', 'b', 'c', 'x'])
  })

  it('downstream 作用域指向不存在的节点时返回空', () => {
    expect(resolveRunTargets(BRANCHED, { kind: 'downstream', nodeId: 'ghost' })).toEqual([])
  })

  it('三种作用域的结果互不相同（这正是它们存在的意义）', () => {
    const full = resolveRunTargets(BRANCHED, { kind: 'workflow' }).length
    const one = resolveRunTargets(BRANCHED, { kind: 'node', nodeIds: ['b'] }).length
    const down = resolveRunTargets(BRANCHED, { kind: 'downstream', nodeId: 'b' }).length
    expect(one).toBeLessThan(down)
    expect(down).toBeLessThan(full)
  })
})
