import type {
  NodeCandidatesEvent,
  NodeProgressEvent,
  NodeRunState,
  NodeStatusEvent,
  RunDoneEvent,
  RunnerEvent,
  RunState,
  RunStatusEvent,
} from '../runner.types'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/features/graph/graph.types'
import { describe, expect, it } from 'vitest'
import { reduceEvent, reduceEvents } from '../reduce'

// ── 工厂 ────────────────────────────────────────────────────────────────────

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return { id, source: { nodeId: from, portId: 'out' }, target: { nodeId: to, portId: 'in' } }
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges }
}

function run(overrides: Partial<RunState> = {}): RunState {
  return {
    id: 'run_1',
    workflowId: 'wf_1',
    status: 'idle',
    scope: { kind: 'workflow' },
    cost: { currency: 'CNY' },
    nodes: {},
    ...overrides,
  }
}

function nodeState(status: NodeRunState['status'], extra: Partial<NodeRunState> = {}): NodeRunState {
  return { status, candidates: [], ...extra }
}

let seqCounter = 0
function nextSeq(): number {
  seqCounter += 1
  return seqCounter
}

function statusEvent(nodeId: string, status: NodeRunState['status'], extra: Partial<NodeStatusEvent> = {}): NodeStatusEvent {
  return { type: 'node.status', seq: nextSeq(), runId: 'run_1', at: 1000, nodeId, status, ...extra }
}

function progressEvent(nodeId: string, progress: number): NodeProgressEvent {
  return { type: 'node.progress', seq: nextSeq(), runId: 'run_1', at: 1000, nodeId, progress }
}

function candidatesEvent(nodeId: string, ids: string[]): NodeCandidatesEvent {
  return {
    type: 'node.candidates',
    seq: nextSeq(),
    runId: 'run_1',
    at: 1000,
    nodeId,
    candidates: ids.map(id => ({ assetId: id, url: `https://cdn/${id}.png`, mime: 'image/png' })),
  }
}

function runStatusEvent(status: RunState['status'], extra: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return { type: 'run.status', seq: nextSeq(), runId: 'run_1', at: 1000, status, ...extra }
}

function doneEvent(status: RunState['status']): RunDoneEvent {
  return {
    type: 'run.done',
    seq: nextSeq(),
    runId: 'run_1',
    at: 5000,
    status,
    cost: { currency: 'CNY', estimated: 0.5, actual: 0.19 },
  }
}

// 钻石 + 旁支：a → b → c，a → x（x 与 b/c 无依赖）
const BRANCHED = graph(
  [node('a'), node('b'), node('c'), node('x')],
  [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'x')],
)

// ── 不可变性 ────────────────────────────────────────────────────────────────

