/**
 * `image-to-video` —— 关键帧 → 视频片段（设计文档 §2.3 节点类型表 / MVP 4.1）
 *
 * 视频参数和生图差别很大：时长、帧率、运镜、运动强度都是生图没有的。
 *
 * 默认值取自主流视频模型的交集：Runway 的运镜（方向 + 强度）、
 * Kling 的 motion_strength（0.0–1.0）、各家都支持 5s/10s 与 16:9 / 9:16 / 1:1。
 */

import type { NodeTypeDefinition } from '../../nodes.types'
import { registerNodeType } from '../../registry'

export interface ImageToVideoParams {
  prompt: string
  model: string
  duration: number
  aspectRatio: string
  cameraMotion: string
  cameraIntensity: string
  motionStrength: number
  negativePrompt: string
  fps: number
  seed: number
  keepFirstFrame: boolean
}

const MODELS = [
  { label: 'Kling v2', value: 'kling-v2', hint: '运动自然，运镜稳' },
  { label: 'Runway Gen-4', value: 'runway-gen4', hint: '镜头控制最精细' },
  { label: 'Pika 2.5', value: 'pika-2.5', hint: '风格化转场见长' },
] as const

const ASPECTS = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
] as const

/** Runway 的运镜模型比单一数值更可控，主流专业工具都在往这个方向收敛 */
const CAMERA_MOTIONS = [
  { label: '静止', value: 'static', hint: '机位不动，只让画面内容动' },
  { label: '推近', value: 'dolly_in', hint: '缓慢靠近主体，强调情绪' },
  { label: '拉远', value: 'dolly_out', hint: '交代环境，适合收尾' },
  { label: '横移', value: 'truck', hint: '平行移动，展示空间关系' },
  { label: '摇镜', value: 'pan', hint: '原地旋转视角' },
  { label: '俯仰', value: 'tilt', hint: '上下摇，适合高耸或低角度' },
  { label: '变焦', value: 'zoom', hint: '不移动机位的视觉缩放' },
] as const

const INTENSITIES = [
  { label: '弱', value: 'low', hint: '微妙，适合对话镜头' },
  { label: '中', value: 'medium', hint: '大多数场景的默认' },
  { label: '强', value: 'high', hint: '动作戏，注意可能画面撕裂' },
] as const

const DEFAULT_MOTION_STRENGTH = 0.5

const DEFAULT_NEGATIVE = [
  'blurry',
  'distorted',
  'extra limbs',
  'watermark',
  'text',
  'flickering',
]

const definition: NodeTypeDefinition<ImageToVideoParams> = {
  type: 'image-to-video',
  label: '图生视频',
  category: '视频',
  icon: '🎬',
  description: '用一张关键帧生成一段视频。只描述「要动什么」，不要重复描述画面里已经有的东西。',
  inputs: [
    // 建议关键帧长边 ≥ 1024px，否则模型内部会先放大、画面发软
    { id: 'keyframe', label: '关键帧', type: 'image', required: true },
  ],
  outputs: [
    { id: 'video', label: '视频片段', type: 'video' },
  ],
  params: [
    {
      key: 'prompt',
      label: '运动描述',
      type: 'textarea',
      rows: 3,
      span: 3,
      placeholder: '例如：镜头缓慢推近，头发在风中轻微摆动，雨滴落在肩上',
      hint: '只写「怎么动」。重复描述画面内容会和关键帧打架，反而让画面漂移',
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: MODELS,
      default: 'kling-v2',
      hint: '要精确运镜选 Runway，要自然运动选 Kling',
    },
    {
      key: 'duration',
      label: '时长',
      type: 'segmented',
      options: [
        { label: '5 秒', value: 5, hint: '最常用，成本低' },
        { label: '10 秒', value: 10, hint: '约两倍成本' },
      ],
      default: 5,
      hint: '片段太短会显得突兀，成片里通常按 3–5 秒切',
    },
    {
      key: 'aspectRatio',
      label: '画幅',
      type: 'segmented',
      options: ASPECTS,
      default: '16:9',
      hint: '要和上游关键帧一致，否则会被居中裁切',
    },
    {
      key: 'cameraMotion',
      label: '运镜',
      type: 'select',
      options: CAMERA_MOTIONS,
      default: 'dolly_in',
      hint: '不确定就用「推近」，它几乎不会出错',
    },
    {
      key: 'cameraIntensity',
      label: '运镜幅度',
      type: 'segmented',
      options: INTENSITIES,
      default: 'medium',
      hint: '只有运镜不是「静止」时才起作用',
    },
    {
      key: 'motionStrength',
      label: '运动强度',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.05,
      default: DEFAULT_MOTION_STRENGTH,
      hint: '0.3 微妙（对话），0.5 常规，0.8 剧烈（动作）。过高容易变形',
    },
    {
      key: 'negativePrompt',
      label: '负面提示词',
      type: 'tags',
      span: 3,
      advanced: true,
      default: DEFAULT_NEGATIVE,
      hint: '输入后回车添加。视频最容易出闪烁和肢体变形，优先写这两类',
    },
    {
      key: 'fps',
      label: '帧率',
      type: 'select',
      options: [
        { label: '24 fps', value: 24, hint: '电影感，成片标准' },
        { label: '30 fps', value: 30, hint: '更顺滑，适合网络视频' },
      ],
      default: 24,
      advanced: true,
      hint: '多数模型内部按低帧率生成再插帧，调高不会增加细节',
    },
    {
      key: 'keepFirstFrame',
      label: '锁定首帧',
      type: 'switch',
      default: true,
      advanced: true,
      hint: '开启后画面从关键帧开始，和上游衔接更稳',
    },
    {
      key: 'seed',
      label: '种子',
      type: 'seed',
      default: -1,
      advanced: true,
      hint: '换种子比改提示词更容易得到不同的运动轨迹',
    },
  ],
  presets: [
    {
      name: '对话镜头',
      hint: '人物说话，机位稳定',
      params: { cameraMotion: 'static', cameraIntensity: 'low', motionStrength: 0.3, duration: 5 },
    },
    {
      name: '情绪推进',
      hint: '缓慢推近，强调表情',
      params: { cameraMotion: 'dolly_in', cameraIntensity: 'medium', motionStrength: 0.5, duration: 5 },
    },
    {
      name: '动作场面',
      hint: '运动幅度大，注意检查变形',
      params: { cameraMotion: 'truck', cameraIntensity: 'high', motionStrength: 0.8, duration: 10 },
    },
  ],
  estimate: params => ({
    cost: 0.5 * ((params.duration ?? 5) / 5),
    duration: 90 * ((params.duration ?? 5) / 5),
  }),
  summarize: (params) => {
    const motion = CAMERA_MOTIONS.find(m => m.value === params.cameraMotion)
    return `${params.duration ?? 5}s · ${motion ? motion.label : '推近'} · ${params.aspectRatio ?? '16:9'}`
  },
}

registerNodeType(definition)

export default definition
