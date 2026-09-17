<script setup lang="ts">
/**
 * 节点右键菜单的渲染层。
 *
 * 只管画和收输入，不管「该显示哪些项」—— 那是 node-menu.ts 的纯函数职责。
 * 这样菜单内容可以单测，而这一层只剩定位和关闭时机。
 *
 * 定位要点：菜单必须**夹在视口内**。在画布右边缘或底部右键时，
 * 菜单按点击点展开会有一半跑到屏幕外，用户看不到也点不着。
 */
import type { MenuSection } from './node-menu'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  sections: MenuSection[]
  /** 视口坐标（clientX / clientY），不是画布坐标 */
  x: number
  y: number
}>()

const emit = defineEmits<{
  select: [key: string]
  close: []
}>()

/** 与视口边缘至少留这么多，避免菜单贴边 */
const EDGE_MARGIN = 8

const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })

/**
 * 先按点击点摆，量出真实尺寸后再夹进视口。
 *
 * 必须分两步：菜单高度取决于项数，摆之前不知道，所以没法一次算准。
 *
 * 尺寸用 offsetWidth / offsetHeight 而**不是** getBoundingClientRect：
 * 入场动画带着 `transform: scale(0.96)`，而 getBoundingClientRect 返回的是
 * 变换后的盒子 —— 实测量到 192 而不是 200，夹取结果就少算 8px 边距，
 * 菜单会正好贴在视口边上。offset* 是布局值，不受 transform 影响。
 */
async function reposition(): Promise<void> {
  pos.value = { x: props.x, y: props.y }
  await nextTick()
  const node = el.value
  if (node === null)
    return

  const maxX = window.innerWidth - node.offsetWidth - EDGE_MARGIN
  const maxY = window.innerHeight - node.offsetHeight - EDGE_MARGIN

  pos.value = {
    // Math.max 兜底：菜单比视口还高时至少露出左上角，而不是被推到负坐标
    x: Math.max(EDGE_MARGIN, Math.min(props.x, maxX)),
    y: Math.max(EDGE_MARGIN, Math.min(props.y, maxY)),
  }
}

watch(
  () => [props.open, props.x, props.y] as const,
  () => {
    if (props.open)
      void reposition()
  },
  { immediate: true },
)

function onPick(key: string, disabled: boolean | undefined): void {
  if (disabled === true)
    return
  emit('select', key)
  emit('close')
}

// ── 关闭时机 ──────────────────────────────────────────────────────────────
// 三种都要：Esc 是键盘习惯，点外面是最常见的取消方式，
// 滚动会让菜单和它指向的节点错位，所以滚了就关而不是跟着飘。

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) {
    e.stopPropagation()
    emit('close')
  }
}

function onPointerDown(e: PointerEvent): void {
  if (!props.open)
    return
  const target = e.target as Node | null
  if (target !== null && el.value !== null && !el.value.contains(target))
    emit('close')
}

function onScroll(): void {
  if (props.open)
    emit('close')
}

onMounted(() => {
  // 捕获阶段：画布内部可能 stopPropagation，冒泡阶段会漏掉
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ctx">
      <div
        v-if="open"
        ref="el"
        class="ctx-menu"
        role="menu"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      >
        <template v-for="(section, si) in sections" :key="si">
          <div v-if="si > 0" class="ctx-divider" />
          <div v-if="section.title" class="ctx-title">
            {{ section.title }}
          </div>
          <button
            v-for="item in section.items"
            :key="item.key"
            class="ctx-item"
            :class="{ 'ctx-item--danger': item.danger === true, 'ctx-item--disabled': item.disabled === true }"
            type="button"
            role="menuitem"
            :disabled="item.disabled === true"
            :title="item.disabledReason"
            @click="onPick(item.key, item.disabled)"
          >
            <span class="ctx-icon">{{ item.icon ?? '' }}</span>
            <span class="ctx-label">
              {{ item.label }}
              <span v-if="item.disabled === true && item.disabledReason" class="ctx-reason">
                {{ item.disabledReason }}
              </span>
            </span>
            <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 字号用「阅读档」而不是画布的密集档：菜单是逐项读标签再选的界面，
   和节点卡片那种扫视场景不是一回事。见 tokens.css 头部说明。 */
.ctx-menu {
  position: fixed;
  z-index: 200;
  min-width: 200px;
  max-width: 300px;
  padding: 5px;
  background: #1f1f24;
  border: 1px solid #3f3f46;
  border-radius: var(--r-control);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  font-family: var(--font-ui);
  user-select: none;
}

.ctx-divider {
  height: 1px;
  margin: 5px 4px;
  background: #2e2e32;
}

.ctx-title {
  padding: 5px 9px 3px;
  font-size: var(--fs-meta);
  color: var(--fg-hint);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  background: transparent;
  border: none;
  border-radius: var(--r-chip);
  color: #e4e4e7;
  font: inherit;
  font-size: var(--fs-body);
  text-align: left;
  cursor: pointer;
}

.ctx-item:hover:not(.ctx-item--disabled) {
  background: #2e2e32;
}

.ctx-item--danger {
  color: #ef4444;
}

.ctx-item--danger:hover:not(.ctx-item--disabled) {
  background: rgba(239, 68, 68, 0.14);
}

.ctx-item--disabled {
  color: #52525b;
  cursor: not-allowed;
}

.ctx-icon {
  width: 16px;
  flex-shrink: 0;
  font-size: var(--fs-meta);
  text-align: center;
}

.ctx-label {
  flex: 1;
  min-width: 0;
}

.ctx-reason {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-meta);
  line-height: var(--lh-tight);
  color: var(--fg-hint);
}

.ctx-shortcut {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  color: var(--fg-hint);
}

/* ── 出入场 ──────────────────────────────────────────────────────────────
   从左上角（即鼠标点）轻微放大弹出，符合「从指针位置长出来」的直觉。
   右键菜单必须快 —— 它是高频操作，动画超过 150ms 就会显得拖。 */
.ctx-enter-active {
  transition:
    opacity 0.1s ease-out,
    transform 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

.ctx-leave-active {
  transition:
    opacity 0.09s ease-in,
    transform 0.09s ease-in;
}

.ctx-enter-from,
.ctx-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

.ctx-enter-from {
  transform-origin: top left;
}

@media (prefers-reduced-motion: reduce) {
  .ctx-enter-active,
  .ctx-leave-active {
    transition: none;
  }
}
</style>