describe('reduceEvent 不可变性', () => {
  it('不修改传入的 run 对象', () => {
    const before = run({ nodes: { a: nodeState('running') } })
    const snapshot = JSON.stringify(before)
    reduceEvent(before, statusEvent('a', 'succeeded'))
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('返回新对象', () => {
    const before = run()
    const after = reduceEvent(before, runStatusEvent('running'))
    expect(after).not.toBe(before)
  })
})

// ── run 级状态 ──────────────────────────────────────────────────────────────

describe('run.status', () => {
  it('更新 run 状态', () => {
    const after = reduceEvent(run(), runStatusEvent('running'))
    expect(after.status).toBe('running')
  })

  it('带 cost 时一并更新', () => {
    const after = reduceEvent(run(), runStatusEvent('running', { cost: { currency: 'CNY', estimated: 1.2 } }))
    expect(after.cost.estimated).toBe(1.2)
  })

  it('不带 cost 时保留原有 cost', () => {
    const before = run({ cost: { currency: 'CNY', estimated: 1.2 } })
    const after = reduceEvent(before, runStatusEvent('running'))
    expect(after.cost.estimated).toBe(1.2)
  })

  it('离开 idle 时记录 startedAt', () => {
    const after = reduceEvent(run(), runStatusEvent('running'))
    expect(after.startedAt).toBe(1000)
  })
})

// ── 节点级状态 ──────────────────────────────────────────────────────────────

describe('node.status', () => {
  it('为未知节点建条目（事件可能先于 run 的其它信息到达）', () => {
    const after = reduceEvent(run(), statusEvent('a', 'queued'))
    expect(after.nodes.a?.status).toBe('queued')
  })

  it('更新已存在节点的状态', () => {
    const before = run({ nodes: { a: nodeState('queued') } })
    const after = reduceEvent(before, statusEvent('a', 'running'))
    expect(after.nodes.a?.status).toBe('running')
  })

  it('转 running 时记录 startedAt', () => {
    const after = reduceEvent(run(), statusEvent('a', 'running'))
    expect(after.nodes.a?.startedAt).toBe(1000)
  })

  it('到达终态时记录 finishedAt', () => {
    const after = reduceEvent(run(), statusEvent('a', 'succeeded'))
    expect(after.nodes.a?.finishedAt).toBe(1000)
  })

  it('传递 reused 标记（复用缓存 vs 真跑必须可区分，设计文档 §4.3）', () => {
    const after = reduceEvent(run(), statusEvent('a', 'succeeded', { reused: true }))
    expect(after.nodes.a?.reused).toBe(true)
  })

  it('未带 reused 时不写入该字段', () => {
    const after = reduceEvent(run(), statusEvent('a', 'succeeded'))
    expect(after.nodes.a?.reused).toBeUndefined()
  })

  it('失败时带 error', () => {
    const err = { code: 'MODEL_LOAD_FAILED', retryable: false, message: '模型加载失败' }
    const after = reduceEvent(run(), statusEvent('a', 'failed', { error: err }))
    expect(after.nodes.a?.error).toEqual(err)
  })

  it('其它节点的状态不受影响', () => {
    const before = run({ nodes: { a: nodeState('running'), b: nodeState('queued') } })
    const after = reduceEvent(before, statusEvent('a', 'succeeded'))
    expect(after.nodes.b?.status).toBe('queued')
  })

  it('未知节点 + 无图 时也不崩', () => {
    expect(() => reduceEvent(run(), statusEvent('ghost', 'running'))).not.toThrow()
  })
})

// ── 进度 ────────────────────────────────────────────────────────────────────

describe('node.progress', () => {
  it('更新进度值', () => {
    const before = run({ nodes: { a: nodeState('running') } })
    const after = reduceEvent(before, progressEvent('a', 42))
    expect(after.nodes.a?.progress).toBe(42)
  })

  it('不改变状态', () => {
    const before = run({ nodes: { a: nodeState('running') } })
    const after = reduceEvent(before, progressEvent('a', 42))
    expect(after.nodes.a?.status).toBe('running')
  })

  it('进度事件到达未知节点时不崩', () => {
    expect(() => reduceEvent(run(), progressEvent('ghost', 10))).not.toThrow()
  })
})

// ── 候选 ────────────────────────────────────────────────────────────────────

describe('node.candidates', () => {
  it('写入候选列表', () => {
    const before = run({ nodes: { a: nodeState('running') } })
    const after = reduceEvent(before, candidatesEvent('a', ['asset_1', 'asset_2']))
    expect(after.nodes.a?.candidates.map(c => c.assetId)).toEqual(['asset_1', 'asset_2'])
  })

  it('候选重复到达时整体替换，而不是追加（重跑会推翻上次的候选）', () => {
    let state = run({ nodes: { a: nodeState('succeeded') } })
    state = reduceEvent(state, candidatesEvent('a', ['asset_1', 'asset_2']))
    state = reduceEvent(state, candidatesEvent('a', ['asset_9']))
    expect(state.nodes.a?.candidates.map(c => c.assetId)).toEqual(['asset_9'])
  })
})

// ── 部分失败：DAG 语义（设计文档 §4.4）──────────────────────────────────────

describe('部分失败传播', () => {
  it('节点失败使其全部下游变 skipped', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('succeeded'), b: nodeState('running'), c: nodeState('pending'), x: nodeState('running') } })
    state = reduceEvent(state, statusEvent('b', 'failed', { error: { code: 'X', retryable: false, message: 'boom' } }), BRANCHED)
    expect(state.nodes.c?.status).toBe('skipped')
  })

  it('无关分支继续跑，不被连坐', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('succeeded'), b: nodeState('running'), c: nodeState('pending'), x: nodeState('running') } })
    state = reduceEvent(state, statusEvent('b', 'failed'), BRANCHED)
    expect(state.nodes.x?.status).toBe('running')
  })

  it('上游不受影响', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('succeeded'), b: nodeState('running') } })
    state = reduceEvent(state, statusEvent('b', 'failed'), BRANCHED)
    expect(state.nodes.a?.status).toBe('succeeded')
  })

  it('传递闭包：隔着多层的下游也变 skipped', () => {
    const chain = graph([node('a'), node('b'), node('c'), node('d')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd')])
    let state = run({ status: 'running' })
    state = reduceEvent(state, statusEvent('b', 'failed'), chain)
    expect(state.nodes.c?.status).toBe('skipped')
    expect(state.nodes.d?.status).toBe('skipped')
  })

  it('不覆盖已经到达终态的下游节点', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('running'), b: nodeState('succeeded') } })
    state = reduceEvent(state, statusEvent('a', 'failed'), BRANCHED)
    expect(state.nodes.b?.status).toBe('succeeded')
  })

  it('无图时不传播（不崩，也不误标）', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('running'), b: nodeState('pending') } })
    state = reduceEvent(state, statusEvent('a', 'failed'))
    expect(state.nodes.b?.status).toBe('pending')
  })

  it('skipped 节点记录 finishedAt', () => {
    let state = run({ status: 'running', nodes: { a: nodeState('running') } })
    state = reduceEvent(state, statusEvent('a', 'failed'), BRANCHED)
    expect(state.nodes.b?.finishedAt).toBe(1000)
  })
})

