<script setup lang="ts">
import type { NodePreset, NodeTypeDefinition } from './nodes.types'
/**
 * 节点详细配置弹窗。
 *
 * 三个信息层次，从上到下：
 * 1. 这个节点是什么（图标 + 名称 + 一句话说明）
 * 2. 它现在处于什么状态、能不能跑（运行态 + 输入端口连接情况）
 * 3. 参数怎么调（schema 驱动的表单 + 预设）
 *
 * 「必填输入没连接」是节点跑不起来的头号原因，所以在参数之前就顶出来。
 */
import type { Port } from '@/features/graph/graph.types'
import { NButton, NModal } from 'naive-ui'
import { computed } from 'vue'
import { applyDefaults, formatEstimate } from './fields/param-helpers'
import ParamForm from './ParamForm.vue'

/** 只读展示用的运行态切片，来自 runner store */
export interface ModalRunState {
  status?: string
  progress?: number
  reused?: boolean
  error?: { code: string, message: string }
}

const props = defineProps<{
  open: boolean
  definition: NodeTypeDefinition<any> | undefined
  params: Record<string, unknown>
  runState?: ModalRunState | undefined
  inputs?: Port[] | undefined
  /**
   * 已连接的输入端口 id。
   *
   * 契约里给的 `Port` 类型不含连接状态，没有它就没法区分「接了」和「没接」。
   * 所以这里加了一个可选入参：不传时只显示必填标记，不做连接判断（不猜、不误报）。
   */
  connectedPortIds?: readonly string[] | undefined
}>()

const emit = defineEmits<{
  'update:param': [key: string, value: unknown]
  'applyPreset': [preset: NodePreset]
  'close': []
  /**
   * 离场动画真正播完。
   *
   * 父组件靠它决定何时清空 `definition` / `params` —— 早一步清，
   * 表单内容会当场卸载、盒子高度先塌下去，缩放动画就作用在一个小矩形上，
   * 看起来是「突然塌掉」而不是「缩回去」。
   */
  'afterLeave': []
}>()

/** 估算要按「合并默认值之后」的参数算，否则用户没动过的字段会算成空 */
const estimateText = computed(() => {
  const def = props.definition
  if (def?.estimate === undefined) {
    return ''
  }
  return formatEstimate(def.estimate(applyDefaults(def.params, props.params)))
})

const STATUS_TEXT: Record<string, string> = {
  pending: '等待上游',
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  skipped: '已跳过',
  cancelled: '已取消',
}

const runStatusText = computed(() => {
  const status = props.runState?.status
  return status === undefined ? '' : (STATUS_TEXT[status] ?? status)
})

const portRows = computed(() => {
  const inputs = props.inputs ?? []
  const connected = props.connectedPortIds
  return inputs.map(port => ({
    port,
    /** 没有连接信息时不做判断，避免误报 */
    checkable: connected !== undefined,
    connected: connected === undefined ? false : connected.includes(port.id),
  }))
})

/** 必填且确实没接的端口 —— 这些不解决，节点跑不起来 */
const blockingPorts = computed(() =>
  portRows.value.filter(r => r.checkable && !r.connected && r.port.required === true),
)

function onShowChange(show: boolean): void {
  if (!show) {
    emit('close')
  }
}

function onAfterLeave(): void {
  emit('afterLeave')
}
</script>

