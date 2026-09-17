<script setup lang="ts">
/**
 * 节点在 Vue Flow 里的适配层。
 *
 * 职责只有两件：把 Vue Flow 的 handle 摆到节点左右两侧；把节点主体
 * 交给 features/nodes/NodeShell.vue 渲染（那才是设计文档 §1.7 说的 NodeShell）。
 *
 * 这一层必须留在 canvas 内 —— NodeShell 不能 import @vue-flow/*（设计文档 §6.1）。
 */
import type { NodeProps } from '@vue-flow/core'
import type { NodeRenderMeta } from './mapping.types'
import type { Port, PortType } from '@/features/graph/graph.types'
import { Handle, Position } from '@vue-flow/core'
import { inject } from 'vue'
import NodeShell from '@/features/nodes/NodeShell.vue'
import { PORT, PORT_DOT } from '@/shared/constants/theme'
import { CANVAS_ACTIONS } from './canvas-actions'

interface CanvasNodeData {
  node: { type: string, data: Record<string, unknown> }
  inputs: Port[]
  outputs: Port[]
  label: string
  icon?: string
  summary?: string
  meta: NodeRenderMeta
}

const props = defineProps<NodeProps<CanvasNodeData>>()

const actions = inject(CANVAS_ACTIONS, undefined)

/**
 * 交互通道都走 provide/inject，不直接调 store：features/canvas 不该认识应用级 store。
 *
 * 注意这里**没有双击**。设计文档 §6.2 原本把候选面板绑在双击上，但单击开配置
 * 弹窗后，弹窗的全屏遮罩会吃掉双击手势的后半段 —— 两个手势在浏览器层面互斥。
 * 候选改用节点上的可见入口（NodeShell 的「N 个候选」按钮）。
 */
function onActivate(): void {
  actions?.openNodeConfig(props.id)
}

function onShowCandidates(): void {
  actions?.openNodeCandidates(props.id)
}

/**
 * 右键开菜单。
 *
 * `.prevent` 是必需的：不拦的话浏览器会弹自己的原生菜单。
 * 另外 Vue Flow 默认用右键平移画布（panOnDrag: [1, 2]），节点上的右键
 * 会被节点自己先接住（节点的 pointer-events 在画布之上），所以不冲突 ——
 * 在空白处右键仍然是平移。
 */
function onContextMenu(e: MouseEvent): void {
  actions?.openNodeMenu(props.id, e.clientX, e.clientY)
}

function portStyle(type: PortType) {
  return {
    background: PORT[type],
    width: `${PORT_DOT.default}px`,
    height: `${PORT_DOT.default}px`,
    border: '2px solid #131316',
  }
}
</script>

<template>
  <div
    class="canvas-node-wrap"
    title="单击打开配置 · 右键更多操作"
    @click="onActivate"
    @contextmenu.prevent="onContextMenu"
  >
    <NodeShell
      :label="data.label"
      :icon="data.icon"
      :summary="data.summary"
      :status="data.meta.status"
      :frozen="data.meta.frozen"
      :reused="data.meta.reused"
      :progress="data.meta.progress"
      :candidate-count="data.meta.candidateCount"
      @open-candidates="onShowCandidates"
    />

    <Handle
      v-for="p in data.inputs"
      :id="`${props.id}::${p.id}`"
      :key="`in-${p.id}`"
      type="target"
      :position="Position.Left"
      :style="portStyle(p.type)"
    />
    <Handle
      v-for="p in data.outputs"
      :id="`${props.id}::${p.id}`"
      :key="`out-${p.id}`"
      type="source"
      :position="Position.Right"
      :style="portStyle(p.type)"
    />
  </div>
</template>

<style scoped>
.canvas-node-wrap {
  position: relative;
}
</style>
