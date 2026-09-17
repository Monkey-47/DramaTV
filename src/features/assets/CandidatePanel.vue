<script setup lang="ts">
/**
 * 候选面板 —— 设计文档 §3.2 的核心闭环，ui-design-spec §2.3 布局。
 *
 * 用户在这里「跑 → 挑 → 冻结」，然后才敢往下走。
 * 没有这一层，用户永远不敢跑下一个节点，因为下一次重跑会把满意的结果冲掉。
 *
 * 纯展示 + emit，不认识 store —— 由 view 把 runner store 的候选和
 * project store 的 adopted 绑进来。
 */
import type { AssetRef } from '@/features/runner/runner.types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  nodeLabel: string
  candidates: AssetRef[]
  adoptedId?: string | undefined
  frozen?: boolean | undefined
  /** 该节点正在跑，候选还没出来 */
  busy?: boolean | undefined
  /** 本轮是复用缓存产出（设计文档 §4.3 要求与真跑可区分） */
  reused?: boolean | undefined
  /** 工作流名，显示在标题栏 */
  workflowName?: string | undefined
}>()

const emit = defineEmits<{
  adopt: [assetId: string]
  freeze: []
  unfreeze: []
  close: []
  /** 在面板里直接跑这一个节点（RunScope { kind: 'node' }） */
  run: []
  /**
   * 离场动画播完。父组件靠它决定何时清空 nodeLabel / candidates ——
   * 早清会让面板内容当场卸载、高度先塌，动画就作用在一个塌掉的盒子上。
   */
  afterLeave: []
}>()

/** 加载失败的候选 —— 真实产出也会挂掉，不该显示成碎图 */
const failedIds = ref<Set<string>>(new Set())

watch(() => props.candidates, () => {
  failedIds.value = new Set()
})

function onImageError(assetId: string): void {
  const next = new Set(failedIds.value)
  next.add(assetId)
  failedIds.value = next
}

function isImage(candidate: AssetRef): boolean {
  return candidate.mime.startsWith('image/')
}

function shouldShowImage(candidate: AssetRef): boolean {
  return isImage(candidate) && !failedIds.value.has(candidate.assetId)
}

/**
 * 图片加载不出来时的兜底底色。
 *
 * mock 的候选 URL 指向不存在的 CDN，真实产出也可能加载失败。
 * 用一个由 assetId 决定的稳定渐变色占位，至少让多张候选彼此可区分，
 * 而不是一片碎图图标。
 */
function placeholderStyle(assetId: string): Record<string, string> {
  let hash = 0
  for (let i = 0; i < assetId.length; i += 1) {
    hash = (hash * 31 + assetId.charCodeAt(i)) % 360
  }
  return {
    background: `linear-gradient(135deg, hsl(${hash} 45% 22%), hsl(${(hash + 60) % 360} 40% 14%))`,
  }
}

const hasCandidates = computed(() => props.candidates.length > 0)
const adoptedIndex = computed(() =>
  props.candidates.findIndex(c => c.assetId === props.adoptedId),
)

const canFreeze = computed(() => props.adoptedId !== undefined && props.frozen !== true)
const canUnfreeze = computed(() => props.frozen === true)

// ── 键盘与点击外部 ────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <!--
      必须走 <Transition> 而不是裸 v-if：裸 v-if 是瞬时的，
      面板会「啪」地出现和消失，没有任何过渡。
    -->
    <Transition name="candidate" @after-leave="emit('afterLeave')">
      <div
        v-if="open"
        class="candidate-backdrop"
        @click.self="emit('close')"
      >
        <section
          class="candidate-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="`${nodeLabel} 的候选产出`"
        >
          <!-- 标题栏 -->
          <header class="panel-header">
            <div class="panel-title">
              <span class="panel-node-label">{{ nodeLabel }}</span>
              <span v-if="workflowName" class="panel-workflow">工作流「{{ workflowName }}」</span>
            </div>

            <div class="panel-header-badges">
              <span v-if="reused" class="badge badge-reused">⚡ 复用缓存</span>
              <span v-if="frozen" class="badge badge-frozen">🔒 已冻结</span>
            </div>

            <button class="panel-close" type="button" title="关闭（Esc）" @click="emit('close')">
              ×
            </button>
          </header>

          <!-- 上半区：候选图墙 -->
          <div class="panel-candidates">
            <div v-if="busy && !hasCandidates" class="state-block">
              <span class="spinner" />
              <p>正在生成候选…</p>
            </div>

            <div v-else-if="!hasCandidates" class="state-block">
              <p class="state-title">
                还没有产出
              </p>
              <p class="state-hint">
                点下面的「运行」出一批候选
              </p>
            </div>

            <ul v-else class="candidate-grid">
              <li
                v-for="(candidate, index) in candidates"
                :key="candidate.assetId"
                class="candidate-tile"
                :class="{ 'is-adopted': candidate.assetId === adoptedId }"
                :style="placeholderStyle(candidate.assetId)"
                :title="candidate.assetId"
                @click="emit('adopt', candidate.assetId)"
              >
                <img
                  v-if="shouldShowImage(candidate)"
                  class="candidate-image"
                  :src="candidate.url"
                  :alt="`候选 ${index + 1}`"
                  loading="lazy"
                  @error="onImageError(candidate.assetId)"
                >
                <div v-else class="candidate-fallback">
                  <span class="fallback-icon">{{ isImage(candidate) ? '🖼' : '🎞' }}</span>
                  <span class="fallback-index">候选 {{ index + 1 }}</span>
                </div>

                <span class="tile-index">{{ index + 1 }}</span>
                <span v-if="candidate.assetId === adoptedId" class="tile-check">✓</span>
              </li>
            </ul>
          </div>

          <!-- 下半区：参数表单（由外部注入，本组件不认识具体参数） -->
          <div class="panel-params">
            <slot name="params" />
          </div>

          <!-- 操作栏 -->
          <footer class="panel-actions">
            <div class="actions-left">
              <button class="btn btn-primary" type="button" :disabled="busy" @click="emit('run')">
                {{ busy ? '运行中…' : '▶ 运行' }}
              </button>
              <span v-if="props.adoptedId" class="adopted-hint">
                已采用第 {{ adoptedIndex >= 0 ? adoptedIndex + 1 : '—' }} 张
              </span>
              <span v-else-if="hasCandidates" class="adopted-hint muted">
                点候选图选择要采用的那张
              </span>
            </div>

            <div class="actions-right">
              <button
                v-if="canUnfreeze"
                class="btn btn-secondary"
                type="button"
                @click="emit('unfreeze')"
              >
                🔓 解冻
              </button>
              <button
                v-else
                class="btn btn-secondary"
                type="button"
                :disabled="!canFreeze"
                :title="canFreeze ? '锁定这张产出，之后重跑不覆盖' : '先选一张候选再冻结'"
                @click="emit('freeze')"
              >
                🔒 冻结已选
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.candidate-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

