<script setup lang="ts">
/**
 * 工作流分区节点 —— 设计文档 §6.1 GroupNode。
 *
 * 尺寸由 mapping.renderProject() 通过 style.width/height 显式给出
 * （Vue Flow 的 group 没尺寸会塌成 0×0，子节点也会被 extent:'parent' 锁死）。
 *
 * 交互：整体可拖动（移动分区）；标题双击改名；标题右侧 × 删除分区。
 * 标题上的指针事件必须 .stop，否则会触发 Vue Flow 的分区拖拽。
 */
import type { NodeProps } from '@vue-flow/core'
import { computed, inject, nextTick, onBeforeUnmount, ref } from 'vue'
import { WORKFLOW_COLORS } from '@/shared/constants/theme'
import { CANVAS_ACTIONS } from './canvas-actions'

interface GroupData {
  workflowId: string
  name: string
  color: 1 | 2 | 3 | 4 | 5
}

const props = defineProps<NodeProps<GroupData>>()

const actions = inject(CANVAS_ACTIONS, undefined)

const color = computed(() => WORKFLOW_COLORS[props.data.color] ?? WORKFLOW_COLORS[1])

const boxStyle = computed(() => ({
  background: hexToRgba(color.value, 0.08),
  borderColor: hexToRgba(color.value, 0.55),
}))

const headerStyle = computed(() => ({
  borderColor: hexToRgba(color.value, 0.4),
}))

const dotStyle = computed(() => ({ background: color.value }))

// ── 改名 ──────────────────────────────────────────────────────────────────
const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

async function startRename(): Promise<void> {
  draft.value = props.data.name
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function commitRename(): void {
  if (!editing.value)
    return
  editing.value = false
  const name = draft.value.trim()
  if (name && name !== props.data.name)
    actions?.renameWorkflow(props.data.workflowId, name)
}

function cancelRename(): void {
  editing.value = false
}

// ── 删除确认 ──────────────────────────────────────────────────────────────
// 删除分区会连带删掉里面的节点，所以要点两下。刻意用行内二次确认而不是
// window.confirm（eslint no-alert 禁掉了原生弹窗），也比模态框快。

const confirming = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

function askRemove(): void {
  confirming.value = true
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => {
    confirming.value = false
  }, 4000)
}

function cancelRemove(): void {
  confirming.value = false
  clearTimeout(confirmTimer)
}

function confirmRemove(): void {
  cancelRemove()
  actions?.removeWorkflow(props.data.workflowId)
}

onBeforeUnmount(() => clearTimeout(confirmTimer))

/** #rrggbb → rgba(r,g,b,a)。避免依赖 color-mix 的浏览器支持度。 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
</script>

<template>
  <div class="group-node" :style="boxStyle">
    <div class="group-header" :style="headerStyle">
      <span class="group-dot" :style="dotStyle" />

      <input
        v-if="editing"
        ref="inputEl"
        v-model="draft"
        class="group-name-input"
        type="text"
        @pointerdown.stop
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      >
      <span
        v-else
        class="group-name"
        title="双击改名"
        @pointerdown.stop
        @dblclick.stop="startRename"
      >
        {{ data.name }}
      </span>

      <template v-if="actions && confirming">
        <span class="group-confirm-text">删除？</span>
        <button
          class="group-confirm group-confirm--danger"
          type="button"
          title="确认删除"
          @pointerdown.stop
          @click.stop="confirmRemove"
        >
          确认
        </button>
        <button
          class="group-confirm"
          type="button"
          title="取消"
          @pointerdown.stop
          @click.stop="cancelRemove"
        >
          取消
        </button>
      </template>

      <button
        v-else-if="actions"
        class="group-remove"
        type="button"
        title="删除分区"
        @pointerdown.stop
        @click.stop="askRemove"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.group-node {
  width: 100%;
  height: 100%;
  border: 1.5px dashed #3f3f46;
  border-radius: 10px;
  position: relative;
  /* 关键：分区主体不吃指针事件。
     否则整块分区会吞掉拖拽，用户没法在分区内框选节点（一拖就变成搬分区）。
     分区改由标题栏拖动 —— 标题的 pointer-events: all 会让事件冒泡到
     Vue Flow 的节点元素，d3-drag 照常触发。 */
  pointer-events: none;
  box-sizing: border-box;
}

.group-header {
  position: absolute;
  top: -11px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px 2px 8px;
  background: #1f1f24;
  border: 1px solid #3f3f46;
  border-radius: 4px;
  font-size: 11px;
  color: #e4e4e7;
  font-weight: 600;
  user-select: none;
  white-space: nowrap;
  z-index: 1;
  cursor: grab;
  pointer-events: all;
}

.group-header:active {
  cursor: grabbing;
}

.group-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-name {
  line-height: 1;
  cursor: text;
}

.group-name-input {
  width: 84px;
  background: #131316;
  border: 1px solid #6366f1;
  border-radius: 3px;
  color: #e4e4e7;
  font: inherit;
  padding: 0 3px;
  outline: none;
}

.group-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #6b6b74;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s,
    background 0.12s,
    color 0.12s;
}

.group-confirm-text {
  color: #a1a1aa;
  font-weight: 400;
}

.group-confirm {
  padding: 1px 6px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: 3px;
  color: #d4d4d8;
  font: inherit;
  font-weight: 400;
  cursor: pointer;
}

.group-confirm:hover {
  background: #2e2e32;
}

.group-confirm--danger {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

.group-confirm--danger:hover {
  background: #dc2626;
}

.group-header:hover .group-remove {
  opacity: 1;
}

.group-remove:hover {
  background: #ef4444;
  color: #fff;
}
</style>
