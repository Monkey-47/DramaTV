import type { GraphEdge, GraphNode, WorkflowGraph } from '@/features/graph/graph.types'
import type { NodeStatusEvent, RunDoneEvent } from '@/features/runner/runner.types'
import { describe, expect, it } from 'vitest'
import { buildRunSchedule } from '../fake-backend'

// ── 工厂 ────────────────────────────────────────────────────────────────────

function node(id: string, data: Record<string, unknown> = {}, type = 'text-to-image'): GraphNode {
  return { id, type, position: { x: 0, y: 0 }, data }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return { id, source: { nodeId: from, portId: 'out' }, target: { nodeId: to, portId: 'in' } }
}

/** a → b → c，a → x（x 是旁支，与 b/c 无依赖） */
const BRANCHED: WorkflowGraph = {
  nodes: [node('a'), node('b'), node('c'), node('x')],
  edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'x')],
}

function build(overrides: Partial<Parameters<typeof buildRunSchedule>[0]> = {}) {
  return buildRunSchedule({
    runId: 'run_1',
    workflowId: 'wf_1',
    graph: BRANCHED,
    scope: { kind: 'workflow' },
    startSeq: 100,
    startAt: 1_000_000,
    ...overrides,
  })
}

function statusesFor(events: ReturnType<typeof build>, nodeId: string) {
  return events
    .map(s => s.event)
    .filter((e): e is NodeStatusEvent => e.type === 'node.status' && e.nodeId === nodeId)
    .map(e => e.status)
}

function finalStatuses(events: ReturnType<typeof build>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { event } of events) {
    if (event.type === 'node.status') {
      out[event.nodeId] = event.status
    }
  }
  return out
}

// ── 时间表的基本不变量 ──────────────────────────────────────────────────────

describe('buildRunSchedule 不变量', () => {
  it('seq 严格单调递增', () => {
    const events = build()
    const seqs = events.map(s => s.event.seq)
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!)
    }
  })

  it('seq 从 startSeq + 1 开始（不占用调用方已用掉的号）', () => {
    expect(build({ startSeq: 100 })[0]!.event.seq).toBe(101)
  })

  it('延迟单调不减', () => {
    const delays = build().map(s => s.delayMs)
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!)
    }
  })

  it('时间戳随延迟同步推进', () => {
    const events = build({ startAt: 1_000_000 })
    expect(events[0]!.event.at).toBe(1_000_000 + events[0]!.delayMs)
  })

  it('所有事件属于同一个 runId', () => {
    for (const { event } of build()) {
      expect(event.runId).toBe('run_1')
    }
  })

  it('以 run.done 收尾', () => {
    const events = build()
    expect(events[events.length - 1]!.event.type).toBe('run.done')
  })

  it('以 run.status running 开场', () => {
    const events = build()
    expect(events[0]!.event).toMatchObject({ type: 'run.status', status: 'queued' })
    expect(events[1]!.event).toMatchObject({ type: 'run.status', status: 'running' })
  })
})

// ── 正常路径 ────────────────────────────────────────────────────────────────