// ── 终止 ────────────────────────────────────────────────────────────────────

describe('run.done', () => {
  it('落定 run 状态与 cost', () => {
    const after = reduceEvent(run({ status: 'running' }), doneEvent('succeeded'))
    expect(after.status).toBe('succeeded')
    expect(after.cost.actual).toBe(0.19)
  })

  it('记录 finishedAt', () => {
    const after = reduceEvent(run({ status: 'running' }), doneEvent('succeeded'))
    expect(after.finishedAt).toBe(5000)
  })

  it('部分失败时落在 partial', () => {
    const after = reduceEvent(run({ status: 'running' }), doneEvent('partial'))
    expect(after.status).toBe('partial')
  })
})

// ── 乱序与未知事件 ──────────────────────────────────────────────────────────

describe('乱序与异常输入', () => {
  it('seq 回退的事件不崩（重连补齐可能重叠）', () => {
    const before = run({ nodes: { a: nodeState('running') } })
    const stale: NodeProgressEvent = { type: 'node.progress', seq: 1, runId: 'run_1', at: 900, nodeId: 'a', progress: 5 }
    expect(() => reduceEvent(before, stale)).not.toThrow()
  })

  it('runId 不匹配的事件不崩（reducer 不负责路由）', () => {
    const other: RunStatusEvent = { type: 'run.status', seq: 99, runId: 'run_other', at: 1000, status: 'failed' }
    expect(() => reduceEvent(run(), other)).not.toThrow()
  })

  it('终止后到达的进度事件不崩', () => {
    const before = run({ status: 'succeeded', nodes: { a: nodeState('succeeded') } })
    expect(() => reduceEvent(before, progressEvent('a', 80))).not.toThrow()
  })
})

// ── 批处理 ──────────────────────────────────────────────────────────────────

describe('reduceEvents', () => {
  it('按顺序折叠一串事件', () => {
    const events: RunnerEvent[] = [
      runStatusEvent('running'),
      statusEvent('a', 'queued'),
      statusEvent('a', 'running'),
      progressEvent('a', 50),
      candidatesEvent('a', ['asset_1']),
      statusEvent('a', 'succeeded', { reused: true }),
      doneEvent('succeeded'),
    ]
    const state = reduceEvents(run(), events, BRANCHED)
    expect(state.status).toBe('succeeded')
    expect(state.nodes.a?.status).toBe('succeeded')
    expect(state.nodes.a?.progress).toBe(50)
    expect(state.nodes.a?.reused).toBe(true)
    expect(state.nodes.a?.candidates).toHaveLength(1)
  })

  it('空事件列表返回等价的 run', () => {
    const before = run()
    expect(reduceEvents(before, [], BRANCHED)).toEqual(before)
  })

  it('模拟一次完整的部分失败运行', () => {
    const events: RunnerEvent[] = [
      runStatusEvent('running'),
      statusEvent('a', 'succeeded'),
      statusEvent('b', 'running'),
      statusEvent('x', 'running'),
      statusEvent('b', 'failed', { error: { code: 'MODEL_LOAD_FAILED', retryable: false, message: '模型加载失败' } }),
      doneEvent('partial'),
    ]
    const state = reduceEvents(run(), events, BRANCHED)

    expect(state.status).toBe('partial')
    expect(state.nodes.a?.status).toBe('succeeded')
    expect(state.nodes.b?.status).toBe('failed')
    expect(state.nodes.c?.status).toBe('skipped')
    expect(state.nodes.x?.status).toBe('running')
  })
})
