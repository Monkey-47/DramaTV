<script setup lang="ts">
/**
 * 画面比例选择器。
 *
 * 不渲染 "832x1216" 这种字符串下拉 —— 用户读不出 2:3 和 3:4 的差别。
 * 直接按比例画方块：竖的窄高、横的扁宽，一眼可比。
 */
import type { ParamOption } from '../nodes.types'
import { computed } from 'vue'
import { aspectBoxSize, parseAspect } from './param-helpers'

const props = defineProps<{
  value: string | undefined
  options: readonly ParamOption[]
}>()

const emit = defineEmits<{
  'update:value': [value: string]
}>()

/** 所有方块共用这个外框，比例才具备可比性 */
const BOX_W = 38
const BOX_H = 30

const items = computed(() => props.options.map((option) => {
  const size = aspectBoxSize(option.value, BOX_W, BOX_H)
  const parsed = parseAspect(option.value)
  return {
    option,
    width: size?.width ?? BOX_W,
    height: size?.height ?? BOX_H,
    resolution: parsed === null ? String(option.value) : `${parsed.width}×${parsed.height}`,
  }
}))
</script>

<template>
  <div class="aspect-row">
    <button
      v-for="item in items"
      :key="String(item.option.value)"
      type="button"
      class="aspect-cell"
      :class="{ selected: item.option.value === value }"
      :title="item.resolution"
      @click="emit('update:value', String(item.option.value))"
    >
      <span class="aspect-frame">
        <span
          class="aspect-box"
          :style="{ width: `${item.width}px`, height: `${item.height}px` }"
        />
      </span>
      <span class="aspect-label">{{ item.option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.aspect-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.aspect-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: #1c1c20;
  border: 1px solid #3f3f46;
  /* 选中态的描边就是这个 border，所以圆角设在这里，高亮会跟着一起圆 */
  border-radius: var(--r-chip);
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s;
}

.aspect-cell:hover {
  background: #26262a;
  border-color: #52525b;
}

.aspect-cell.selected {
  background: rgba(99, 102, 241, 0.16);
  border-color: #6366f1;
}

.aspect-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 30px;
}

/* 2px 是刻意的例外：方块是「比例图示」，不是界面 chrome。
   圆角一大就会改变方块的视觉比例，读者就看不出 9:16 和 3:4 的差别了。 */
.aspect-box {
  background: #52525b;
  border-radius: 2px;
  transition: background 0.12s;
}

.aspect-cell.selected .aspect-box {
  background: #818cf8;
}

.aspect-label {
  font-size: var(--fs-hint);
  line-height: 1.2;
  color: #a1a1aa;
}

.aspect-cell.selected .aspect-label {
  color: #c7d2fe;
}
</style>
