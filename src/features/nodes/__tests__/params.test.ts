import type { ParamField, ParamSchema } from '../nodes.types'
import { describe, expect, it } from 'vitest'
import {
  applyDefaults,
  aspectBoxSize,
  formatEstimate,
  isFieldVisible,
  isRandomSeed,
  joinTags,
  parseAspect,
  partitionFields,
  RANDOM_SEED,
  randomSeed,
  splitTags,
  visibleFields,
} from '../fields/param-helpers'

function field(over: Partial<ParamField> & { key: string, type: ParamField['type'] }): ParamField {
  return {
    label: over.key,
    ...over,
  }
}

describe('applyDefaults', () => {
  const schema: ParamSchema = [
    field({ key: 'model', type: 'select', default: 'sdxl' }),
    field({ key: 'steps', type: 'slider', default: 30 }),
    field({ key: 'seed', type: 'seed', default: RANDOM_SEED }),
    field({ key: 'prompt', type: 'textarea' }),
  ]

  it('fills in declared defaults for missing keys', () => {
    const merged = applyDefaults(schema, {})
    expect(merged.model).toBe('sdxl')
    expect(merged.steps).toBe(30)
    expect(merged.seed).toBe(RANDOM_SEED)
  })

  it('never overwrites a value the user already set', () => {
    const merged = applyDefaults(schema, { steps: 12 })
    expect(merged.steps).toBe(12)
  })

  it('does not invent a key for fields without a default', () => {
    const merged = applyDefaults(schema, {})
    expect('prompt' in merged).toBe(false)
  })

  it('does not mutate the input object', () => {
    const params = { steps: 12 }
    applyDefaults(schema, params)
    expect(params).toEqual({ steps: 12 })
  })
})

describe('isFieldVisible', () => {
  const conditional = field({
    key: 'lightningSteps',
    type: 'slider',
    showWhen: { key: 'model', equals: 'lightning' },
  })

  it('shows an unconditional field', () => {
    expect(isFieldVisible(field({ key: 'a', type: 'text' }), {})).toBe(true)
  })

  it('hides a conditional field when the dependency does not match', () => {
    expect(isFieldVisible(conditional, { model: 'sdxl' })).toBe(false)
  })

  it('shows a conditional field when the dependency matches', () => {
    expect(isFieldVisible(conditional, { model: 'lightning' })).toBe(true)
  })

  it('compares strictly, so a number never matches its string form', () => {
    const numeric = field({ key: 'x', type: 'text', showWhen: { key: 'n', equals: 1 } })
    expect(isFieldVisible(numeric, { n: '1' })).toBe(false)
    expect(isFieldVisible(numeric, { n: 1 })).toBe(true)
  })

  it('works off merged params so an untouched dependency still resolves', () => {
    const schema: ParamSchema = [
      field({ key: 'model', type: 'select', default: 'lightning' }),
      conditional,
    ]
    const merged = applyDefaults(schema, {})
    expect(isFieldVisible(conditional, merged)).toBe(true)
  })
})

describe('partitionFields', () => {
  const schema: ParamSchema = [
    field({ key: 'prompt', type: 'textarea' }),
    field({ key: 'steps', type: 'slider', advanced: true }),
    field({ key: 'cfg', type: 'slider', advanced: true }),
    field({ key: 'hidden', type: 'text', advanced: true, showWhen: { key: 'prompt', equals: 'nope' } }),
  ]

  it('splits visible fields into basic and advanced', () => {
    const { basic, advanced } = partitionFields(schema, {})
    expect(basic.map(f => f.key)).toEqual(['prompt'])
    expect(advanced.map(f => f.key)).toEqual(['steps', 'cfg'])
  })

  it('excludes hidden fields from both buckets', () => {
    const { basic, advanced } = partitionFields(schema, {})
    expect([...basic, ...advanced].map(f => f.key)).not.toContain('hidden')
  })
})

