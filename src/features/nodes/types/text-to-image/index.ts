/**
 * `text-to-image` —— 提示词 → 图片（MVP 1.9）
 *
 * 候选数不是独立节点，而是本节点的参数（设计文档 §2.3）。
 *
 * 参数默认值取自 SDXL 的社区实测推荐区间：步数 25–35 是质量/耗时平衡点，
 * CFG 6–7 写实、7.5–8.5 动漫，采样器默认 DPM++ 2M Karras。
 * 分辨率全部取 64 的倍数（SDXL 训练分辨率 1024 的邻域），避免出图质量塌陷。
 */

import type { NodeTypeDefinition } from '../../nodes.types'
import { registerNodeType } from '../../registry'

export interface TextToImageParams {
  prompt: string
  model: string
  resolution: string
  candidateCount: number
  negativePrompt: string
  steps: number
  cfgScale: number
  sampler: string
  seed: number
}

const MODELS = [
  { label: 'SDXL', value: 'sdxl', hint: '通用，生态最全，可精确调参' },
  { label: 'Flux Pro', value: 'flux-pro', hint: '提示词理解强，文字渲染准' },
  { label: 'Seedream', value: 'seedream', hint: '国风与人物一致性见长' },
] as const

/** 取值都是 64 的倍数，贴近 SDXL 的训练分辨率 */
const ASPECTS = [
  { label: '1:1', value: '1024x1024' },
  { label: '2:3', value: '832x1216' },
  { label: '3:2', value: '1216x832' },
  { label: '3:4', value: '896x1152' },
  { label: '4:3', value: '1152x896' },
  { label: '9:16', value: '768x1344' },
  { label: '16:9', value: '1344x768' },
] as const

const SAMPLERS = [
  { label: 'DPM++ 2M Karras', value: 'dpmpp_2m_karras', hint: '通用首选，速度与质量平衡最好' },
  { label: 'DPM++ SDE Karras', value: 'dpmpp_sde_karras', hint: '人像与写实更细腻，稍慢' },
  { label: 'DPM++ 3M SDE', value: 'dpmpp_3m_sde', hint: '细节锐利，适合大场景' },
  { label: 'Euler a', value: 'euler_a', hint: '快，适合草稿与动漫；步数别拉太高' },
  { label: 'DDIM', value: 'ddim', hint: '结果稳，抽象风格常用' },
] as const

/** 默认分辨率。必须是 ASPECTS 里的某一项，`param-schema-sanity` 测试会校验 */
const DEFAULT_RESOLUTION = '832x1216'
const DEFAULT_CANDIDATES = 4

/** SDXL 的通用质量排除项。刻意保持短 —— SDXL 不像 SD1.5 那样需要长负面词表 */
const DEFAULT_NEGATIVE = [
  'low quality',
  'worst quality',
  'blurry',
  'bad anatomy',
  'extra fingers',
  'watermark',
  'text',
]

const definition: NodeTypeDefinition<TextToImageParams> = {
  type: 'text-to-image',
  label: '文生图',
  category: '图片',
  icon: '🖼',
  description: '用一段文字描述生成图片。一次出多张候选，挑满意的那张。',
  inputs: [
    { id: 'prompt', label: '提示词', type: 'text', required: true },
    { id: 'seed', label: '种子', type: 'number' },
  ],
  outputs: [
    { id: 'image', label: '图片', type: 'image' },
  ],
  params: [
    {
      key: 'prompt',
      label: '提示词',
      type: 'textarea',
      rows: 4,
      span: 3,
      placeholder: '描述画面内容、风格、光线、镜头。例如：赛博朋克少女，雨夜霓虹街头，浅景深，电影感打光',
      hint: 'SDXL 更吃自然语言长句，不像 SD1.5 那样堆标签；上游端口接了线就用上游内容',
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: MODELS,
      default: 'sdxl',
      hint: '需要精细调参选 SDXL；想省事选 Flux Pro',
    },
    {
      key: 'resolution',
      label: '画面比例',
      type: 'aspect',
      options: ASPECTS,
      default: DEFAULT_RESOLUTION,
      span: 3,
      hint: '竖屏适合人物，横屏适合场景。比例会改变构图，不只是裁切',
    },
    {
      key: 'candidateCount',
      label: '候选数',
      type: 'slider',
      min: 1,
      max: 8,
      step: 1,
      default: DEFAULT_CANDIDATES,
      hint: '一次出几张供挑选。每张都单独计费',
    },
    {
      key: 'negativePrompt',
      label: '负面提示词',
      type: 'tags',
      span: 3,
      advanced: true,
      default: DEFAULT_NEGATIVE,
      hint: '输入后回车添加。SDXL 负面词宜短，太多会削弱正常内容',
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
      hint: '25–35 是平衡点。再往上收益很小、耗时线性涨',
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
      hint: '写实 6–7.5，动漫 7.5–8.5。过高会僵硬、出现色块瑕疵',
    },
    {
      key: 'sampler',
      label: '采样器',
      type: 'select',
      options: SAMPLERS,
      default: 'dpmpp_2m_karras',
      advanced: true,
      hint: '不确定就保持默认，它对绝大多数题材都不差',
    },
    {
      key: 'seed',
      label: '种子',
      type: 'seed',
      default: -1,
      advanced: true,
      hint: '固定种子 + 微调提示词，是找到理想构图最有效的办法',
    },
  ],
  presets: [
    {
      name: '写实摄影',
      hint: '人像、产品、真实场景',
      params: {
        steps: 32,
        cfgScale: 6.5,
        sampler: 'dpmpp_sde_karras',
        // 写实风格要额外排除绘画类词汇，否则容易出插画感
        negativePrompt: [...DEFAULT_NEGATIVE, 'anime', 'illustration', 'cartoon', '3d render'],
      },
    },
    {
      name: '动漫插画',
      hint: '二次元、赛璐璐风格',
      params: {
        steps: 28,
        cfgScale: 8,
        sampler: 'euler_a',
        negativePrompt: [...DEFAULT_NEGATIVE, 'photorealistic', '3d', 'realistic skin'],
      },
    },
    {
      name: '极速草稿',
      hint: '快速看构图，满意后再正式跑',
      params: { steps: 8, cfgScale: 2, sampler: 'euler_a' },
    },
  ],
  estimate: params => ({
    cost: 0.04 * (params.candidateCount ?? DEFAULT_CANDIDATES),
    duration: 20 * (params.candidateCount ?? DEFAULT_CANDIDATES),
  }),
  summarize: (params) => {
    // 缺参数时走 schema 默认值再查比例表，这样摘要和表单显示的是同一个值
    const resolution = params.resolution ?? DEFAULT_RESOLUTION
    const aspect = ASPECTS.find(a => a.value === resolution)
    const ratio = aspect ? aspect.label : formatResolution(resolution)
    return `${ratio} · 候选 ${params.candidateCount ?? DEFAULT_CANDIDATES}`
  },
}

/** '832x1216' → '832×1216'（比例不在预设表里时的退路） */
function formatResolution(resolution: string): string {
  return resolution.replace('x', '×')
}

registerNodeType(definition)

export default definition