describe('成功路径', () => {
  it('全图执行时每个节点都经历 queued → running → succeeded', () => {
    const events = build({ scope: { kind: 'workflow' } })
    for (const id of ['a', 'b', 'c', 'x']) {
      expect(statusesFor(events, id)).toEqual(['queued', 'running', 'succeeded'])
    }
  })

  it('每个节点都发出进度事件，数值在 0–100 之间且递增', () => {
    const events = build()
    const progress = events
      .map(s => s.event)
      .filter(e => e.type === 'node.progress' && e.nodeId === 'a')
      .map(e => (e as { progress: number }).progress)

    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every(p => p >= 0 && p <= 100)).toBe(true)
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]!).toBeGreaterThan(progress[i - 1]!)
    }
  })

  it('成功的节点会给出候选产出', () => {
    const events = build()
    const candidates = events.filter(s => s.event.type === 'node.candidates')
    expect(candidates.length).toBeGreaterThanOrEqual(4)
  })

  it('候选数量取自节点的 candidateCount 参数', () => {
    const g: WorkflowGraph = { nodes: [node('a', { candidateCount: 3 })], edges: [] }
    const events = buildRunSchedule({
      runId: 'r',
      workflowId: 'w',
      graph: g,
      scope: { kind: 'workflow' },
      startSeq: 0,
      startAt: 0,
    })
    const ev = events.find(s => s.event.type === 'node.candidates')!.event as { candidates: unknown[] }
    expect(ev.candidates).toHaveLength(3)
  })

  function shapeOf(type: string, data: Record<string, unknown> = {}) {
    const g: WorkflowGraph = { nodes: [node('a', data, type)], edges: [] }
    const events = buildRunSchedule({
      runId: 'r',
      workflowId: 'w',
      graph: g,
      scope: { kind: 'workflow' },
      startSeq: 0,
      startAt: 0,
    })
    const ev = events.find(s => s.event.type === 'node.candidates')!.event as {
      candidates: Array<{ mime: string, url: string, width?: number }>
    }
    return ev.candidates
  }

  it('图生视频产出 video/mp4，不是图片', () => {
    const c = shapeOf('image-to-video')
    expect(c[0]!.mime).toBe('video/mp4')
    expect(c[0]!.url).toMatch(/\.mp4$/)
  })

  it('放大是确定性处理，固定 1 个候选', () => {
    expect(shapeOf('upscale')).toHaveLength(1)
  })

  it('文生图默认 4 个候选', () => {
    expect(shapeOf('text-to-image')).toHaveLength(4)
  })

  it('文本产出用 .txt 且不带尺寸', () => {
    const c = shapeOf('llm-script')
    expect(c).toHaveLength(1)
    expect(c[0]!.url).toMatch(/\.txt$/)
    expect(c[0]!.width).toBeUndefined()
  })

  it('未登记的节点类型退回图片形态，不会崩', () => {
    const c = shapeOf('some-future-node')
    expect(c[0]!.mime).toBe('image/png')
  })

  it('run.done 报 succeeded 并给出实际花费', () => {
    const events = build()
    const done = events[events.length - 1]!.event as RunDoneEvent
    expect(done.status).toBe('succeeded')
    expect(done.cost.actual).toBeGreaterThan(0)
    expect(done.cost.estimated).toBeGreaterThan(0)
  })

  it('整图执行的耗时不低于 minDuration（UI 来得及展示状态流转）', () => {
    const events = build()
    expect(events[events.length - 1]!.delayMs).toBeGreaterThanOrEqual(1200)
  })
})

// ── 复用 ────────────────────────────────────────────────────────────────────

describe('复用标记', () => {
  it('整图执行时没有节点走缓存', () => {
    const events = build({ scope: { kind: 'workflow' } })
    const reused = events
      .map(s => s.event)
      .filter(e => e.type === 'node.status' && e.reused === true)
    expect(reused).toHaveLength(0)
  })

  it('只跑 b 时，上游 a 走缓存（设计文档 §3.4）', () => {
    const events = build({ scope: { kind: 'node', nodeIds: ['b'] } })
    const reusedIds = events
      .map(s => s.event)
      .filter((e): e is NodeStatusEvent => e.type === 'node.status' && e.reused === true)
      .map(e => e.nodeId)
    expect(reusedIds).toContain('a')
    expect(reusedIds).not.toContain('b')
  })

  it('复用节点直接 succeeded，不经历 running', () => {
    const events = build({ scope: { kind: 'node', nodeIds: ['b'] } })
    expect(statusesFor(events, 'a')).toEqual(['queued', 'succeeded'])
  })

  it('只跑 b 时不碰无关分支 x 与下游 c', () => {
    const events = build({ scope: { kind: 'node', nodeIds: ['b'] } })
    const touched = new Set(
      events.map(s => s.event).filter(e => e.type === 'node.status').map(e => (e as NodeStatusEvent).nodeId),
    )
    expect(touched.has('x')).toBe(false)
    expect(touched.has('c')).toBe(false)
  })

  it('downstream 作用域下上游走缓存，自己和下游真跑', () => {
    const events = build({ scope: { kind: 'downstream', nodeId: 'b' } })
    const reusedIds = events
      .map(s => s.event)
      .filter((e): e is NodeStatusEvent => e.type === 'node.status' && e.reused === true)
      .map(e => e.nodeId)

    expect(reusedIds).toEqual(['a'])
    expect(statusesFor(events, 'b')).toEqual(['queued', 'running', 'succeeded'])
    expect(statusesFor(events, 'c')).toEqual(['queued', 'running', 'succeeded'])
  })

  it('downstream 作用域不碰旁支 x', () => {
    const events = build({ scope: { kind: 'downstream', nodeId: 'b' } })
    const touched = new Set(
      events.map(s => s.event).filter(e => e.type === 'node.status').map(e => (e as NodeStatusEvent).nodeId),
    )
    expect(touched.has('x')).toBe(false)
  })
})

// ── 三种作用域确实不同 ──────────────────────────────────────────────────────

