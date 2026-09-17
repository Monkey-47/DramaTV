import type { AssetRef, NodeRunState } from '@/features/runner/runner.types'
import { describe, expect, it } from 'vitest'
import { hasUnadoptedCandidates, isLocked, resolveOutput } from '../output'

function asset(id: string): AssetRef {
  return {
    assetId: id,
    url: `https://cdn.example.com/${id}.png`,
    mime: 'image/png',
  }
}

function runState(ids: string[]): NodeRunState {
  return {
    status: 'succeeded',
    candidates: ids.map(asset),
  }
}

describe('resolveOutput', () => {
  it('returns none when nothing is adopted — 产出必须由用户显式采用', () => {
    const out = resolveOutput({}, runState(['a1', 'a2']))
    expect(out.source).toBe('none')
    expect(out.assetId).toBeUndefined()
    // 候选仍要透出来供挑选
    expect(out.candidates).toHaveLength(2)
  })

  it('returns none when there is neither adoption nor run state', () => {
    const out = resolveOutput({}, undefined)
    expect(out.source).toBe('none')
    expect(out.assetId).toBeUndefined()
    expect(out.candidates).toEqual([])
  })

  it('returns adopted when the user picked but did not lock', () => {
    const out = resolveOutput({ adopted: { assetId: 'a2', frozen: false } }, runState(['a1', 'a2']))
    expect(out.source).toBe('adopted')
    expect(out.assetId).toBe('a2')
  })

  it('returns frozen when locked', () => {
    const out = resolveOutput({ adopted: { assetId: 'a2', frozen: true } }, runState(['a1', 'a2']))
    expect(out.source).toBe('frozen')
    expect(out.assetId).toBe('a2')
    expect(out.frozenFromEarlierRun).toBe(false)
  })

  describe('冻结语义 —— 重跑不覆盖已锁定的产出', () => {
    it('keeps the frozen asset even when the new run produced different candidates', () => {
      // 这是冻结存在的全部意义：新一轮跑出了全新的候选，但锁定的是旧的
      const out = resolveOutput({ adopted: { assetId: 'old', frozen: true } }, runState(['new1', 'new2']))
      expect(out.assetId).toBe('old')
      expect(out.source).toBe('frozen')
      expect(out.frozenFromEarlierRun).toBe(true)
    })

    it('keeps the frozen asset even when the new run produced nothing', () => {
      const out = resolveOutput({ adopted: { assetId: 'old', frozen: true } }, undefined)
      expect(out.assetId).toBe('old')
      expect(out.frozenFromEarlierRun).toBe(true)
    })

    it('does not flag "earlier run" when the frozen asset is still among the candidates', () => {
      const out = resolveOutput({ adopted: { assetId: 'a1', frozen: true } }, runState(['a1', 'a2']))
      expect(out.frozenFromEarlierRun).toBe(false)
    })

    it('an unfrozen adoption IS replaceable — 没锁就不算锁定', () => {
      const out = resolveOutput({ adopted: { assetId: 'old', frozen: false } }, runState(['new1']))
      expect(out.assetId).toBe('old')
      expect(out.frozenFromEarlierRun).toBe(false)
    })
  })
})

describe('isLocked', () => {
  it('is true only when adopted and frozen', () => {
    expect(isLocked({ adopted: { assetId: 'a', frozen: true } })).toBe(true)
    expect(isLocked({ adopted: { assetId: 'a', frozen: false } })).toBe(false)
    expect(isLocked({})).toBe(false)
  })
})

describe('hasUnadoptedCandidates', () => {
  it('is false when there are no candidates', () => {
    expect(hasUnadoptedCandidates({}, undefined)).toBe(false)
    expect(hasUnadoptedCandidates({}, runState([]))).toBe(false)
  })

  it('is true when candidates exist and nothing is adopted', () => {
    expect(hasUnadoptedCandidates({}, runState(['a1']))).toBe(true)
  })

  it('is true when the run produced something other than the adopted asset', () => {
    expect(hasUnadoptedCandidates({ adopted: { assetId: 'a1', frozen: false } }, runState(['a1', 'a2']))).toBe(true)
  })

  it('is false when the only candidate is the adopted one', () => {
    expect(hasUnadoptedCandidates({ adopted: { assetId: 'a1', frozen: false } }, runState(['a1']))).toBe(false)
  })

  it('is false for a frozen node whose asset is the only candidate', () => {
    expect(hasUnadoptedCandidates({ adopted: { assetId: 'a1', frozen: true } }, runState(['a1']))).toBe(false)
  })
})
