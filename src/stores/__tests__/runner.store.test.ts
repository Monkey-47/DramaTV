import type { GraphEdge, GraphNode, WorkflowGraph } from '@/features/graph/graph.types'
import type { RunnerEvent } from '@/features/runner/runner.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRunnerStore } from '../runner.store'

// ── 工厂 ────────────────────────────────────────────────────────────────────

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return { id, source: { nodeId: from, portId: 'out' }, target: { nodeId: to, portId: 'in' } }
}

const GRAPH: WorkflowGraph = {
  nodes: [node('a'), node('b'), node('c')],
  edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
}

let seq = 0
function ev<T extends RunnerEvent['type']>(type: T, runId: string, payload: Record<string, unknown>): RunnerEvent {
  seq += 1
  return { type, seq, runId, at: 1000, ...payload } as RunnerEvent
}

function resetSeq(): void {
  seq = 0
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetSeq()
})

// ── 创建 run ────────────────────────────────────────────────────────────────

describe('startRun', () => {
  it('返回 runId 并登记一个 idle run', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    expect(runId).toMatch(/^run_/)
    expect(store.runs[runId]?.status).toBe('idle')
    expect(store.runs[runId]?.workflowId).toBe('wf_1')
  })

  it('每次调用产生不同的 runId', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    const b = store.startRun('wf_1', { kind: 'workflow' })
    expect(a).not.toBe(b)
  })

  it('原样保留 scope（三种作用域的行为差异靠它区分）', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'node', nodeIds: ['a'] })
    expect(store.runs[runId]?.scope).toEqual({ kind: 'node', nodeIds: ['a'] })
  })
})

// ── 事件归约 ────────────────────────────────────────────────────────────────

describe('applyEvent', () => {
  it('把事件喂给 reducer 并更新 run', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    expect(store.runs[runId]?.status).toBe('running')
  })

  it('忽略认不出的 runId（事件流是项目级的，可能含别的 run）', () => {
    const store = useRunnerStore()
    expect(() => store.applyEvent(ev('run.status', 'run_unknown', { status: 'running' }))).not.toThrow()
    expect(Object.keys(store.runs)).toHaveLength(0)
  })

  it('无图解析器时失败传播不生效，但状态照常更新', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'running' }))
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'failed' }))
    expect(store.runs[runId]?.nodes.b?.status).toBe('failed')
    expect(store.runs[runId]?.nodes.c).toBeUndefined()
  })

  it('注入图解析器后，失败节点的下游变 skipped（设计文档 §4.4）', () => {
    const store = useRunnerStore()
    store.setGraphResolver(() => GRAPH)
    const runId = store.startRun('wf_1', { kind: 'workflow' })

    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'succeeded' }))
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'failed' }))

    expect(store.runs[runId]?.nodes.c?.status).toBe('skipped')
  })

  it('图解析器按 workflowId 取图', () => {
    const store = useRunnerStore()
    const asked: string[] = []
    store.setGraphResolver((workflowId) => {
      asked.push(workflowId)
      return GRAPH
    })
    const runId = store.startRun('wf_42', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'failed' }))
    expect(asked).toContain('wf_42')
  })

  it('图解析器返回 undefined 时不崩', () => {
    const store = useRunnerStore()
    store.setGraphResolver(() => undefined)
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    expect(() => store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'failed' }))).not.toThrow()
  })

  it('进度事件透传（单位已在 parser 换算成 0–100）', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.progress', runId, { nodeId: 'a', progress: 62 }))
    expect(store.runs[runId]?.nodes.a?.progress).toBe(62)
  })

  it('复用标记透传', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'succeeded', reused: true }))
    expect(store.runs[runId]?.nodes.a?.reused).toBe(true)
  })

  it('run.done 落定状态与成本', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.done', runId, { status: 'partial', cost: { currency: 'CNY', actual: 1.5 } }))
    expect(store.runs[runId]?.status).toBe('partial')
    expect(store.runs[runId]?.cost.actual).toBe(1.5)
  })
})

