/**
 * `image-to-image` —— 参考图 + 提示词 → 新图（设计文档 §2.3 节点类型表 / MVP 3.4）
 *
 * 与 text-to-image 的关键差别是 `denoise`：它决定新图和参考图有多像。
 * 这是图生图唯一真正难理解的参数，所以给了完整的分档提示。
 */

import type { NodeTypeDefinition } from '../../nodes.types'
import { registerNodeType } from '../../registry'

export interface ImageToImageParams {
  prompt: string
  model: string
  denoise: number
  resolution: string
  candidateCount: number
  negativePrompt: string
  steps: number
  cfgScale: number
  seed: number
}

const MODELS = [
  { label: 'SDXL', value: 'sdxl', hint: '通用，改动尺度好控制' },
  { label: 'Flux Pro', value: 'flux-pro', hint: '遵循提示词更强' },
] as const

const ASPECTS = [
  { label: '1:1', value: '1024x1024' },
  { label: '2:3', value: '832x1216' },
  { label: '3:2', value: '1216x832' },
  { label: '9:16', value: '768x1344' },
  { label: '16:9', value: '1344x768' },
] as const

const DEFAULT_DENOISE = 0.6
const DEFAULT_CANDIDATES = 4

const DEFAULT_NEGATIVE = [
  'low quality',
  'blurry',
  'bad anatomy',
  'extra fingers',
  'watermark',
  'text',
]

const definition: NodeTypeDefinition<ImageToImageParams> = {
  type: 'image-to-image',
  label: '图生图',
  category: '图片',
  icon: '🎨',
  description: '在一张参考图的基础上生成新图。改动幅度由「参考强度」控制。',
  inputs: [
    { id: 'reference', label: '参考图', type: 'image', required: true },
    { id: 'prompt', label: '提示词', type: 'text' },
  ],
  outputs: [
    { id: 'image', label: '图片', type: 'image' },
  ],
  params: [
    {
      key: 'prompt',
      label: '提示词',
      type: 'textarea',
      rows: 3,
      span: 3,
      placeholder: '描述你想要的最终画面',
      hint: '想保留参考图的结构时，提示词只写要改的部分',
    },
    {
      key: 'denoise',
      label: '参考强度（改动幅度）',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.05,
      default: DEFAULT_DENOISE,
      span: 2,
      hint: '0.2 只调色调光影 · 0.5 换风格保构图 · 0.8 几乎重画。这是图生图最重要的参数',
    },
    {
      key: 'candidateCount',
      label: '候选数',
      type: 'slider',
      min: 1,
      max: 8,
      step: 1,
      default: DEFAULT_CANDIDATES,
      hint: '一次出几张供挑选',
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: MODELS,
      default: 'sdxl',
      advanced: true,
    },
    {
      key: 'resolution',
      label: '输出比例',
      type: 'aspect',
      options: ASPECTS,
      default: '1024x1024',
      span: 3,
      advanced: true,
      hint: '和参考图比例不同时会先裁切再生成',
    },
    {
      key: 'negativePrompt',
      label: '负面提示词',
      type: 'tags',
      span: 3,
      advanced: true,
      default: DEFAULT_NEGATIVE,
      hint: '输入后回车添加。保持简短',
    },
    {
      key: 'steps',
      label: '采样步数',
      type: 'slider',
      min: 10,
      max: 60,
      step: 1,
      default: 30,
      advanced: true,
      hint: '25–35 是平衡点',
    },
    {
      key: 'cfgScale',
      label: '提示词引导强度',
      type: 'slider',
      min: 1,
      max: 15,
      step: 0.5,
      default: 7,
      advanced: true,
      hint: '参考强度高时适当调低，避免和参考图较劲',
    },
    {
      key: 'seed',
      label: '种子',
      type: 'seed',
      default: -1,
      advanced: true,
      hint: '固定种子可以对比不同参考强度的效果',
    },
  ],
  presets: [
    { name: '轻微调整', hint: '保留原图，只动色调光影', params: { denoise: 0.25, cfgScale: 6 } },
    { name: '风格迁移', hint: '换画风但保住构图', params: { denoise: 0.5, cfgScale: 7 } },
    { name: '大幅重画', hint: '只借用大结构', params: { denoise: 0.8, cfgScale: 8 } },
  ],
  estimate: params => ({
    cost: 0.04 * (params.candidateCount ?? DEFAULT_CANDIDATES),
    duration: 18 * (params.candidateCount ?? DEFAULT_CANDIDATES),
  }),
  summarize: (params) => {
    const aspect = ASPECTS.find(a => a.value === (params.resolution ?? '1024x1024'))
    const ratio = aspect ? aspect.label : '1:1'
    return `参考 ${params.denoise ?? DEFAULT_DENOISE} · ${ratio} · 候选 ${params.candidateCount ?? DEFAULT_CANDIDATES}`
  },
}

registerNodeType(definition)

export default definition
