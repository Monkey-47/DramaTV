<script setup lang="ts">
import type { NodeStatus } from '@/shared/constants/theme'
/**
 * 节点外框 —— 设计文档 §4.1（ui-design-spec v1.1）
 *
 * 纯展示组件：不 import @vue-flow/*（画布库只允许出现在 features/canvas 内，
 * 见设计文档 §6.1）。端口圆点由 canvas 的适配层渲染，Shell 只负责节点本身。
 */
import { computed } from 'vue'
import { STATE } from '@/shared/constants/theme'

// 注：可选属性显式带 `| undefined` —— tsconfig 开了 exactOptionalPropertyTypes，
// 否则调用方传 undefined 会被判为类型错误（设计文档 §8 风险 4 预警过这个冲突）。
const props = defineProps<{
  label: string
  icon?: string | undefined
  summary?: string | undefined
  status?: NodeStatus | undefined
  frozen?: boolean | undefined
  reused?: boolean | undefined
  /** 0–100，仅 running 时有意义 */
  progress?: number | undefined
  /** 本轮候选数；> 0 时在节点上显示候选入口 */
  candidateCount?: number | undefined
}>()

const emit = defineEmits<{
  openCandidates: []
}>()

/** 顶部 3px 色条。frozen 是叠加标记，优先级高于基础状态。 */
const barColor = computed(() => {
  if (props.frozen)
    return STATE.frozen
  switch (props.status) {
    case 'running': return STATE.running
    case 'succeeded': return STATE.succeeded
    case 'failed': return STATE.error
    case 'queued':
    case 'skipped':
    case 'cancelled': return STATE.queued
    default: return STATE.idle
  }
})

/** 运行中的进度条渐变：已完成部分用状态色，未完成部分用边框灰 */
const progressStyle = computed(() => {
  const done = Math.max(0, Math.min(100, props.progress ?? 0))
  return {
    background: `linear-gradient(to right, ${STATE.running} ${done}%, ${STATE.queued} ${done}%)`,
  }
})

/** 「复用缓存」用紫罗兰，与 running 的 indigo 区分开（ui-design-spec §3.2） */
const REUSED_COLOR = '#a78bfa'

const frozenColor = computed(() => STATE.frozen)
const reusedColor = computed(() => REUSED_COLOR)
const failedColor = computed(() => STATE.error)
</script>

<template>
  <div class="node-shell" :data-status="status ?? 'idle'">
    <div class="state-bar" :style="{ background: barColor }" />

    <div class="header">
      <span v-if="icon" class="icon">{{ icon }}</span>
      <span class="label">{{ label }}</span>
    </div>

    <div v-if="summary" class="summary">
      {{ summary }}
    </div>

    <div v-if="status === 'running'" class="progress">
      <div class="progress-fill" :style="progressStyle" />
    </div>

    <div v-if="frozen" class="badge" :style="{ color: frozenColor }">
      🔒 已冻结
    </div>
    <div v-else-if="reused" class="badge" :style="{ color: reusedColor }">
      ⚡ 复用缓存
    </div>
    <div v-else-if="status === 'failed'" class="badge" :style="{ color: failedColor }">
      ✗ 失败
    </div>
    <div v-else-if="status === 'skipped'" class="badge muted">
      ⊘ 已跳过
    </div>

    <!-- 候选入口。不用双击 —— 单击开配置弹窗后遮罩会吃掉双击的后半段 -->
    <button
      v-if="(candidateCount ?? 0) > 0"
      class="candidates-chip"
      type="button"
      :title="`查看 ${candidateCount} 个候选`"
      @click.stop="emit('openCandidates')"
      @pointerdown.stop
    >
      <span class="chip-grid" />
      {{ candidateCount }} 个候选
    </button>
  </div>
</template>

<style scoped>
.node-shell {
  position: relative;
  min-width: 140px;
  padding: 11px 12px 10px;
  background: #1c1c20;
  border: 2px solid #3f3f46;
  border-radius: 8px;
  color: #e4e4e7;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  font-size: 11px;
  user-select: none;
}

.state-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 8px 8px 0 0;
}

.header {
  display: flex;
  align-items: center;
  gap: 5px;
  line-height: 1.3;
}

.icon {
  font-size: 11px;
  line-height: 1;
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: #e4e4e7;
}

.summary {
  margin-top: 3px;
  font-size: 9px;
  color: #6b6b74;
  line-height: 1.3;
}

.progress {
  margin-top: 6px;
  height: 3px;
  background: #3f3f46;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 3px;
  border-radius: 2px;
  transition: background 0.2s linear;
}

.badge {
  margin-top: 6px;
  font-size: 9px;
  line-height: 1;
}

.badge.muted {
  color: #52525b;
}

.candidates-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  padding: 3px 7px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: 4px;
  color: #a1a1aa;
  font: inherit;
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.candidates-chip:hover {
  background: #2e2e32;
  border-color: #6366f1;
  color: #c7d2fe;
}

/* 四个小方块，暗示「多张候选」 */
.chip-grid {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  background:
    linear-gradient(#6366f1, #6366f1) 0 0 / 3px 3px no-repeat,
    linear-gradient(#6366f1, #6366f1) 4px 0 / 3px 3px no-repeat,
    linear-gradient(#6366f1, #6366f1) 0 4px / 3px 3px no-repeat,
    linear-gradient(#6366f1, #6366f1) 4px 4px / 3px 3px no-repeat;
}
</style>