// ── 活跃 run ────────────────────────────────────────────────────────────────

describe('activeRunIds / runningCount', () => {
  it('新开的 run 不算活跃（idle 不是执行中）', () => {
    const store = useRunnerStore()
    store.startRun('wf_1', { kind: 'workflow' })
    expect(store.runningCount()).toBe(0)
  })

  it('running 状态计入活跃', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    expect(store.runningCount()).toBe(1)
  })

  it('queued 与 submitting 都算活跃', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    const b = store.startRun('wf_2', { kind: 'workflow' })
    store.applyEvent(ev('run.status', a, { status: 'queued' }))
    store.applyEvent(ev('run.status', b, { status: 'submitting' }))
    expect(store.runningCount()).toBe(2)
  })

  it('终止后移出活跃（partial 也算终止）', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    store.applyEvent(ev('run.done', runId, { status: 'partial', cost: { currency: 'CNY' } }))
    expect(store.runningCount()).toBe(0)
  })

  it('多个工作流并行时都计入（设计文档 §1.2 的多工作流并发）', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    const b = store.startRun('wf_2', { kind: 'workflow' })
    store.applyEvent(ev('run.status', a, { status: 'running' }))
    store.applyEvent(ev('run.status', b, { status: 'running' }))
    expect(store.runningCount()).toBe(2)
  })
})

// ── 成本 ────────────────────────────────────────────────────────────────────

describe('成本汇总', () => {
  it('无 run 时为 0', () => {
    const store = useRunnerStore()
    expect(store.totalCost()).toBe(0)
    expect(store.totalEstimatedCost()).toBe(0)
  })

  it('累加各 run 的实际花费', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    const b = store.startRun('wf_2', { kind: 'workflow' })
    store.applyEvent(ev('run.done', a, { status: 'succeeded', cost: { currency: 'CNY', actual: 0.5 } }))
    store.applyEvent(ev('run.done', b, { status: 'succeeded', cost: { currency: 'CNY', actual: 0.25 } }))
    expect(store.totalCost()).toBeCloseTo(0.75)
  })

  it('累加预估花费（顶栏的「¥x / ¥y」）', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', a, { status: 'running', cost: { currency: 'CNY', estimated: 18 } }))
    expect(store.totalEstimatedCost()).toBe(18)
  })

  it('缺 actual 的 run 按 0 计，不产生 NaN', () => {
    const store = useRunnerStore()
    store.startRun('wf_1', { kind: 'workflow' })
    expect(store.totalCost()).toBe(0)
    expect(Number.isNaN(store.totalCost())).toBe(false)
  })
})

// ── 取消 ────────────────────────────────────────────────────────────────────

describe('cancelRun', () => {
  it('把 run 标成 cancelled', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    store.cancelRun(runId)
    expect(store.runs[runId]?.status).toBe('cancelled')
  })

  it('未到终态的节点一并标 cancelled', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'running' }))
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'queued' }))
    store.cancelRun(runId)
    expect(store.runs[runId]?.nodes.a?.status).toBe('cancelled')
    expect(store.runs[runId]?.nodes.b?.status).toBe('cancelled')
  })

  it('已完成的节点保持原状态', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'succeeded' }))
    store.applyEvent(ev('node.status', runId, { nodeId: 'b', status: 'running' }))
    store.cancelRun(runId)
    expect(store.runs[runId]?.nodes.a?.status).toBe('succeeded')
    expect(store.runs[runId]?.nodes.b?.status).toBe('cancelled')
  })

  it('取消后不再计入活跃', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('run.status', runId, { status: 'running' }))
    store.cancelRun(runId)
    expect(store.runningCount()).toBe(0)
  })

  it('取消不存在的 run 不崩', () => {
    const store = useRunnerStore()
    expect(() => store.cancelRun('run_ghost')).not.toThrow()
  })
})