<template>
  <NModal
    :show="props.open"
    preset="card"
    :style="{ width: '720px', maxWidth: '92vw' }"
    :mask-closable="true"
    :bordered="false"
    @update:show="onShowChange"
    @after-leave="onAfterLeave"
  >
    <template #header>
      <div class="modal-header">
        <span class="modal-icon">{{ props.definition?.icon ?? '◻' }}</span>
        <div class="modal-heading">
          <div class="modal-title">
            {{ props.definition?.label ?? '未知节点' }}
          </div>
          <div v-if="props.definition?.description" class="modal-desc">
            {{ props.definition.description }}
          </div>
        </div>
      </div>
    </template>

    <div class="modal-body">
      <!-- 运行态：跑过才有内容，没跑过整块不出现 -->
      <div v-if="props.runState?.status" class="run-strip" :data-status="props.runState!.status">
        <span class="run-status">{{ runStatusText }}</span>
        <span v-if="props.runState?.progress !== undefined" class="run-progress">
          {{ Math.round(props.runState?.progress) }}%
        </span>
        <span v-if="props.runState?.reused" class="run-reused">⚡ 复用缓存</span>
      </div>
      <div v-if="props.runState?.error" class="run-error">
        <code>{{ props.runState!.error!.code }}</code>
        {{ props.runState!.error!.message }}
      </div>

      <!-- 输入端口：把「为什么跑不起来」顶到最前面 -->
      <div v-if="portRows.length > 0" class="ports">
        <div class="section-caption">
          输入
        </div>
        <div class="port-list">
          <span
            v-for="row in portRows"
            :key="row.port.id"
            class="port-chip"
            :class="{
              'port-chip--ok': row.checkable && row.connected,
              'port-chip--missing': row.checkable && !row.connected,
              'port-chip--required': row.port.required === true,
            }"
          >
            <span class="port-dot" />
            {{ row.port.label }}
            <span v-if="row.port.required === true" class="port-flag">必填</span>
            <span v-if="row.checkable" class="port-state">
              {{ row.connected ? '已连接' : '未连接' }}
            </span>
          </span>
        </div>
        <p v-if="blockingPorts.length > 0" class="port-warning">
          有 {{ blockingPorts.length }} 个必填输入还没连线，这个节点现在跑不了。
        </p>
      </div>

      <ParamForm
        v-if="props.definition"
        :schema="props.definition.params"
        :params="props.params"
        :presets="props.definition.presets"
        :form-columns="props.definition.formColumns"
        @update:param="(k, v) => emit('update:param', k, v)"
        @apply-preset="p => emit('applyPreset', p)"
      />
    </div>

    <template #footer>
      <div class="modal-footer">
        <span class="estimate">
          <template v-if="estimateText">
            预计 {{ estimateText }}
          </template>
          <template v-else>
            <!-- 没有定价信息时明说，而不是显示成 ¥0 让人以为是免费 -->
            该模型未提供价格预估
          </template>
        </span>
        <NButton size="small" @click="emit('close')">
          关闭
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
/* 字号一律走 tokens.css 的「阅读档」。
   这里刻意不用画布那套 9–11px 的密集排版 —— 弹窗是细读场景，不是扫视场景。 */

.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.modal-icon {
  font-size: var(--fs-icon);
  line-height: 1.2;
}

.modal-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.modal-title {
  font-size: var(--fs-title);
  font-weight: 600;
  line-height: var(--lh-tight);
}

.modal-desc {
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
  color: #a1a1aa;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 6px;
}

.run-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: var(--r-control);
  font-size: var(--fs-body);
  color: #d4d4d8;
}

.run-strip[data-status='running'] {
  border-color: #6366f1;
}

.run-strip[data-status='failed'] {
  border-color: #ef4444;
}

.run-progress {
  color: #a5b4fc;
}

.run-reused {
  color: #a78bfa;
}

.run-error {
  padding: 9px 12px;
  background: #3b1215;
  border: 1px solid #7f1d1d;
  border-radius: var(--r-control);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: #fca5a5;
}

.run-error code {
  font-family: var(--font-mono);
  font-size: var(--fs-hint);
  margin-right: 6px;
}

.section-caption {
  margin-bottom: 8px;
  font-size: var(--fs-caption);
  color: #8b8b94;
  font-weight: 500;
}

.port-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.port-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: #1c1c20;
  border: 1px solid #3f3f46;
  border-radius: var(--r-chip);
  font-size: var(--fs-body);
  color: #d4d4d8;
}

.port-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #52525b;
  flex-shrink: 0;
}

.port-chip--ok .port-dot {
  background: #10b981;
}

.port-chip--missing .port-dot {
  background: #ef4444;
}

.port-flag {
  padding: 1px 5px;
  border-radius: 4px;
  background: #3f3f46;
  color: #d4d4d8;
  font-size: var(--fs-micro);
}

.port-state {
  color: #8b8b94;
  font-size: var(--fs-meta);
}

.port-warning {
  margin: 10px 0 0;
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
  color: #fbbf24;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.estimate {
  font-size: var(--fs-body);
  color: #a1a1aa;
}
</style>
