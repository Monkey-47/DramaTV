import { describe, expect, it } from 'vitest'
import { isPortTypeCompatible } from '../port'

describe('isPortTypeCompatible', () => {
  it('同类型可以连接', () => {
    expect(isPortTypeCompatible('image', 'image')).toBe(true)
    expect(isPortTypeCompatible('text', 'text')).toBe(true)
  })

  it('不同类型不可连接', () => {
    expect(isPortTypeCompatible('text', 'image')).toBe(false)
    expect(isPortTypeCompatible('image', 'video')).toBe(false)
    expect(isPortTypeCompatible('audio', 'number')).toBe(false)
  })

  it('目标端是 any 时可连接', () => {
    expect(isPortTypeCompatible('image', 'any')).toBe(true)
  })

  it('源端是 any 时可连接', () => {
    expect(isPortTypeCompatible('any', 'image')).toBe(true)
  })

  it('两端都是 any 时可连接', () => {
    expect(isPortTypeCompatible('any', 'any')).toBe(true)
  })
})
