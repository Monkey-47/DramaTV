import type { GraphNode, Workflow } from '@/features/graph/graph.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_DELAY_MS,
  clearProject,
  createAutosave,
  FORBIDDEN_KEYS,
  fromPayload,
  loadProject,
  PAYLOAD_VERSION,
  saveProject,
  serializeNode,
  storageKey,
  toPayload,
} from '../persistence'

const PROJECT = 'proj_test'

function workflow(nodes: GraphNode[] = [], edges: Workflow['graph']['edges'] = []): Workflow {
  return {
    id: 'wf1',
    name: '剧本',
    placement: { x: 40, y: 60, color: 1 },
    graph: { nodes, edges },
  }
}

const plainNode: GraphNode = {
  id: 'a',
  type: 'text-to-image',
  position: { x: 10, y: 20 },
  data: { model: 'sdxl', candidateCount: 4 },
}

beforeEach(() => {
  localStorage.clear()
})

describe('serializeNode — 白名单重建', () => {
  it('keeps the definition-state fields', () => {
    const out = serializeNode(plainNode)
    expect(out).toEqual({
      id: 'a',
      type: 'text-to-image',
      position: { x: 10, y: 20 },
      data: { model: 'sdxl', candidateCount: 4 },
    })
  })

  it('keeps adopted — 它是用户的决定，属于定义态', () => {
    const out = serializeNode({ ...plainNode, adopted: { assetId: 'asset_1', frozen: true } })
    expect(out.adopted).toEqual({ assetId: 'asset_1', frozen: true })
  })

  it('drops node-level run state and UI state', () => {
    // Vue Flow 处理过的节点上会挂着这些；它们不是图的一部分
    const polluted = {
      ...plainNode,
      selected: true,
      dragging: false,
      dimensions: { width: 140, height: 60 },
      computedPosition: { x: 1, y: 2 },
    } as unknown as GraphNode

    const out = serializeNode(polluted)
    expect(Object.keys(out).sort()).toEqual(['data', 'id', 'position', 'type'])
  })

  it('drops run state nested inside data', () => {
    const polluted: GraphNode = {
      ...plainNode,
      data: {
        model: 'sdxl',
        status: 'running',
        progress: 60,
        candidates: [{ assetId: 'x' }],
        error: { code: 'E' },
        reused: true,
      },
    }

    const out = serializeNode(polluted)
    expect(out.data).toEqual({ model: 'sdxl' })
    for (const key of ['status', 'progress', 'candidates', 'error', 'reused']) {
      expect(out.data).not.toHaveProperty(key)
    }
  })
})

describe('round-trip', () => {
  /**
   * 设计文档 §10 的硬性验收：保存工作流时不序列化任何运行态与 UI 态。
   * 这里把每一类脏字段都塞进去，跑完一个来回后断言它们全没了。
   */
  it('strips every forbidden key through a full save → load round trip', () => {
    const dirty = {
      id: 'dirty',
      type: 'text-to-image',
      position: { x: 1, y: 2 },
      data: Object.fromEntries([
        ...FORBIDDEN_KEYS.map(k => [k, 'junk']),
        ['model', 'sdxl'],
      ]),
      ...Object.fromEntries(FORBIDDEN_KEYS.map(k => [k, 'junk'])),
    } as unknown as GraphNode

    expect(saveProject(PROJECT, [workflow([dirty])])).toBe(true)
    const loaded = loadProject(PROJECT)
    expect(loaded).toHaveLength(1)

    const node = loaded![0]!.graph.nodes[0]!
    for (const key of FORBIDDEN_KEYS) {
      expect(node, `节点上不该有 ${key}`).not.toHaveProperty(key)
      expect(node.data, `data 里不该有 ${key}`).not.toHaveProperty(key)
    }
    expect(node.data.model).toBe('sdxl')
  })

  it('preserves structure, edges and placements', () => {
    const wf = workflow(
      [plainNode, { id: 'b', type: 'llm-script', position: { x: 300, y: 20 }, data: {} }],
      [{ id: 'e1', source: { nodeId: 'a', portId: 'image' }, target: { nodeId: 'b', portId: 'context' } }],
    )

    saveProject(PROJECT, [wf])
    const loaded = loadProject(PROJECT)

    expect(loaded).toHaveLength(1)
    expect(loaded![0]!.name).toBe('剧本')
    expect(loaded![0]!.placement).toEqual({ x: 40, y: 60, color: 1 })
    expect(loaded![0]!.graph.nodes.map(n => n.id)).toEqual(['a', 'b'])
    expect(loaded![0]!.graph.edges[0]).toEqual({
      id: 'e1',
      source: { nodeId: 'a', portId: 'image' },
      target: { nodeId: 'b', portId: 'context' },
    })
  })

  it('round-trips adopted so 冻结状态在重开后还在', () => {
    const node: GraphNode = { ...plainNode, adopted: { assetId: 'asset_9', frozen: true } }
    saveProject(PROJECT, [workflow([node])])
    expect(loadProject(PROJECT)![0]!.graph.nodes[0]!.adopted).toEqual({ assetId: 'asset_9', frozen: true })
  })

  it('omits placement.color when the workflow has none', () => {
    const wf: Workflow = { ...workflow([plainNode]), placement: { x: 0, y: 0 } }
    const payload = toPayload(PROJECT, [wf])
    expect(payload.workflows[0]!.placement).not.toHaveProperty('color')
  })
})