/* ── 出入场 ──────────────────────────────────────────────────────────────
   遮罩淡入淡出，面板从略小 + 略低的位置缩放弹上来。
   缩放中心在面板自身中心（默认 transform-origin），所以视觉上是「展开/收起」
   而不是从某个角抽走。
   离场比入场快一点：关闭是用户已经决定的事，动画拖久了会显得卡。 */
.candidate-enter-active {
  transition: opacity 0.18s ease-out;
}

.candidate-leave-active {
  transition: opacity 0.15s ease-in;
}

.candidate-enter-active .candidate-panel {
  transition:
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease-out;
}

.candidate-leave-active .candidate-panel {
  transition:
    transform 0.18s cubic-bezier(0.4, 0, 1, 1),
    opacity 0.15s ease-in;
}

.candidate-enter-from,
.candidate-leave-to {
  opacity: 0;
}

.candidate-enter-from .candidate-panel,
.candidate-leave-to .candidate-panel {
  opacity: 0;
  transform: scale(0.94) translateY(10px);
}

/* 尊重系统的「减少动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
  .candidate-enter-active,
  .candidate-leave-active,
  .candidate-enter-active .candidate-panel,
  .candidate-leave-active .candidate-panel {
    transition: none;
  }
}

.candidate-panel {
  display: flex;
  flex-direction: column;
  width: 800px;
  height: 500px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  background: #1f1f24;
  border: 1px solid #3f3f46;
  border-radius: var(--r-panel);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  font-family: var(--font-ui);
  color: #e4e4e7;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #2e2e32;
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.panel-node-label {
  font-size: var(--fs-body);
  font-weight: 600;
}

.panel-workflow {
  font-size: var(--fs-meta);
  color: var(--fg-hint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-header-badges {
  display: flex;
  gap: 6px;
}

.badge {
  padding: 3px 8px;
  border-radius: var(--r-chip);
  font-size: var(--fs-meta);
  line-height: 1.4;
}

.badge-reused {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}

.badge-frozen {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.panel-close {
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--r-chip);
  color: var(--fg-hint);
  font-size: var(--fs-icon);
  line-height: 1;
  cursor: pointer;
}

.panel-close:hover {
  background: #26262a;
  color: #e4e4e7;
}

.panel-candidates {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.candidate-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.candidate-tile {
  position: relative;
  height: 220px;
  border: 2px solid #3f3f46;
  border-radius: var(--r-card);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.12s,
    transform 0.12s;
}

.candidate-tile:hover {
  border-color: #52525b;
  transform: translateY(-1px);
}

.candidate-tile.is-adopted {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}

.candidate-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.candidate-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  color: #a1a1aa;
}

.fallback-icon {
  font-size: var(--fs-icon);
}

.fallback-index {
  font-size: var(--fs-meta);
}

.tile-index {
  position: absolute;
  top: 6px;
  left: 6px;
  min-width: 17px;
  padding: 2px 6px;
  border-radius: var(--r-chip);
  background: rgba(0, 0, 0, 0.6);
  color: #d4d4d8;
  font-size: var(--fs-meta);
  text-align: center;
}

.tile-check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border-radius: var(--r-pill);
  background: #6366f1;
  color: #fff;
  font-size: var(--fs-meta);
  font-weight: 700;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--fg-hint);
  font-size: var(--fs-body);
}

.state-title {
  margin: 0;
  color: #a1a1aa;
}

.state-hint {
  margin: 0;
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #3f3f46;
  border-top-color: #6366f1;
  border-radius: var(--r-pill);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.panel-params {
  flex-shrink: 0;
  max-height: 40%;
  overflow-y: auto;
  border-top: 1px solid #2e2e32;
}

.panel-params:empty {
  display: none;
}

.panel-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid #2e2e32;
  background: #1c1c20;
  flex-shrink: 0;
}

.actions-left,
.actions-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.adopted-hint {
  font-size: var(--fs-hint);
  color: #a1a1aa;
}

.adopted-hint.muted {
  color: var(--fg-hint);
}

.btn {
  padding: 7px 16px;
  border-radius: var(--r-control);
  font-size: var(--fs-body);
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background: #6366f1;
  border-color: #6366f1;
  color: #fff;
  font-weight: 600;
}

.btn-primary:not(:disabled):hover {
  background: #5558e3;
}

.btn-secondary {
  background: #26262a;
  border-color: #3f3f46;
  color: #d4d4d8;
}

.btn-secondary:not(:disabled):hover {
  background: #2e2e32;
}
</style>
