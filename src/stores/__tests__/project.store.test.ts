import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project.store'

// 设计文档 §7.4 只把「拖拽/缩放/框选」这类画布交互排除在单测外，
// store 是纯状态逻辑，值得测。

let store: ReturnType<typeof useProjectStore>

beforeEach(() => {
  setActivePinia(createPinia())
  store = useProjectStore()
})

describe('moveNode', () => {
  it('writes the position back onto the graph node', () => {
    store.moveNode('wf-script', 'idea', { x: 123, y: 456 })
    const node = store.findNode('idea')
    expect(node?.node.position).toEqual({ x: 123, y: 456 })
  })

  it('ignores unknown workflow or node ids instead of throwing', () => {
    expect(() => store.moveNode('nope', 'idea', { x: 1, y: 1 })).not.toThrow()
    expect(() => store.moveNode('wf-script', 'nope', { x: 1, y: 1 })).not.toThrow()
  })

  it('keeps the position workflow-relative (no placement offset applied)', () => {
    store.moveNode('wf-character', 'triple', { x: 10, y: 20 })
    expect(store.findNode('triple')?.node.position).toEqual({ x: 10, y: 20 })
    // 分区的 placement 不受影响 —— 偏移叠加只允许发生在 features/canvas 内
    expect(store.findWorkflow('wf-character')?.placement.x).toBe(900)
  })
})

describe('moveWorkflow', () => {
  it('updates the placement but preserves its color', () => {
    store.moveWorkflow('wf-shot', { x: 2000, y: 300 })
    const wf = store.findWorkflow('wf-shot')
    expect(wf?.placement.x).toBe(2000)
    expect(wf?.placement.y).toBe(300)
    expect(wf?.placement.color).toBe(3)
  })
})

describe('addWorkflow', () => {
  it('appends a new empty workflow and returns its id', () => {
    const id = store.addWorkflow('新分区', { x: 2200, y: 40, color: 4 })
    expect(store.workflows).toHaveLength(4)
    const wf = store.findWorkflow(id)
    expect(wf?.name).toBe('新分区')
    expect(wf?.graph.nodes).toEqual([])
    expect(wf?.graph.edges).toEqual([])
  })

  it('generates unique ids', () => {
    const a = store.addWorkflow('a', { x: 0, y: 0 })
    const b = store.addWorkflow('b', { x: 0, y: 0 })
    expect(a).not.toBe(b)
  })

  it('does not touch existing workflows', () => {
    const before = store.workflows.length
    store.addWorkflow('x', { x: 0, y: 0 })
    expect(store.workflows).toHaveLength(before + 1)
    expect(store.findWorkflow('wf-script')?.graph.nodes).toHaveLength(3)
  })
})

describe('removeWorkflow', () => {
  it('drops the workflow by id', () => {
    store.removeWorkflow('wf-character')
    expect(store.workflows).toHaveLength(2)
    expect(store.findWorkflow('wf-character')).toBeUndefined()
  })

  it('leaves the others intact', () => {
    store.removeWorkflow('wf-character')
    expect(store.findWorkflow('wf-script')?.graph.nodes).toHaveLength(3)
    // 镜头 1 是「关键帧 → 放大 → 片段」三段管线
    expect(store.findWorkflow('wf-shot')?.graph.nodes).toHaveLength(3)
  })

  it('is a no-op for an unknown id', () => {
    store.removeWorkflow('nope')
    expect(store.workflows).toHaveLength(3)
  })
})

describe('renameWorkflow', () => {
  it('changes the name', () => {
    store.renameWorkflow('wf-script', '第一幕')
    expect(store.findWorkflow('wf-script')?.name).toBe('第一幕')
  })

  it('is a no-op for an unknown id', () => {
    expect(() => store.renameWorkflow('nope', 'x')).not.toThrow()
  })
})