// ── 按工作流取节点状态（画布的接入点）──────────────────────────────────────

describe('nodeStatesFor', () => {
  it('没有运行时返回空对象', () => {
    const store = useRunnerStore()
    expect(store.nodeStatesFor('wf_1')).toEqual({})
  })

  it('返回该工作流最近一次运行的节点状态', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'succeeded' }))
    expect(store.nodeStatesFor('wf_1').a?.status).toBe('succeeded')
  })

  it('同工作流再跑一次时用新 run 的状态', () => {
    const store = useRunnerStore()
    const first = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', first, { nodeId: 'a', status: 'failed' }))

    const second = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', second, { nodeId: 'a', status: 'running' }))

    expect(store.nodeStatesFor('wf_1').a?.status).toBe('running')
  })

  it('不同工作流的运行互不干扰（状态按工作流隔离）', () => {
    const store = useRunnerStore()
    const a = store.startRun('wf_1', { kind: 'workflow' })
    const b = store.startRun('wf_2', { kind: 'workflow' })
    store.applyEvent(ev('node.status', a, { nodeId: 'n1', status: 'succeeded' }))
    store.applyEvent(ev('node.status', b, { nodeId: 'n2', status: 'running' }))

    expect(store.nodeStatesFor('wf_1').n1?.status).toBe('succeeded')
    expect(store.nodeStatesFor('wf_1').n2).toBeUndefined()
    expect(store.nodeStatesFor('wf_2').n2?.status).toBe('running')
    expect(store.nodeStatesFor('wf_2').n1).toBeUndefined()
  })

  it('未运行的节点不出现在结果里（画布据此显示 idle）', () => {
    const store = useRunnerStore()
    const runId = store.startRun('wf_1', { kind: 'workflow' })
    store.applyEvent(ev('node.status', runId, { nodeId: 'a', status: 'running' }))
    expect(Object.keys(store.nodeStatesFor('wf_1'))).toEqual(['a'])
  })
})

// ── 首屏重建 ────────────────────────────────────────────────────────────────

describe('hydrateRun', () => {
  it('用全量 run 覆盖本地（刷新后重建）', () => {
    const store = useRunnerStore()
    store.hydrateRun({
      id: 'run_rebuilt',
      workflowId: 'wf_1',
      status: 'running',
      scope: { kind: 'workflow' },
      cost: { currency: 'CNY', actual: 0.3 },
      nodes: { a: { status: 'succeeded', candidates: [] } },
    })
    expect(store.runs.run_rebuilt?.status).toBe('running')
    expect(store.nodeStatesFor('wf_1').a?.status).toBe('succeeded')
  })

  it('重建的 run 也计入活跃', () => {
    const store = useRunnerStore()
    store.hydrateRun({
      id: 'run_rebuilt',
      workflowId: 'wf_1',
      status: 'running',
      scope: { kind: 'workflow' },
      cost: { currency: 'CNY' },
      nodes: {},
    })
    expect(store.runningCount()).toBe(1)
  })

  it('重复 hydrate 同一 run 不会重复登记顺序', () => {
    const store = useRunnerStore()
    const run = {
      id: 'run_x',
      workflowId: 'wf_1',
      status: 'running' as const,
      scope: { kind: 'workflow' as const },
      cost: { currency: 'CNY' },
      nodes: {},
    }
    store.hydrateRun(run)
    store.hydrateRun(run)
    expect(store.order.filter(id => id === 'run_x')).toHaveLength(1)
  })
})

describe('latestRun', () => {
  it('没有 run 时返回 undefined', () => {
    const store = useRunnerStore()
    expect(store.latestRun()).toBeUndefined()
  })

  it('返回最后创建的那个', () => {
    const store = useRunnerStore()
    store.startRun('wf_1', { kind: 'workflow' })
    const second = store.startRun('wf_2', { kind: 'workflow' })
    expect(store.latestRun()?.id).toBe(second)
  })
})
