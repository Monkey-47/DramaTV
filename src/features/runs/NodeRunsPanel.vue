<script setup lang="ts">
/**
 * 单个节点的运行历史。
 *
 * 「查看历史运行」和「查看错误日志」共用这一个面板 —— 错误本来就是
 * 某一次运行的属性，分成两个面板会让用户在两处找同一件事。
 * 有失败记录时，失败那条自动展开并把错误码和信息摆在最上面。
 *
 * 数据来自 runner store 的**当前会话**（`runs`）。设计文档 §4.5 的
 * `GET /workflows/:id/runs` 会给出完整历史，但后端还没实现；这里先把
 * 已经真实存在的那部分（本次会话跑过的）如实呈现，而不是造一份假历史。
 */
import { NModal } from 'naive-ui'
import { computed } from 'vue'

export interface NodeRunEntry {
  runId: string
  /** 运行级状态 */
  runStatus: string
  /** 作用域的文字描述 */
  scopeText: string
  /** 该节点在这轮里的状态 */
  nodeStatus: string
  reused: boolean
  progress?: number
  candidateCount: number
  error?: { code: string, message: string, retryable: boolean }
  startedAt?: number
  finishedAt?: number
}

const props = defineProps<{
  open: boolean
  nodeLabel: string
  entries: readonly NodeRunEntry[]
}>()

const emit = defineEmits<{
  close: []
  afterLeave: []
}>()

const STATUS_TEXT: Record<string, string> = {
  pending: '等待上游',
  queued: '排队中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  skipped: '已跳过',
  cancelled: '已取消',
  partial: '部分失败',
}

function statusText(s: string): string {
  return STATUS_TEXT[s] ?? s
}

/** 最近的排在最上面 —— 用户翻历史几乎总是想看刚才那次 */
const ordered = computed(() => [...props.entries].reverse())

const failures = computed(() => props.entries.filter(e => e.error !== undefined))

function durationText(e: NodeRunEntry): string {
  if (e.startedAt === undefined || e.finishedAt === undefined) {
    return '—'
  }
  const ms = e.finishedAt - e.startedAt
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function timeText(ts: number | undefined): string {
  if (ts === undefined) {
    return '—'
  }
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
</script>

<template>
  <NModal
    :show="props.open"
    preset="card"
    :style="{ width: '640px', maxWidth: '92vw' }"
    :bordered="false"
    @update:show="v => { if (!v) emit('close') }"
    @after-leave="emit('afterLeave')"
  >
    <template #header>
      <div class="panel-header">
        <span class="panel-title">{{ props.nodeLabel }} · 运行历史</span>
        <span class="panel-sub">本次会话共 {{ props.entries.length }} 次</span>
      </div>
    </template>

    <div class="panel-body">
      <!-- 有失败就把错误顶到最前面，用户点进来多半就是为了看它 -->
      <div v-if="failures.length > 0" class="failures">
        <div v-for="f in failures" :key="f.runId" class="failure">
          <div class="failure-head">
            <code class="failure-code">{{ f.error!.code }}</code>
            <span class="failure-retryable" :data-retryable="f.error!.retryable">
              {{ f.error!.retryable ? '可重试' : '不可重试' }}
            </span>
          </div>
          <p class="failure-msg">
            {{ f.error!.message }}
          </p>
          <p class="failure-hint">
            {{ f.error!.retryable
              ? '这类失败通常是网络抖动或限流，重试有意义。'
              : '生成类失败不会自动重试 —— 直接烧钱，所以要你确认。' }}
          </p>
        </div>
      </div>

      <div v-if="ordered.length === 0" class="empty">
        这个节点还没跑过。
      </div>

      <ul v-else class="run-list">
        <li v-for="e in ordered" :key="e.runId" class="run-row">
          <span class="run-status" :data-status="e.nodeStatus">
            {{ statusText(e.nodeStatus) }}
          </span>
          <span class="run-scope">{{ e.scopeText }}</span>
          <span v-if="e.reused" class="run-reused">⚡ 复用</span>
          <span v-if="e.candidateCount > 0" class="run-candidates">
            {{ e.candidateCount }} 候选
          </span>
          <span v-else-if="e.nodeStatus === 'running' && e.progress !== undefined" class="run-progress">
            {{ Math.round(e.progress) }}%
          </span>
          <span class="run-spacer" />
          <span class="run-time">{{ timeText(e.startedAt) }}</span>
          <span class="run-duration">{{ durationText(e) }}</span>
        </li>
      </ul>
    </div>
  </NModal>
</template>

<style scoped>
.panel-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.panel-title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.panel-sub {
  font-size: var(--fs-meta);
  color: var(--fg-hint);
}

.panel-body {
  max-height: 60vh;
  overflow-y: auto;
}

.failures {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.failure {
  padding: 10px 12px;
  background: #3b1215;
  border: 1px solid #7f1d1d;
  border-radius: var(--r-control);
}

.failure-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.failure-code {
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  color: #fca5a5;
}

.failure-retryable {
  padding: 1px 6px;
  border-radius: var(--r-chip);
  font-size: var(--fs-micro);
  background: #3f3f46;
  color: #d4d4d8;
}

.failure-retryable[data-retryable='true'] {
  background: rgba(16, 185, 129, 0.16);
  color: #6ee7b7;
}

.failure-msg {
  margin: 6px 0 0;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: #fecaca;
}

.failure-hint {
  margin: 4px 0 0;
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
  color: var(--fg-hint);
}

.empty {
  padding: 24px 0;
  text-align: center;
  font-size: var(--fs-body);
  color: var(--fg-hint);
}

.run-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.run-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #1c1c20;
  border: 1px solid #3f3f46;
  border-radius: var(--r-control);
  font-size: var(--fs-body);
}

.run-status {
  min-width: 56px;
  font-weight: 500;
}

.run-status[data-status='succeeded'] {
  color: #10b981;
}
.run-status[data-status='failed'] {
  color: #ef4444;
}
.run-status[data-status='running'] {
  color: #6366f1;
}
.run-status[data-status='skipped'],
.run-status[data-status='cancelled'] {
  color: #8b8b94;
}

.run-scope,
.run-time,
.run-duration {
  font-size: var(--fs-meta);
  color: var(--fg-hint);
}

.run-reused {
  font-size: var(--fs-meta);
  color: #a78bfa;
}

.run-candidates,
.run-progress {
  font-size: var(--fs-meta);
  color: #a1a1aa;
}

.run-spacer {
  flex: 1;
}
</style>