describe('visibleFields', () => {
  it('preserves schema order', () => {
    const schema: ParamSchema = [
      field({ key: 'a', type: 'text' }),
      field({ key: 'b', type: 'text' }),
      field({ key: 'c', type: 'text' }),
    ]
    expect(visibleFields(schema, {}).map(f => f.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('parseAspect', () => {
  it('parses the x form', () => {
    expect(parseAspect('832x1216')).toEqual({ width: 832, height: 1216 })
  })

  it('parses the × form', () => {
    expect(parseAspect('832×1216')).toEqual({ width: 832, height: 1216 })
  })

  it('tolerates whitespace', () => {
    expect(parseAspect('  1024 x 1024 ')).toEqual({ width: 1024, height: 1024 })
  })

  it('returns null for non-strings', () => {
    expect(parseAspect(1234)).toBeNull()
    expect(parseAspect(undefined)).toBeNull()
  })

  it('returns null for malformed strings', () => {
    expect(parseAspect('1024x')).toBeNull()
    expect(parseAspect('square')).toBeNull()
    expect(parseAspect('1024x0')).toBeNull()
    expect(parseAspect('0x1024')).toBeNull()
  })
})

describe('aspectBoxSize', () => {
  it('fits a tall ratio inside the box without exceeding either edge', () => {
    const size = aspectBoxSize('832x1216', 34, 26)!
    expect(size.height).toBe(26)
    expect(size.width).toBeLessThanOrEqual(34)
    expect(size.width).toBeLessThan(size.height)
  })

  it('fits a wide ratio inside the box', () => {
    const size = aspectBoxSize('1344x768', 34, 26)!
    expect(size.width).toBe(34)
    expect(size.height).toBeLessThanOrEqual(26)
    expect(size.height).toBeLessThan(size.width)
  })

  it('draws a square for a 1:1 ratio', () => {
    const size = aspectBoxSize('1024x1024', 34, 26)!
    expect(size.width).toBe(size.height)
  })

  it('scales all ratios into the same box, so their relative proportions are comparable', () => {
    const tall = aspectBoxSize('832x1216', 34, 26)!
    const wide = aspectBoxSize('1344x768', 34, 26)!
    expect(tall.width / tall.height).toBeCloseTo(832 / 1216, 1)
    expect(wide.width / wide.height).toBeCloseTo(1344 / 768, 1)
  })

  it('returns null when the value is unparseable', () => {
    expect(aspectBoxSize('nonsense', 34, 26)).toBeNull()
  })

  it('never returns a zero dimension', () => {
    const size = aspectBoxSize('100000x1', 34, 26)!
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBeGreaterThanOrEqual(1)
  })
})

describe('splitTags', () => {
  it('passes through a string array, trimming each entry', () => {
    expect(splitTags(['low quality', ' blurry '])).toEqual(['low quality', 'blurry'])
  })

  it('splits a comma-separated string (the shape negativePrompt currently uses)', () => {
    expect(splitTags('low quality, blurry,bad anatomy')).toEqual(['low quality', 'blurry', 'bad anatomy'])
  })

  it('splits on the full-width comma too', () => {
    expect(splitTags('低质量，模糊')).toEqual(['低质量', '模糊'])
  })

  it('splits on newlines', () => {
    expect(splitTags('a\nb')).toEqual(['a', 'b'])
  })

  it('drops empty entries produced by trailing commas', () => {
    expect(splitTags('a,,b,')).toEqual(['a', 'b'])
  })

  it('returns an empty array for non-string, non-array input', () => {
    expect(splitTags(undefined)).toEqual([])
    expect(splitTags(42)).toEqual([])
  })

  it('filters non-string entries out of a mixed array', () => {
    expect(splitTags(['a', 1, null, 'b'])).toEqual(['a', 'b'])
  })

  it('round-trips through joinTags', () => {
    const tags = splitTags('a, b, c')
    expect(joinTags(tags)).toEqual(['a', 'b', 'c'])
  })
})

describe('randomSeed', () => {
  it('returns a positive integer', () => {
    for (let i = 0; i < 20; i++) {
      const seed = randomSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThan(0)
      expect(seed).toBeLessThan(2147483647)
    }
  })

  it('never returns the random sentinel', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomSeed()).not.toBe(RANDOM_SEED)
    }
  })

  it('produces different values across calls', () => {
    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()))
    expect(seeds.size).toBeGreaterThan(1)
  })
})

describe('isRandomSeed', () => {
  it('treats the sentinel and absent values as random', () => {
    expect(isRandomSeed(RANDOM_SEED)).toBe(true)
    expect(isRandomSeed(undefined)).toBe(true)
  })

  it('treats a concrete seed as fixed', () => {
    expect(isRandomSeed(12345)).toBe(false)
    expect(isRandomSeed(0)).toBe(false)
  })
})

describe('formatEstimate', () => {
  it('formats cost and duration together', () => {
    expect(formatEstimate({ cost: 0.16, duration: 80 })).toBe('约 ¥0.16 · 约 80 秒')
  })

  it('omits a missing cost rather than showing ¥0', () => {
    expect(formatEstimate({ duration: 12 })).toBe('约 12 秒')
  })

  it('omits a missing duration', () => {
    expect(formatEstimate({ cost: 1.5 })).toBe('约 ¥1.50')
  })

  it('returns an empty string when there is nothing to show', () => {
    expect(formatEstimate(undefined)).toBe('')
    expect(formatEstimate({})).toBe('')
  })
})
