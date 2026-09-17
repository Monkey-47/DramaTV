import type { RunnerEvent } from '@/features/runner/runner.types'
import { describe, expect, it } from 'vitest'
import { parseWireEvent } from '@/features/runner/wire'
import { encodeSseFrame, toWireEvent } from '../wire-serialize'

/**
 * 往返不变量：parse(serialize(e)) === e
 *
 * 这两个函数分别住在 runner 和 mocks 里，很容易各自漂移（比如有人只改了
 * 进度单位的一侧）。这组测试是唯一把它们钉在一起的地方。
 */

const WF = 'wf_1'

function roundTrip(event: RunnerEvent): RunnerEvent | null {
  return parseWireEvent(toWireEvent(event, WF))
}

describe('往返：run.status', () => {
  it('保留 status 与 cost', () => {
    const event: RunnerEvent = {
      type: 'run.status',
      seq: 120,
      runId: 'run_1',
      at: 1737000000000,
      status: 'running',
      cost: { currency: 'CNY', estimated: 0.5, actual: 0.03 },
    }
    expect(roundTrip(event)).toEqual(event)
  })

  it('无 cost 时两侧都不产生该字段', () => {
    const event: RunnerEvent = { type: 'run.status', seq: 1, runId: 'run_1', at: 1000, status: 'queued' }
    expect(roundTrip(event)).toEqual(event)
  })
})

describe('往返：node.status', () => {
  it('保留 reused: true', () => {
    const event: RunnerEvent = { type: 'node.status', seq: 2, runId: 'run_1', at: 1000, nodeId: 'a', status: 'succeeded', reused: true }
    expect(roundTrip(event)).toEqual(event)
  })

  it('保留 reused: false（不能因为假值被吃掉）', () => {
    const event: RunnerEvent = { type: 'node.status', seq: 3, runId: 'run_1', at: 1000, nodeId: 'a', status: 'succeeded', reused: false }
    expect(roundTrip(event)).toEqual(event)
  })

  it('省略 reused 时两侧都不产生该字段', () => {
    const event: RunnerEvent = { type: 'node.status', seq: 4, runId: 'run_1', at: 1000, nodeId: 'a', status: 'running' }
    const back = roundTrip(event)
    expect(back).toEqual(event)
    expect(back !== null && 'reused' in back).toBe(false)
  })

  it('保留 error（含 retryable，前端不做重试决策）', () => {
    const event: RunnerEvent = {
      type: 'node.status',
      seq: 5,
      runId: 'run_1',
      at: 1000,
      nodeId: 'a',
      status: 'failed',
      error: { code: 'MODEL_LOAD_FAILED', retryable: false, message: '模型加载失败' },
    }
    expect(roundTrip(event)).toEqual(event)
  })

  it('无 error 时线上发 null，解析回来不带该字段', () => {
    const event: RunnerEvent = { type: 'node.status', seq: 6, runId: 'run_1', at: 1000, nodeId: 'a', status: 'running' }
    const wire = toWireEvent(event, WF)
    expect(wire.error).toBeNull()
    expect(roundTrip(event)).toEqual(event)
  })
})

describe('往返：node.progress 单位', () => {
  it('0–100 出、0..1 上线、0–100 回', () => {
    for (const percent of [0, 12, 35, 50, 99, 100]) {
      const event: RunnerEvent = { type: 'node.progress', seq: 7, runId: 'run_1', at: 1000, nodeId: 'a', progress: percent }
      expect(roundTrip(event)).toEqual(event)
    }
  })

  it('线上确实是 0..1 的比例（不是百分比）', () => {
    const event: RunnerEvent = { type: 'node.progress', seq: 8, runId: 'run_1', at: 1000, nodeId: 'a', progress: 35 }
    expect(toWireEvent(event, WF).progress).toBe(0.35)
  })
})

describe('往返：node.candidates', () => {
  it('保留完整候选', () => {
    const event: RunnerEvent = {
      type: 'node.candidates',
      seq: 9,
      runId: 'run_1',
      at: 1000,
      nodeId: 'a',
      candidates: [{ assetId: 'asset_1', url: 'https://cdn/a.png', mime: 'image/png', width: 1024, height: 1024 }],
    }
    expect(roundTrip(event)).toEqual(event)
  })

  it('空候选列表也能往返', () => {
    const event: RunnerEvent = { type: 'node.candidates', seq: 10, runId: 'run_1', at: 1000, nodeId: 'a', candidates: [] }
    expect(roundTrip(event)).toEqual(event)
  })
})

describe('往返：run.done', () => {
  it('保留终止状态与 cost', () => {
    const event: RunnerEvent = {
      type: 'run.done',
      seq: 130,
      runId: 'run_1',
      at: 1737000010000,
      status: 'partial',
      cost: { currency: 'CNY', estimated: 0.5, actual: 0.19 },
    }
    expect(roundTrip(event)).toEqual(event)
  })
})

describe('sSE 帧编码', () => {
  it('带 id 与 event 行，并以空行结尾', () => {
    const event: RunnerEvent = { type: 'node.status', seq: 128, runId: 'run_1', at: 1000, nodeId: 'a', status: 'running' }
    const frame = encodeSseFrame(event, WF)
    expect(frame.startsWith('id: 128\nevent: node.status\ndata: ')).toBe(true)
    expect(frame.endsWith('\n\n')).toBe(true)
  })

  it('data 行是可解析的 JSON，且与 parseWireEvent 对得上', () => {
    const event: RunnerEvent = { type: 'node.progress', seq: 42, runId: 'run_1', at: 1000, nodeId: 'a', progress: 60 }
    const frame = encodeSseFrame(event, WF)
    const dataLine = frame.split('\n').find(line => line.startsWith('data: '))
    const payload = JSON.parse(dataLine!.slice(6))
    expect(parseWireEvent(payload)).toEqual(event)
  })

  it('id 行等于 seq（重连补齐靠它）', () => {
    const event: RunnerEvent = { type: 'run.status', seq: 777, runId: 'run_1', at: 1000, status: 'running' }
    expect(encodeSseFrame(event, WF).startsWith('id: 777\n')).toBe(true)
  })

  it('data 里带 workflowId（解析时会丢弃，但契约要求线上有）', () => {
    const event: RunnerEvent = { type: 'run.status', seq: 1, runId: 'run_1', at: 1000, status: 'running' }
    expect(toWireEvent(event, WF).workflowId).toBe(WF)
  })
})
