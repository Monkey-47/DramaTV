/**
 * 节点类型定义 —— 设计文档 §3.6
 *
 * 注册表是编译期的，不是运行时插件系统：各节点类型在自己目录里调
 * registerNodeType，nodes/index.ts 统一 import 触发注册。
 */

import type { Port } from '@/features/graph/graph.types'

/**
 * 参数字段类型。
 *
 * 除了通用输入控件，有三种是生成类工具专用的：
 * - `seed`：数字 + 随机/锁定。可复现性是专业用户调参的前提
 * - `aspect`：宽高比九宫格。选「1024x1536」这种字符串反人类
 * - `tags`：多值标签输入。负面提示词天然是标签集合
 */
export type ParamFieldType
  = | 'text'
    | 'textarea'
    | 'number'
    | 'slider'
    | 'select'
    | 'segmented'
    | 'switch'
    | 'seed'
    | 'aspect'
    | 'tags'

export interface ParamOption {
  label: string
  value: string | number
  /** 选项说明。专业模型的选项名（如 DPM++ 3M SDE）用户往往不认识 */
  hint?: string
}

export interface ParamField {
  key: string
  label: string
  type: ParamFieldType
  /**
   * 一句话说明这个参数干什么、什么场景该调。
   *
   * 这是「容易上手」的主要手段：生成类工具的参数名对新手是黑话，
   * 把推荐值写进提示里，用户不用去查文档也能调对。
   */
  hint?: string
  placeholder?: string
  options?: readonly ParamOption[]
  min?: number
  max?: number
  step?: number
  /**
   * 滑块两端的语义标签，如「保守 / 大胆」。
   *
   * 只对 `slider` 生效。**必须由字段自己声明，不能由控件硬编码** ——
   * 同一个滑块控件也用于采样步数、降噪强度，那里显示「保守 / 大胆」就是错的。
   * 抽象的数值配上语义锚点才好懂，但没有合适锚点时宁可不要。
   */
  minLabel?: string
  maxLabel?: string
  default?: string | number | boolean | string[]
  /**
   * 表单里占几列（默认 1）。
   * 上限是所属节点声明的 `formColumns`，超出会被栅格挤到下一行。
   */
  span?: 1 | 2 | 3
  /** 文本域行数 */
  rows?: number
  /**
   * 收进「高级」折叠区。
   *
   * 专业工具参数动辄十几个，全平铺会让新手直接懵。默认只露 3–5 个
   * 真正影响结果的参数，其余收起来给熟悉的人用。
   */
  advanced?: boolean
  /**
   * 条件显示：仅当另一个字段等于指定值时才出现。
   * 用于模型相关的参数（如选了 Lightning 模型就不需要 30 步）。
   */
  showWhen?: { key: string, equals: string | number | boolean }
}

export type ParamSchema = readonly ParamField[]

/** 参数预估。后端返回实际值前，前端用它做粗略提示。 */
export interface NodeEstimate {
  cost?: number
  duration?: number
}

/** 参数分组，用于配置弹窗的分栏 */
export interface ParamGroup {
  title: string
  fields: ParamSchema
}

export interface NodeTypeDefinition<TParams = Record<string, unknown>> {
  /** 唯一 key，对应 GraphNode.type */
  type: string
  /** 显示名，如「文生图」 */
  label: string
  /** 右键菜单 / 节点面板的分组 */
  category: string
  /**
   * 图标。设计文档 §3.6 写的是 `Component`，这里用 emoji 字符串 ——
   * 零依赖且渲染稳定。
   */
  icon: string
  /** 一句话说明这个节点干什么。显示在配置弹窗标题下 */
  description?: string
  inputs: Port[]
  outputs: Port[]
  params: ParamSchema
  /**
   * 表单栅格列数（默认 3）。
   *
   * 列数取决于字段的性质，不是全局偏好：短数值多（步数、CFG、种子）用 3 列更紧凑；
   * 长下拉（模型名、题材风格）挤在三分之一宽里会被截断，用 2 列才看得清。
   */
  formColumns?: 2 | 3
  estimate?: (params: TParams) => NodeEstimate
  /**
   * 节点卡片上的单行参数摘要。
   * 注册表驱动渲染的关键 —— 节点自己知道怎么把 params 压成一行。
   */
  summarize?: (params: TParams) => string
  /**
   * 配置弹窗里的预设。一键填一组专业调好的参数，
   * 让不懂 sampler / CFG 的人也能直接出好结果。
   */
  presets?: readonly NodePreset[]
}

export interface NodePreset {
  name: string
  /** 这个预设适合什么场景 */
  hint?: string
  /** 只覆盖它关心的字段，其余保持用户当前值 */
  params: Record<string, unknown>
}

/** type → 定义。运行时用 unknown 存，取值处用泛型收窄。 */
export type NodeTypeMap = Record<string, NodeTypeDefinition<never> | NodeTypeDefinition<any>>