describe('runScope 三种作用域的行为差异', () => {
  it('跑动的节点集合各不相同', () => {
    const collect = (events: ReturnType<typeof build>) =>
      [...new Set(events.map(s => s.event).filter(e => e.type === 'node.status').map(e => (e as NodeStatusEvent).nodeId))].sort()

    const whole = collect(build({ scope: { kind: 'workflow' } }))
    const one = collect(build({ scope: { kind: 'node', nodeIds: ['b'] } }))
    const down = collect(build({ scope: { kind: 'downstream', nodeId: 'b' } }))

    expect(whole).toEqual(['a', 'b', 'c', 'x'])
    expect(one).toEqual(['a', 'b'])
    expect(down).toEqual(['a', 'b', 'c'])
  })
})

// ── 部分失败（设计文档 §4.4）────────────────────────────────────────────────

describe('部分失败', () => {
  it('失败节点的下游变 skipped', () => {
    const events = build({ failNodeId: 'b' })
    expect(finalStatuses(events).c).toBe('skipped')
  })

  it('旁支继续跑完，不被连坐', () => {
    const events = build({ failNodeId: 'b' })
    expect(finalStatuses(events).x).toBe('succeeded')
  })

  it('上游保持成功', () => {
    const events = build({ failNodeId: 'b' })
    expect(finalStatuses(events).a).toBe('succeeded')
  })

  it('失败节点带 error 且 retryable 为 false（生成类不可自动重试）', () => {
    const events = build({ failNodeId: 'b' })
    const failed = events
      .map(s => s.event)
      .find(e => e.type === 'node.status' && e.status === 'failed') as NodeStatusEvent
    expect(failed.error).toEqual({
      code: 'MODEL_LOAD_FAILED',
      retryable: false,
      message: '模型加载失败',
    })
  })

  it('失败节点不产出候选', () => {
    const events = build({ failNodeId: 'b' })
    const withCandidates = events
      .map(s => s.event)
      .filter(e => e.type === 'node.candidates')
      .map(e => (e as { nodeId: string }).nodeId)
    expect(withCandidates).not.toContain('b')
  })

  it('run.done 落在 partial', () => {
    const events = build({ failNodeId: 'b' })
    const done = events[events.length - 1]!.event as RunDoneEvent
    expect(done.status).toBe('partial')
  })

  it('上游节点失败时下游全部 skipped', () => {
    const events = build({ failNodeId: 'a' })
    const finals = finalStatuses(events)
    expect(finals.b).toBe('skipped')
    expect(finals.c).toBe('skipped')
    expect(finals.x).toBe('skipped')
  })

  it('不指定失败节点时全部成功', () => {
    const events = build()
    expect(Object.values(finalStatuses(events)).every(s => s === 'succeeded')).toBe(true)
  })
})

// ── 边界 ────────────────────────────────────────────────────────────────────

describe('边界情况', () => {
  it('空图仍能产出合法事件序列', () => {
    const events = buildRunSchedule({
      runId: 'r',
      workflowId: 'w',
      graph: { nodes: [], edges: [] },
      scope: { kind: 'workflow' },
      startSeq: 0,
      startAt: 0,
    })
    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1]!.event.type).toBe('run.done')
  })

  it('node 作用域指向不存在的节点时不崩，且没有节点事件', () => {
    const events = build({ scope: { kind: 'node', nodeIds: ['ghost'] } })
    expect(events.filter(s => s.event.type === 'node.status')).toHaveLength(0)
    expect(events[events.length - 1]!.event.type).toBe('run.done')
  })

  it('图中存在环时不抛错（mock 不该因为脏图崩掉）', () => {
    const cyclic: WorkflowGraph = {
      nodes: [node('a'), node('b')],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    }
    expect(() =>
      buildRunSchedule({
        runId: 'r',
        workflowId: 'w',
        graph: cyclic,
        scope: { kind: 'workflow' },
        startSeq: 0,
        startAt: 0,
      }),
    ).not.toThrow()
  })

  it('完全不相连的节点按声明顺序执行', () => {
    const g: WorkflowGraph = { nodes: [node('a'), node('b')], edges: [] }
    const events = buildRunSchedule({
      runId: 'r',
      workflowId: 'w',
      graph: g,
      scope: { kind: 'workflow' },
      startSeq: 0,
      startAt: 0,
    })
    const order = events
      .map(s => s.event)
      .filter((e): e is NodeStatusEvent => e.type === 'node.status' && e.status === 'queued')
      .map(e => e.nodeId)
    expect(order).toEqual(['a', 'b'])
  })
})