describe('removeNodes', () => {
  it('removes the nodes', () => {
    store.removeNodes(['idea'])
    expect(store.findWorkflow('wf-script')?.graph.nodes.map(n => n.id)).toEqual(['script', 'storyboard'])
  })

  it('also drops edges that referenced a removed node', () => {
    // wf-script 有 e1(idea→script) 和 e2(script→storyboard)
    store.removeNodes(['script'])
    const edges = store.findWorkflow('wf-script')?.graph.edges ?? []
    expect(edges.map(e => e.id)).toEqual([])
  })

  it('keeps edges whose endpoints both survive', () => {
    store.removeNodes(['storyboard'])
    const edges = store.findWorkflow('wf-script')?.graph.edges ?? []
    // e1 两端都还在，e2 指向被删的 storyboard
    expect(edges.map(e => e.id)).toEqual(['e1'])
  })

  it('spans workflows', () => {
    store.removeNodes(['idea', 'triple'])
    expect(store.findNode('idea')).toBeUndefined()
    expect(store.findNode('triple')).toBeUndefined()
    expect(store.findNode('script')).toBeDefined()
  })

  it('handles an empty id list', () => {
    store.removeNodes([])
    expect(store.findWorkflow('wf-script')?.graph.nodes).toHaveLength(3)
  })
})

describe('$reset', () => {
  it('restores the initial workflows', () => {
    store.removeWorkflow('wf-script')
    store.moveNode('wf-character', 'triple', { x: 999, y: 999 })
    store.$reset()
    expect(store.workflows).toHaveLength(3)
    expect(store.findNode('triple')?.node.position).toEqual({ x: 60, y: 60 })
  })
})

// ── 采用与冻结（设计文档 §3.2，MVP 1.10 / 1.11）─────────────────────────────

describe('adoptCandidate', () => {
  it('writes adopted onto the node — 这是用户的决定，属于定义态', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_triple_2')
    expect(store.findNode('triple')?.node.adopted).toEqual({
      assetId: 'asset_triple_2',
      frozen: false,
    })
  })

  it('resets frozen when switching to a different asset', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_a')
    store.setFrozen('wf-character', 'triple', true)
    expect(store.findNode('triple')?.node.adopted?.frozen).toBe(true)

    // 换了一张图就不再是"锁定原来那张"，必须重新确认
    store.adoptCandidate('wf-character', 'triple', 'asset_b')
    expect(store.findNode('triple')?.node.adopted).toEqual({ assetId: 'asset_b', frozen: false })
  })

  it('never writes candidates — 运行态不进 GraphNode', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_a')
    const node = store.findNode('triple')?.node
    expect(node).not.toHaveProperty('candidates')
    expect(node).not.toHaveProperty('status')
    expect(node).not.toHaveProperty('progress')
  })

  it('ignores unknown ids instead of throwing', () => {
    expect(() => store.adoptCandidate('nope', 'triple', 'a')).not.toThrow()
    expect(() => store.adoptCandidate('wf-character', 'nope', 'a')).not.toThrow()
  })
})

describe('setFrozen', () => {
  it('locks an adopted output', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_a')
    store.setFrozen('wf-character', 'triple', true)
    expect(store.findNode('triple')?.node.adopted).toEqual({ assetId: 'asset_a', frozen: true })
  })

  it('unlocks without losing the adopted asset', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_a')
    store.setFrozen('wf-character', 'triple', true)
    store.setFrozen('wf-character', 'triple', false)
    expect(store.findNode('triple')?.node.adopted).toEqual({ assetId: 'asset_a', frozen: false })
  })

  it('is a no-op when nothing is adopted — 冻结的是产出，不是节点', () => {
    store.setFrozen('wf-character', 'triple', true)
    expect(store.findNode('triple')?.node.adopted).toBeUndefined()
  })

  it('ignores unknown ids instead of throwing', () => {
    expect(() => store.setFrozen('nope', 'triple', true)).not.toThrow()
  })
})

describe('clearAdopted', () => {
  it('removes the adoption and the freeze together', () => {
    store.adoptCandidate('wf-character', 'triple', 'asset_a')
    store.setFrozen('wf-character', 'triple', true)
    store.clearAdopted('wf-character', 'triple')
    expect(store.findNode('triple')?.node.adopted).toBeUndefined()
  })
})

describe('replaceWorkflows', () => {
  it('swaps the whole set — 草稿就是权威，不做合并', () => {
    store.replaceWorkflows([{
      id: 'wf-only',
      name: '唯一',
      placement: { x: 0, y: 0 },
      graph: { nodes: [], edges: [] },
    }])
    expect(store.workflows).toHaveLength(1)
    expect(store.findWorkflow('wf-script')).toBeUndefined()
  })
})

describe('seedWorkflows', () => {
  it('hands out a fresh copy each call — 避免调用方改到种子数据本身', () => {
    const a = store.seedWorkflows()
    const b = store.seedWorkflows()
    expect(a).not.toBe(b)
    a[0]!.name = '被改了'
    expect(b[0]!.name).not.toBe('被改了')
  })
})