describe('loadProject robustness', () => {
  it('returns undefined when nothing is stored', () => {
    expect(loadProject(PROJECT)).toBeUndefined()
  })

  it('returns undefined for corrupt JSON instead of throwing', () => {
    localStorage.setItem(storageKey(PROJECT), '{not json')
    expect(loadProject(PROJECT)).toBeUndefined()
  })

  it('returns undefined when the payload shape is wrong', () => {
    localStorage.setItem(storageKey(PROJECT), JSON.stringify({ workflows: 'nope' }))
    expect(loadProject(PROJECT)).toBeUndefined()
  })

  it('drops malformed workflows but keeps the good ones', () => {
    const good = toPayload(PROJECT, [workflow([plainNode])])
    const mixed = { ...good, workflows: [...good.workflows, { id: 42 }, null] }
    expect(fromPayload(mixed)).toHaveLength(1)
  })

  it('scrubs on read too — 磁盘上的数据同样不被信任', () => {
    localStorage.setItem(storageKey(PROJECT), JSON.stringify({
      version: PAYLOAD_VERSION,
      id: PROJECT,
      updatedAt: new Date().toISOString(),
      workflows: [{
        id: 'wf1',
        name: 'x',
        placement: { x: 0, y: 0 },
        graph: { nodes: [{ id: 'a', type: 't', position: { x: 0, y: 0 }, data: {}, status: 'running' }], edges: [] },
      }],
    }))
    expect(loadProject(PROJECT)![0]!.graph.nodes[0]).not.toHaveProperty('status')
  })

  it('clearProject removes the draft', () => {
    saveProject(PROJECT, [workflow([plainNode])])
    clearProject(PROJECT)
    expect(loadProject(PROJECT)).toBeUndefined()
  })
})

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('writes only after the debounce window', () => {
    const autosave = createAutosave(PROJECT, () => [workflow([plainNode])], 2000)
    autosave.schedule()

    vi.advanceTimersByTime(1999)
    expect(loadProject(PROJECT)).toBeUndefined()
    expect(autosave.isPending()).toBe(true)

    vi.advanceTimersByTime(1)
    expect(loadProject(PROJECT)).toHaveLength(1)
    expect(autosave.isPending()).toBe(false)
  })

  it('resets the timer on repeated scheduling — 连续拖拽不会每帧写盘', () => {
    let reads = 0
    const autosave = createAutosave(PROJECT, () => {
      reads += 1
      return [workflow([plainNode])]
    }, 2000)

    for (let i = 0; i < 10; i += 1) {
      autosave.schedule()
      vi.advanceTimersByTime(100)
    }
    expect(reads).toBe(0)

    vi.advanceTimersByTime(2000)
    expect(reads).toBe(1)
  })

  it('flush writes immediately and cancels the pending timer', () => {
    const autosave = createAutosave(PROJECT, () => [workflow([plainNode])], 2000)
    autosave.schedule()
    autosave.flush()

    expect(loadProject(PROJECT)).toHaveLength(1)
    expect(autosave.isPending()).toBe(false)

    // 待执行的定时器已取消，再等也不会重复写
    vi.advanceTimersByTime(5000)
    expect(autosave.isPending()).toBe(false)
  })

  it('cancel drops the pending write without saving', () => {
    const autosave = createAutosave(PROJECT, () => [workflow([plainNode])], 2000)
    autosave.schedule()
    autosave.cancel()
    vi.advanceTimersByTime(5000)
    expect(loadProject(PROJECT)).toBeUndefined()
  })

  it('uses a 2s default window', () => {
    expect(AUTOSAVE_DELAY_MS).toBe(2000)
  })
})
