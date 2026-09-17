import { describe, expect, it } from 'vitest'
import { parseWireEvent } from '../wire'

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    seq: 120,
    workflowId: 'wf_1',
    runId: 'run_abc',
    event: 'run.status',
    status: 'running',
    ts: 1737000000000,
    ...overrides,
  }
}

describe('parseWireEvent 基本形状', () => {
  it('把 ts 映射为 at', () => {
    const parsed = parseWireEvent(wire())
    expect(parsed?.at).toBe(1737000000000)
  })

  it('保留 seq 与 runId', () => {
    const parsed = parseWireEvent(wire())
    expect(parsed?.seq).toBe(120)
    expect(parsed?.runId).toBe('run_abc')
  })

  it('丢弃 workflowId（reducer 按 runId 路由，不需要它）', () => {
    const parsed = parseWireEvent(wire()) as unknown as Record<string, unknown>
    expect(parsed.workflowId).toBeUndefined()
  })
})

describe('run.status', () => {
  it('解析 status 与 cost', () => {
    const parsed = parseWireEvent(wire({
      status: 'running',
      cost: { estimated: 0.5, actual: 0.03, currency: 'USD' },
    }))
    expect(parsed).toEqual({
      type: 'run.status',
      seq: 120,
      runId: 'run_abc',
      at: 1737000000000,
      status: 'running',
      cost: { estimated: 0.5, actual: 0.03, currency: 'USD' },
    })
  })

  it('缺少 cost 时不写入该字段（exactOptionalPropertyTypes）', () => {
    const parsed = parseWireEvent(wire({ status: 'running' }))
    expect(parsed !== null && 'cost' in parsed).toBe(false)
  })

  it('拒绝未知的 run 状态', () => {
    expect(parseWireEvent(wire({ status: 'wat' }))).toBeNull()
  })
})

describe('node.status', () => {
  it('解析节点状态', () => {
    const parsed = parseWireEvent(wire({ event: 'node.status', nodeId: 'node_a1', status: 'succeeded', reused: false }))
    expect(parsed).toEqual({
      type: 'node.status',
      seq: 120,
      runId: 'run_abc',
      at: 1737000000000,
      nodeId: 'node_a1',
      status: 'succeeded',
      reused: false,
    })
  })

  it('reused 为 true 时透传（前端据此显示复用标记）', () => {
    const parsed = parseWireEvent(wire({ event: 'node.status', nodeId: 'n', status: 'succeeded', reused: true }))
    expect(parsed !== null && 'reused' in parsed && parsed.reused).toBe(true)
  })

  it('error 为 null 时不写入 error 字段', () => {
    const parsed = parseWireEvent(wire({ event: 'node.status', nodeId: 'n', status: 'running', error: null }))
    expect(parsed !== null && 'error' in parsed).toBe(false)
  })

  it('error 有值时完整透传（含 retryable，前端不做重试决策）', () => {
    const parsed = parseWireEvent(wire({
      event: 'node.status',
      nodeId: 'n',
      status: 'failed',
      error: { code: 'MODEL_LOAD_FAILED', retryable: false, message: '模型加载失败' },
    }))
    expect(parsed !== null && 'error' in parsed && parsed.error).toEqual({
      code: 'MODEL_LOAD_FAILED',
      retryable: false,
      message: '模型加载失败',
    })
  })

  it('缺少 nodeId 时返回 null', () => {
    expect(parseWireEvent(wire({ event: 'node.status', status: 'running' }))).toBeNull()
  })

  it('拒绝未知的节点状态', () => {
    expect(parseWireEvent(wire({ event: 'node.status', nodeId: 'n', status: 'wat' }))).toBeNull()
  })
})

describe('node.progress 单位换算', () => {
  it('线上是 0..1，内部统一成 0–100', () => {
    const parsed = parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: 0.35 }))
    expect(parsed).toEqual({
      type: 'node.progress',
      seq: 120,
      runId: 'run_abc',
      at: 1737000000000,
      nodeId: 'n',
      progress: 35,
    })
  })

  it('0 与 1 映射为 0 与 100', () => {
    expect(parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: 0 }))).toMatchObject({ progress: 0 })
    expect(parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: 1 }))).toMatchObject({ progress: 100 })
  })

  it('越界值被夹紧到 [0,100]', () => {
    expect(parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: 1.8 }))).toMatchObject({ progress: 100 })
    expect(parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: -0.5 }))).toMatchObject({ progress: 0 })
  })

  it('非数字 progress 返回 null', () => {
    expect(parseWireEvent(wire({ event: 'node.progress', nodeId: 'n', progress: 'half' }))).toBeNull()
  })
})

describe('node.candidates', () => {
  it('解析候选列表', () => {
    const parsed = parseWireEvent(wire({
      event: 'node.candidates',
      nodeId: 'n',
      candidates: [{ assetId: 'asset_88', url: 'https://cdn/a.png', mime: 'image/png', width: 1024, height: 1024 }],
    }))
    expect(parsed).toMatchObject({
      type: 'node.candidates',
      nodeId: 'n',
      candidates: [{ assetId: 'asset_88', mime: 'image/png', width: 1024, height: 1024 }],
    })
  })

  it('candidates 不是数组时返回 null', () => {
    expect(parseWireEvent(wire({ event: 'node.candidates', nodeId: 'n', candidates: 'nope' }))).toBeNull()
  })

  it('丢弃缺少必要字段的候选条目（不让一条脏数据毁掉整批）', () => {
    const parsed = parseWireEvent(wire({
      event: 'node.candidates',
      nodeId: 'n',
      candidates: [{ assetId: 'asset_1', url: 'https://cdn/a.png', mime: 'image/png' }, { url: 'https://cdn/b.png' }],
    }))
    expect(parsed).toMatchObject({ candidates: [{ assetId: 'asset_1' }] })
  })
})

describe('run.done', () => {
  it('解析终止事件', () => {
    const parsed = parseWireEvent(wire({ event: 'run.done', status: 'partial', cost: { currency: 'USD', actual: 0.19 } }))
    expect(parsed).toMatchObject({ type: 'run.done', status: 'partial', cost: { actual: 0.19 } })
  })
})

describe('异常输入', () => {
  it('null / undefined / 字符串 / 数组 都返回 null', () => {
    expect(parseWireEvent(null)).toBeNull()
    expect(parseWireEvent(undefined)).toBeNull()
    expect(parseWireEvent('nope')).toBeNull()
    expect(parseWireEvent([])).toBeNull()
  })

  it('缺少 seq 或 runId 返回 null', () => {
    expect(parseWireEvent(wire({ seq: undefined }))).toBeNull()
    expect(parseWireEvent(wire({ runId: undefined }))).toBeNull()
  })

  it('seq 非数字返回 null', () => {
    expect(parseWireEvent(wire({ seq: '120' }))).toBeNull()
  })

  it('未知事件类型返回 null', () => {
    expect(parseWireEvent(wire({ event: 'node.exploded' }))).toBeNull()
  })

  it('缺少 ts 时回退到 0 而不是崩（心跳与重连补齐可能不带时间戳）', () => {
    expect(parseWireEvent(wire({ ts: undefined }))?.at).toBe(0)
  })
})
