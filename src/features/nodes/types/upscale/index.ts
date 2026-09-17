/**
 * `upscale` —— 放大 / 超分（设计文档 §2.3 节点类型表 / MVP 3.6）
 *
 * 非生成类节点，所以候选数固定 1（设计文档 §2.3 表格：upscale 产出图、候选数 1）。
 */

import type { NodeTypeDefinition } from '../../nodes.types'
import { registerNodeType } from '../../registry'

export interface UpscaleParams {
  model: string
  scale: number
  faceRestore: boolean
  denoise: number
  tileSize: number
}

const MODELS = [
  { label: 'Real-ESRGAN', value: 'real-esrgan', hint: '通用首选，对照片和插画都不差' },
  { label: 'SwinIR', value: 'swinir', hint: '纹理还原更细，速度慢' },
  { label: '4x-UltraSharp', value: '4x-ultrasharp', hint: '偏锐，适合动漫线稿' },
] as const

const DEFAULT_SCALE = 2

const definition: NodeTypeDefinition<UpscaleParams> = {
  type: 'upscale',
  label: '放大',
  category: '图片处理',
  icon: '🔍',
  description: '把图片放大到更高分辨率。用于把选定的小图提升到出片规格。',
  inputs: [
    { id: 'image', label: '原图', type: 'image', required: true },
  ],
  outputs: [
    { id: 'image', label: '放大图', type: 'image' },
  ],
  params: [
    {
      key: 'scale',
      label: '放大倍数',
      type: 'segmented',
      options: [
        { label: '2×', value: 2, hint: '1080p 以下够用' },
        { label: '4×', value: 4, hint: '出片常用' },
        { label: '8×', value: 8, hint: '耗时长，收益递减' },
      ],
      default: DEFAULT_SCALE,
      hint: '倍数越高耗时越长。4× 之后再往上，肉眼差别已经有限',
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: MODELS,
      default: 'real-esrgan',
      hint: '人像优先 SwinIR，动漫优先 4x-UltraSharp',
    },
    {
      key: 'faceRestore',
      label: '人脸修复',
      type: 'switch',
      default: false,
      hint: '人像放大后五官发糊时打开。非人像画面开了反而会出怪脸',
    },
    {
      key: 'denoise',
      label: '降噪强度',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.3,
      advanced: true,
      hint: '放大前先抹掉原图的噪点。过高会丢掉皮肤和布料纹理',
    },
    {
      key: 'tileSize',
      label: '分块尺寸',
      type: 'number',
      min: 128,
      max: 1024,
      step: 64,
      default: 512,
      advanced: true,
      hint: '显存不够导致失败时调小它',
    },
  ],
  presets: [
    { name: '出片规格', hint: '2× 到 1080p，速度快', params: { scale: 2, faceRestore: false, denoise: 0.3 } },
    { name: '人像精修', hint: '4× + 人脸修复', params: { scale: 4, model: 'swinir', faceRestore: true, denoise: 0.25 } },
    { name: '动漫线稿', hint: '4× 锐化，不降噪', params: { scale: 4, model: '4x-ultrasharp', faceRestore: false, denoise: 0 } },
  ],
  estimate: params => ({
    cost: 0.02,
    duration: 5 * ((params.scale ?? DEFAULT_SCALE) / 2) ** 2,
  }),
  summarize: params => `${params.scale ?? DEFAULT_SCALE}× · ${params.faceRestore ? '含人脸修复' : '标准'}`,
}

registerNodeType(definition)

export default definition
