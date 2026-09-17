import type { GraphNode, Workflow, WorkflowGraph } from '@/features/graph/graph.types'
import { describe, expect, it } from 'vitest'
import { isPortTypeCompatible } from '@/features/graph/port'
import {
  computeWorkflowSize,
  flattenProjectToGraph,
  groupNodesByWorkflow,
  isCrossWorkflowEdge,
  NODE_SIZE_ESTIMATE,
  nodeBelongsToWorkflow,
  WORKFLOW_MIN_SIZE,
  WORKFLOW_PAD,
} from '../partition'

const node = (id: string, type: string, x = 0, y = 0): GraphNode => ({ id, type, position: { x, y }, data: {} })

function makeWorkflow(id: string, name: string, x: number, y: number, color: 1 | 2 | 3 | 4 | 5, nodes: GraphNode[], edges: WorkflowGraph['edges'] = []): Workflow {
  return {
    id,
    name,
    placement: { x, y, color },
    graph: { nodes, edges },
  }
}

describe('flattenProjectToGraph', () => {
  it('concatenates all workflow graphs with placement offset applied', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 100, 200, 1, [node('a', 'llm', 10, 20)], [])
    const wf2 = makeWorkflow('wf2', '角色设定', 500, 600, 2, [node('b', 'llm', 30, 40)], [])

    const { nodes, edges } = flattenProjectToGraph([wf1, wf2])

    expect(nodes).toHaveLength(2)
    expect(edges).toEqual([])

    const a = nodes.find(n => n.id === 'a')!
    expect(a.position).toEqual({ x: 110, y: 220 })

    const b = nodes.find(n => n.id === 'b')!
    expect(b.position).toEqual({ x: 530, y: 640 })
  })

  it('preserves edge ids across workflows', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm'), node('b', 'llm')], [
      { id: 'e1', source: { nodeId: 'a', portId: 'text' }, target: { nodeId: 'b', portId: 'prompt' } },
    ])

    const { edges } = flattenProjectToGraph([wf1])
    expect(edges).toEqual(wf1.graph.edges)
  })

  it('handles empty workflow list', () => {
    const { nodes, edges } = flattenProjectToGraph([])
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})

describe('nodeBelongsToWorkflow', () => {
  it('returns true for nodes in the workflow', () => {
    const wf = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm')], [])
    expect(nodeBelongsToWorkflow(wf, 'a')).toBe(true)
  })

  it('returns false for nodes not in the workflow', () => {
    const wf = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm')], [])
    expect(nodeBelongsToWorkflow(wf, 'ghost')).toBe(false)
  })
})

describe('groupNodesByWorkflow', () => {
  it('groups nodes by their owning workflow id', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm'), node('b', 'llm')], [])
    const wf2 = makeWorkflow('wf2', '角色', 0, 0, 2, [node('c', 'llm')], [])

    const allNodes = [...wf1.graph.nodes, ...wf2.graph.nodes]
    const grouped = groupNodesByWorkflow(allNodes, [wf1, wf2])

    expect(grouped.get('wf1')?.map(n => n.id)).toEqual(['a', 'b'])
    expect(grouped.get('wf2')?.map(n => n.id)).toEqual(['c'])
  })

  it('skips nodes that do not belong to any workflow', () => {
    const wf = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm')], [])
    const stray = node('ghost', 'llm')
    const grouped = groupNodesByWorkflow([...wf.graph.nodes, stray], [wf])
    expect(grouped.get('wf1')?.map(n => n.id)).toEqual(['a'])
    expect(grouped.size).toBe(1)
  })
})

describe('isCrossWorkflowEdge', () => {
  it('returns true when source and target belong to different workflows', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm')], [])
    const wf2 = makeWorkflow('wf2', '角色', 0, 0, 2, [node('b', 'llm')], [])

    const edge = { id: 'e1', source: { nodeId: 'a', portId: 'out' }, target: { nodeId: 'b', portId: 'in' } }
    expect(isCrossWorkflowEdge(edge, [wf1, wf2])).toBe(true)
  })

  it('returns false when source and target belong to the same workflow', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm'), node('b', 'llm')], [])

    const edge = { id: 'e1', source: { nodeId: 'a', portId: 'out' }, target: { nodeId: 'b', portId: 'in' } }
    expect(isCrossWorkflowEdge(edge, [wf1])).toBe(false)
  })

  it('returns true if either endpoint is unowned (defensive)', () => {
    const wf1 = makeWorkflow('wf1', '剧本', 0, 0, 1, [node('a', 'llm')], [])
    const edge = { id: 'e1', source: { nodeId: 'a', portId: 'out' }, target: { nodeId: 'ghost', portId: 'in' } }
    expect(isCrossWorkflowEdge(edge, [wf1])).toBe(true)
  })
})

describe('computeWorkflowSize', () => {
  it('returns minimum size for an empty workflow (border must stay visible)', () => {
    expect(computeWorkflowSize([])).toEqual(WORKFLOW_MIN_SIZE)
  })

  it('clamps a single small workflow to the minimum size', () => {
    const size = computeWorkflowSize([node('a', 'llm', 0, 0)])
    expect(size).toEqual(WORKFLOW_MIN_SIZE)
  })

  it('grows past the minimum once content exceeds it', () => {
    const size = computeWorkflowSize([node('a', 'llm', 200, 100)])
    expect(size.width).toBe(200 + NODE_SIZE_ESTIMATE.width + WORKFLOW_PAD.right)
    expect(size.height).toBe(100 + NODE_SIZE_ESTIMATE.height + WORKFLOW_PAD.bottom)
  })

  it('uses the farthest node on each axis independently', () => {
    const size = computeWorkflowSize([
      node('wide', 'llm', 400, 0),
      node('tall', 'llm', 0, 300),
    ])
    expect(size.width).toBe(400 + NODE_SIZE_ESTIMATE.width + WORKFLOW_PAD.right)
    expect(size.height).toBe(300 + NODE_SIZE_ESTIMATE.height + WORKFLOW_PAD.bottom)
  })

  it('never produces a zero or negative dimension', () => {
    const size = computeWorkflowSize([node('a', 'llm', -500, -500)])
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
    expect(size).toEqual(WORKFLOW_MIN_SIZE)
  })

  it('leaves drag headroom: size is strictly larger than the content extent', () => {
    const nodes = [node('a', 'llm', 40, 60), node('b', 'llm', 280, 220)]
    const size = computeWorkflowSize(nodes)
    const contentRight = 280 + NODE_SIZE_ESTIMATE.width
    const contentBottom = 220 + NODE_SIZE_ESTIMATE.height
    expect(size.width).toBeGreaterThan(contentRight)
    expect(size.height).toBeGreaterThan(contentBottom)
  })
})

describe('integration: port compatibility reused', () => {
  // 设计文档 §6.1 要求 isValidConnection 同时校验分区归属 + 端口类型。
  // 这里只演示两个独立判定都有效；isValidConnection 的复合在 Vue Flow 内部组装。
  it('port compatibility check is independent of partition logic', () => {
    expect(isPortTypeCompatible('text', 'image')).toBe(false)
    expect(isPortTypeCompatible('text', 'text')).toBe(true)
    expect(isPortTypeCompatible('text', 'any')).toBe(true)
  })
})
