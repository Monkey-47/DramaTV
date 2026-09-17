/**
 * 参数字段的纯逻辑。
 *
 * 抽出来是为了能单测 —— 表单渲染本身按设计文档 §7.4 的精神不测交互，
 * 但这些判定（可见性、默认值合并、比例换算）出错会让整个表单静默错乱，
 * 必须有测试兜住。
 */

import type { ParamField, ParamSchema } from '../nodes.types'

/** `-1` 是种子的「每次随机」哨兵值，与后端约定一致 */
export const RANDOM_SEED = -1

/** 种子上限取 2^31-1，与主流后端（SD WebUI / ComfyUI）一致 */
const SEED_MAX = 2147483647

/**
 * 把 schema 里声明的 default 合并进用户参数。
 *
 * 节点的 `data` 可能是空的（刚拖出来还没配过），但表单要显示完整默认值，
 * 否则用户看到一片空白、也不知道不填会发生什么。
 * 用户已有的值永远优先。
 */
export function applyDefaults(
  schema: ParamSchema,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params }
  for (const field of schema) {
    if (out[field.key] === undefined && field.default !== undefined) {
      out[field.key] = field.default
    }
  }
  return out
}

/**
 * 字段是否应该显示。
 *
 * `showWhen` 用于模型相关参数：选了某个模型才出现的字段。
 * 判断基准是**合并默认值之后**的参数，否则用户没动过的字段会因为
 * `params[key]` 是 undefined 而导致依赖它的字段被错误隐藏。
 */
export function isFieldVisible(
  field: ParamField,
  mergedParams: Record<string, unknown>,
): boolean {
  const condition = field.showWhen
  if (condition === undefined) {
    return true
  }
  return mergedParams[condition.key] === condition.equals
}

/** 按可见性过滤 schema */
export function visibleFields(
  schema: ParamSchema,
  mergedParams: Record<string, unknown>,
): ParamField[] {
  return schema.filter(field => isFieldVisible(field, mergedParams))
}

/** 按可见性过滤 + 按是否高级分组 */
export function partitionFields(
  schema: ParamSchema,
  mergedParams: Record<string, unknown>,
): { basic: ParamField[], advanced: ParamField[] } {
  const basic: ParamField[] = []
  const advanced: ParamField[] = []
  for (const field of visibleFields(schema, mergedParams)) {
    if (field.advanced === true) {
      advanced.push(field)
    }
    else {
      basic.push(field)
    }
  }
  return { basic, advanced }
}

/** 解析 `'832x1216'` → `{ width: 832, height: 1216 }`；解析不了返回 null */
export function parseAspect(value: unknown): { width: number, height: number } | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(value)
  if (match === null) {
    return null
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

/**
 * 把一个分辨率按比例缩放进给定的盒子，用于画比例选择器的方块。
 *
 * 两条边同时不超过上限 —— 竖图就会画成窄高，横图画成扁宽，
 * 用户一眼能看出比例差别，比读 "832x1216" 快得多。
 */
export function aspectBoxSize(
  value: unknown,
  maxWidth: number,
  maxHeight: number,
): { width: number, height: number } | null {
  const parsed = parseAspect(value)
  if (parsed === null) {
    return null
  }
  const scale = Math.min(maxWidth / parsed.width, maxHeight / parsed.height)
  return {
    width: Math.max(1, Math.round(parsed.width * scale)),
    height: Math.max(1, Math.round(parsed.height * scale)),
  }
}

/**
 * 把任意输入规范成标签数组。
 *
 * 容错处理两种来源：`tags` 字段原生就是 `string[]`，但当前节点定义里
 * 负面提示词用的是 textarea + 逗号分隔的字符串。同一个控件要能接两种，
 * 否则换字段类型时历史数据会直接崩。
 */
export function splitTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string').map(t => t.trim()).filter(t => t !== '')
  }
  if (typeof raw === 'string') {
    return raw.split(/[,，\n]/).map(t => t.trim()).filter(t => t !== '')
  }
  return []
}

/** 标签数组 → 回写用的值。保持在 string[]，由调用方决定怎么序列化 */
export function joinTags(tags: string[]): string[] {
  return tags
}

/** 生成一个可用的随机种子。`Math.random()` 的精度不够覆盖到 SEED_MAX */
export function randomSeed(): number {
  const buffer = new Uint32Array(1)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buffer)
  }
  else {
    buffer[0] = Math.floor(Math.random() * 0xFFFFFFFF)
  }
  return (buffer[0] ?? 0) % SEED_MAX || 1
}

/** 种子是否处于「每次随机」状态 */
export function isRandomSeed(value: unknown): boolean {
  return value === RANDOM_SEED || value === undefined || value === null
}

/**
 * 把估算结果压成一行文案。
 * 两个值都可能缺 —— 后端没给定价时不该显示成 ¥0。
 */
export function formatEstimate(estimate: { cost?: number, duration?: number } | undefined): string {
  if (estimate === undefined) {
    return ''
  }
  const parts: string[] = []
  if (typeof estimate.cost === 'number') {
    parts.push(`约 ¥${estimate.cost.toFixed(2)}`)
  }
  if (typeof estimate.duration === 'number') {
    parts.push(`约 ${Math.round(estimate.duration)} 秒`)
  }
  return parts.join(' · ')
}
