import type { RenderNodeTypeMap } from '../mapping.types'
import type { GraphEdge, GraphNode, Port, WorkflowGraph } from '@/features/graph/graph.types'
import { describe, expect, it } from 'vitest'
import { edgeToVueFlow, portRefHandle, renderGraph } from '../mapping'

function ports(type: Port['type']): Port[] {
  return [
    { id: 'in', label: 'in', type, required: type !== 'any' },
    { id: 'out', label: 'out', type },
  ]
}

function node(id: string, type: string, x = 0, y = 0, data: Record<string, unknown> = {}): GraphNode {
  return { id, type, position: { x, y }, data }
}

function edge(id: string, fromId: string, fromPort: string, toId: string, toPort: string): GraphEdge {
  return {
    id,
    source: { nodeId: fromId, portId: fromPort },
    target: { nodeId: toId, portId: toPort },
  }
}

const graph = (nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph => ({ nodes, edges })

const NODE_TYPES: RenderNodeTypeMap = {
  'text-to-image': {
    label: '文生图',
    icon: '🖼',
    inputs: ports('text'),
    outputs: ports('image'),
    summarize: p => `${p.resolution ?? '1024x1536'} · 候选 ${p.candidateCount ?? 4}`,
  },
  'image-to-video': {
    label: '图生视频',
    inputs: ports('image'),
    outputs: ports('video'),
  },
  'upscale': { label: '放大', inputs: ports('image'), outputs: ports('image') },
  'export': { label: '导出', inputs: ports('video'), outputs: [] },
}

const G1: WorkflowGraph = graph(
  [node('a', 'text-to-image'), node('b', 'image-to-video'), node('c', 'export')],
  [edge('e1', 'a', 'out', 'b', 'in'), edge('e2', 'b', 'out', 'c', 'in')],
)

describe('portRefHandle', () => {
  it('joins nodeId and portId with ::', () => {
    expect(portRefHandle('node-1', 'out')).toBe('node-1::out')
  })
})

describe('renderGraph nodes', () => {
  it('converts every node with type canvas-node', () => {
    const out = renderGraph({ graph: G1, nodeTypes: NODE_TYPES })
    expect(out.nodes).toHaveLength(3)
    for (const n of out.nodes)
      expect(n.type).toBe('canvas-node')
  })

  it('preserves position', () => {
    const g = graph([node('a', 'text-to-image', 100, 200)], [])
    const out = renderGraph({ graph: g, nodeTypes: NODE_TYPES })
    expect(out.nodes[0]?.position).toEqual({ x: 100, y: 200 })
  })

  it('attaches ports from the node type definition', () => {
    const out = renderGraph({ graph: G1, nodeTypes: NODE_TYPES })
    const a = out.nodes.find(n => n.id === 'a')!
    expect(a.data.inputs.find(p => p.id === 'in')?.type).toBe('text')
    expect(a.data.outputs.find(p => p.id === 'out')?.type).toBe('image')
  })

  it('derives the label and icon from the definition', () => {
    const out = renderGraph({ graph: G1, nodeTypes: NODE_TYPES })
    const a = out.nodes.find(n => n.id === 'a')!
    expect(a.data.label).toBe('文生图')
    expect(a.data.icon).toBe('🖼')
  })

  it('derives the summary from the definition summarize() using node.data', () => {
    const g = graph([node('a', 'text-to-image', 0, 0, { resolution: '2048x2048', candidateCount: 8 })], [])
    const out = renderGraph({ graph: g, nodeTypes: NODE_TYPES })
    expect(out.nodes[0]?.data.summary).toBe('2048x2048 · 候选 8')
  })

  it('lets meta.summary override the derived summary', () => {
    const g = graph([node('a', 'text-to-image', 0, 0, { candidateCount: 8 })], [])
    const out = renderGraph({
      graph: g,
      nodeTypes: NODE_TYPES,
      meta: { a: { summary: '来自运行态' } },
    })
    expect(out.nodes[0]?.data.summary).toBe('来自运行态')
  })

  it('falls back to the raw type when the type is unregistered', () => {
    const g = graph([node('a', 'unknown-type')], [])
    const out = renderGraph({ graph: g, nodeTypes: {} })
    expect(out.nodes[0]?.data.label).toBe('unknown-type')
    expect(out.nodes[0]?.data.inputs).toEqual([])
    expect(out.nodes[0]?.data.outputs).toEqual([])
    expect(out.nodes[0]?.data.summary).toBeUndefined()
  })

  it('survives a summarize() that throws on bad params', () => {
    const types: RenderNodeTypeMap = {
      boom: {
        label: 'boom',
        inputs: [],
        outputs: [],
        summarize: () => { throw new Error('bad params') },
      },
    }
    const g = graph([node('a', 'boom')], [])
    expect(() => renderGraph({ graph: g, nodeTypes: types })).not.toThrow()
    expect(renderGraph({ graph: g, nodeTypes: types }).nodes[0]?.data.summary).toBeUndefined()
  })

  it('passes through meta as run state', () => {
    const g = graph([node('a', 'text-to-image')], [])
    const out = renderGraph({
      graph: g,
      nodeTypes: NODE_TYPES,
      meta: { a: { status: 'running', progress: 42 } },
    })
    expect(out.nodes[0]?.data.meta.status).toBe('running')
    expect(out.nodes[0]?.data.meta.progress).toBe(42)
  })

  it('defaults meta to an empty object when not provided', () => {
    const g = graph([node('a', 'text-to-image')], [])
    const out = renderGraph({ graph: g, nodeTypes: NODE_TYPES })
    expect(out.nodes[0]?.data.meta).toEqual({})
  })
})

describe('renderGraph edges', () => {
  it('flattens GraphEdge into Vue Flow string handles', () => {
    const out = renderGraph({ graph: G1, nodeTypes: NODE_TYPES })
    const e1 = out.edges.find(e => e.id === 'e1')!
    expect(e1.source).toBe('a')
    expect(e1.sourceHandle).toBe('a::out')
    expect(e1.target).toBe('b')
    expect(e1.targetHandle).toBe('b::in')
  })

  it('attaches port types for edge coloring', () => {
    const out = renderGraph({ graph: G1, nodeTypes: NODE_TYPES })
    const e1 = out.edges.find(e => e.id === 'e1')!
    expect(e1.data.sourceType).toBe('image')
    expect(e1.data.targetType).toBe('image')
  })

  it('drops dangling edges referring to non-existent nodes', () => {
    const g = graph(
      [node('a', 'text-to-image')],
      [edge('e-bad', 'a', 'out', 'ghost', 'in'), edge('e2', 'a', 'out', 'a', 'in')],
    )
    const out = renderGraph({ graph: g, nodeTypes: NODE_TYPES })
    expect(out.edges.map(e => e.id)).toEqual(['e2'])
  })

  it('degrades unknown port types to "any"', () => {
    const g = graph(
      [node('a', 'unknown-type'), node('b', 'text-to-image')],
      [edge('e1', 'a', 'out', 'b', 'in')],
    )
    const out = renderGraph({ graph: g, nodeTypes: NODE_TYPES })
    expect(out.edges[0]?.data.sourceType).toBe('any')
    expect(out.edges[0]?.data.targetType).toBe('text')
  })
})

describe('edgeToVueFlow', () => {
  it('returns null for dangling edges', () => {
    expect(edgeToVueFlow(edge('e', 'ghost', 'out', 'also-ghost', 'in'), NODE_TYPES, G1)).toBeNull()
  })

  it('returns the converted edge for valid ones', () => {
    const result = edgeToVueFlow(edge('e', 'a', 'out', 'b', 'in'), NODE_TYPES, G1)
    expect(result).not.toBeNull()
    expect(result!.sourceHandle).toBe('a::out')
  })
})
