import { beforeEach, describe, expect, it } from 'vitest'
import { getAllNodeTypes, getNodeType } from '../registry'
// 触发内置节点类型注册
import '../index'

describe('node registry', () => {
  it('registers llm-script from its own directory', () => {
    const def = getNodeType('llm-script')
    expect(def).toBeDefined()
    expect(def!.label).toBe('剧本生成')
    expect(def!.category).toBe('文本')
  })

  it('registers text-to-image from its own directory', () => {
    const def = getNodeType('text-to-image')
    expect(def).toBeDefined()
    expect(def!.label).toBe('文生图')
  })

  it('returns undefined for an unregistered type', () => {
    expect(getNodeType('non-existent')).toBeUndefined()
  })

  it('llm-script exposes the ports declared in its definition', () => {
    const def = getNodeType('llm-script')!
    expect(def.inputs.map(p => p.id)).toEqual(['context'])
    expect(def.outputs.map(p => p.id)).toEqual(['script'])
  })

  it('text-to-image declares a required prompt input and an image output', () => {
    const def = getNodeType('text-to-image')!
    expect(def.inputs.find(p => p.id === 'prompt')!.required).toBe(true)
    expect(def.outputs.find(p => p.id === 'image')!.type).toBe('image')
  })

  it('text-to-image and llm-script compose: text output feeds text input', () => {
    const script = getNodeType('llm-script')!
    const t2i = getNodeType('text-to-image')!
    expect(script.outputs[0]!.type).toBe(t2i.inputs[0]!.type)
  })
})

describe('summarize', () => {
  it('llm-script compresses params into one line', () => {
    const def = getNodeType('llm-script')!
    expect(def.summarize!({ model: 'gpt-4o', temperature: 0.8 })).toBe('gpt-4o · 温度 0.8')
  })

  it('llm-script falls back to defaults when params are missing', () => {
    const def = getNodeType('llm-script')!
    expect(def.summarize!({})).toBe('gpt-4o · 温度 0.8')
  })

  it('text-to-image shows the aspect ratio label when the resolution is a preset', () => {
    const def = getNodeType('text-to-image')!
    expect(def.summarize!({ resolution: '832x1216', candidateCount: 4 })).toBe('2:3 · 候选 4')
  })

  it('text-to-image falls back to raw dimensions for a resolution outside the preset table', () => {
    const def = getNodeType('text-to-image')!
    expect(def.summarize!({ resolution: '1024x1536', candidateCount: 4 })).toBe('1024×1536 · 候选 4')
  })

  it('text-to-image falls back to defaults when params are missing', () => {
    const def = getNodeType('text-to-image')!
    expect(def.summarize!({})).toBe('2:3 · 候选 4')
  })
})

describe('param schema sanity', () => {
  // 回归：默认值必须出现在选项表里。
  // 之前 text-to-image 的 resolution 默认是 '1024x1536'，而比例选项表里
  // 没有这一项 —— 比例选择器会找不到匹配项、显示成未选中。
  it('every select/segmented/aspect default is one of its own options', () => {
    for (const def of getAllNodeTypes()) {
      for (const field of def.params) {
        if (field.type !== 'select' && field.type !== 'segmented' && field.type !== 'aspect') {
          continue
        }
        if (field.default === undefined || !field.options) {
          continue
        }
        const values = field.options.map(o => o.value)
        expect(
          values,
          `${def.type}.${field.key} 的 default 不在 options 里`,
        ).toContain(field.default)
      }
    }
  })

  it('every param field has a label and a unique key within its node type', () => {
    for (const def of getAllNodeTypes()) {
      const keys = def.params.map(f => f.key)
      expect(new Set(keys).size, `${def.type} 有重复的 param key`).toBe(keys.length)
      for (const field of def.params) {
        expect(field.label, `${def.type}.${field.key} 缺少 label`).toBeTruthy()
      }
    }
  })

  // 回归：栅格是 formColumns 列，span 超过它就会撑出隐式列、把布局挤乱。
  // 之前 llm-script 改成两列后，systemPrompt 还留着 span: 3。
  it('no field spans more columns than its node declares', () => {
    for (const def of getAllNodeTypes()) {
      const columns = def.formColumns ?? 3
      for (const field of def.params) {
        expect(
          field.span ?? 1,
          `${def.type}.${field.key} 的 span 超过了 ${columns} 列`,
        ).toBeLessThanOrEqual(columns)
      }
    }
  })

  // 端点标签只对滑块有意义。放在别的类型上是静默失效的配置 ——
  // 作者以为会显示，实际什么都不发生。
  it('slider end labels only appear on sliders', () => {
    for (const def of getAllNodeTypes()) {
      for (const field of def.params) {
        if (field.minLabel === undefined && field.maxLabel === undefined) {
          continue
        }
        expect(field.type, `${def.type}.${field.key} 声明了端点标签但不是 slider`).toBe('slider')
      }
    }
  })

  it('slider fields declare min, max and step so the control is usable', () => {
    for (const def of getAllNodeTypes()) {
      for (const field of def.params) {
        if (field.type !== 'slider') {
          continue
        }
        expect(field.min, `${def.type}.${field.key} 缺 min`).toBeTypeOf('number')
        expect(field.max, `${def.type}.${field.key} 缺 max`).toBeTypeOf('number')
        expect(field.step, `${def.type}.${field.key} 缺 step`).toBeTypeOf('number')
      }
    }
  })

  it('every generative node offers presets so beginners have a starting point', () => {
    for (const def of getAllNodeTypes()) {
      expect(def.presets?.length ?? 0, `${def.type} 没有预设`).toBeGreaterThan(0)
    }
  })

  it('preset params only reference keys that exist on the node type', () => {
    for (const def of getAllNodeTypes()) {
      const keys = new Set(def.params.map(f => f.key))
      for (const preset of def.presets ?? []) {
        for (const key of Object.keys(preset.params)) {
          expect(keys, `${def.type} 的预设「${preset.name}」引用了不存在的参数 ${key}`).toContain(key)
        }
      }
    }
  })

  it('showWhen only references keys that exist on the node type', () => {
    for (const def of getAllNodeTypes()) {
      const keys = new Set(def.params.map(f => f.key))
      for (const field of def.params) {
        if (field.showWhen) {
          expect(keys, `${def.type}.${field.key} 的 showWhen 指向了不存在的参数`).toContain(field.showWhen.key)
        }
      }
    }
  })
})

describe('estimate', () => {
  it('text-to-image scales cost by candidate count', () => {
    const def = getNodeType('text-to-image')!
    const four = def.estimate!({ candidateCount: 4 })
    const eight = def.estimate!({ candidateCount: 8 })
    expect(eight.cost).toBeGreaterThan(four.cost!)
    expect(eight.duration).toBeGreaterThan(four.duration!)
  })
})

describe('registration guards', () => {
  let registerNodeType: typeof import('../registry').registerNodeType
  let __clearRegistry: typeof import('../registry').__clearRegistry

  beforeEach(async () => {
    const mod = await import('../registry')
    registerNodeType = mod.registerNodeType
    __clearRegistry = mod.__clearRegistry
    __clearRegistry()
  })

  it('throws on duplicate registration instead of silently overwriting', () => {
    const def = {
      type: 'dup',
      label: 'x',
      category: 'y',
      icon: '?',
      inputs: [],
      outputs: [],
      params: [],
    }
    registerNodeType(def)
    expect(() => registerNodeType(def)).toThrow(/重复注册/)
  })
})
