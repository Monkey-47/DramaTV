/**
 * `llm-script` —— 创意 → 剧本（MVP 1.8）
 *
 * 验收标准（设计文档 §9.1）：新增节点类型只允许改本目录。
 *
 * 参数集参考主流 LLM 创作工具的暴露面：核心只有「创意 + 模型 + 温度」，
 * top_p / 最大长度 / 人设 / 种子收进高级 —— 新手不该被这些劝退。
 */

import type { NodeTypeDefinition } from '../../nodes.types'
import { registerNodeType } from '../../registry'

export interface LlmScriptParams {
  prompt: string
  model: string
  temperature: number
  style: string
  topP: number
  maxTokens: number
  systemPrompt: string
  seed: number
}

const MODELS = [
  { label: 'GPT-4o', value: 'gpt-4o', hint: '质量最高，适合正式剧本' },
  { label: 'GPT-4o mini', value: 'gpt-4o-mini', hint: '便宜快速，适合试稿' },
  { label: 'Claude Sonnet', value: 'claude-sonnet', hint: '长文本结构更稳，适合分镜' },
] as const

const STYLES = [
  { label: '不限', value: 'none' },
  { label: '写实', value: 'realistic', hint: '克制、生活化的对白与场景' },
  { label: '动画', value: 'anime', hint: '夸张表演、明快节奏' },
  { label: '悬疑', value: 'thriller', hint: '信息节制，逐步揭底' },
  { label: '喜剧', value: 'comedy', hint: '密集笑点，短句为主' },
  { label: '古装', value: 'period', hint: '文言感的措辞与礼制细节' },
] as const

const definition: NodeTypeDefinition<LlmScriptParams> = {
  type: 'llm-script',
  label: '剧本生成',
  category: '文本',
  icon: '📝',
  description: '把一个创意扩写成剧本。也可以接上游节点，把它的文本当作上下文继续加工。',
  inputs: [
    // 可选：上游创意可以连进来；连了就覆盖下面「创意」参数里写的内容
    { id: 'context', label: '上游文本', type: 'text' },
  ],
  outputs: [
    { id: 'script', label: '剧本', type: 'text' },
  ],
  params: [
    {
      key: 'prompt',
      label: '创意',
      type: 'textarea',
      rows: 4,
      span: 3,
      placeholder: '一句话描述你的想法。例如：赛博朋克少女在雨夜街头寻找失踪的哥哥',
      hint: '上游端口接了线就用上游的文本，这里填的内容会被忽略',
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: MODELS,
      default: 'gpt-4o',
      hint: '长剧本优先选上下文窗口大的',
    },
    {
      key: 'temperature',
      label: '创意程度',
      type: 'slider',
      min: 0,
      max: 2,
      step: 0.1,
      default: 0.8,
      hint: '0.3 忠实改写原文，0.8 常规创作，1.3 发散脑暴',
    },
    {
      key: 'style',
      label: '题材风格',
      type: 'select',
      options: STYLES,
      default: 'none',
      hint: '会作为人设前缀注入，影响措辞与节奏',
    },
    {
      key: 'topP',
      label: '采样范围',
      type: 'slider',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.9,
      advanced: true,
      hint: '0.9–0.95 通用。调低会让用词更保守、更可预测',
    },
    {
      key: 'maxTokens',
      label: '最大长度',
      type: 'number',
      min: 256,
      max: 32000,
      step: 256,
      default: 4096,
      advanced: true,
      hint: '一集短剧剧本大约需要 3000–6000',
    },
    {
      key: 'systemPrompt',
      label: '人设 / 附加要求',
      type: 'textarea',
      rows: 3,
      span: 3,
      advanced: true,
      placeholder: '例如：以第一人称旁白叙述，避免出现具体品牌名',
      hint: '写在这里的指令优先级最高',
    },
    {
      key: 'seed',
      label: '种子',
      type: 'seed',
      default: -1,
      advanced: true,
      hint: '固定种子可复现同一次输出，用于对比不同参数的效果',
    },
  ],
  presets: [
    { name: '忠实改写', hint: '严格贴着原意，少发挥', params: { temperature: 0.3, topP: 0.8 } },
    { name: '常规创作', hint: '大多数场景的默认选择', params: { temperature: 0.8, topP: 0.9 } },
    { name: '发散脑暴', hint: '一次多给几个方向', params: { temperature: 1.3, topP: 0.95 } },
  ],
  estimate: params => ({
    cost: 0.01 + (params.maxTokens ?? 4096) / 100000,
    duration: 8,
  }),
  summarize: (params) => {
    const style = STYLES.find(s => s.value === params.style)
    const parts = [params.model ?? 'gpt-4o', `温度 ${params.temperature ?? 0.8}`]
    if (style && style.value !== 'none') {
      parts.push(style.label)
    }
    return parts.join(' · ')
  },
}

registerNodeType(definition)

export default definition
