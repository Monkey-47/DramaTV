<script setup lang="ts">
/**
 * 标签输入。回车 / 逗号成词，退格删最后一个，点 ✕ 删指定项。
 *
 * 值统一按 `string[]` 处理，但用 `splitTags` 兼容字符串来源 ——
 * 当前负面提示词在 schema 里是逗号分隔的 textarea，直接切类型会崩。
 */
import { NInput } from 'naive-ui'
import { computed, ref } from 'vue'
import { splitTags } from './param-helpers'

const props = defineProps<{
  value: unknown
  placeholder?: string | undefined
}>()

const emit = defineEmits<{
  'update:value': [value: string[]]
}>()

const tags = computed(() => splitTags(props.value))
const draft = ref('')

function add(raw: string): void {
  const parts = splitTags(raw)
  const existing = new Set(tags.value)
  const merged = [...tags.value]
  for (const part of parts) {
    if (!existing.has(part)) {
      existing.add(part)
      merged.push(part)
    }
  }
  draft.value = ''
  if (merged.length !== tags.value.length) {
    emit('update:value', merged)
  }
}

function removeAt(index: number): void {
  const next = [...tags.value]
  next.splice(index, 1)
  emit('update:value', next)
}

function removeLast(): void {
  if (tags.value.length === 0) {
    return
  }
  emit('update:value', tags.value.slice(0, -1))
}

/** 输入框里出现逗号就立即成词，用户不用记得按回车 */
function onInput(raw: string): void {
  if (/[,，]/.test(raw)) {
    add(raw)
    return
  }
  draft.value = raw
}

function onEnter(): void {
  if (draft.value.trim() !== '') {
    add(draft.value)
  }
}

function onBackspace(): void {
  if (draft.value === '') {
    removeLast()
  }
}
</script>

<template>
  <div class="tags-field">
    <span v-for="(tag, index) in tags" :key="tag" class="tag">
      <span class="tag-text">{{ tag }}</span>
      <button
        class="tag-remove"
        type="button"
        :title="`移除「${tag}」`"
        @click="removeAt(index)"
      >
        ✕
      </button>
    </span>

    <NInput
      class="tag-input"
      size="small"
      :value="draft"
      :placeholder="tags.length === 0 ? (placeholder ?? '输入后按回车添加') : ''"
      @update:value="onInput"
      @keydown.enter.prevent="onEnter"
      @keydown.backspace="onBackspace"
    />
  </div>
</template>

<style scoped>
.tags-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 5px 7px;
  background: #1c1c20;
  border: 1px solid #3f3f46;
  /* 它视觉上就是一个输入框，所以和 NInput 用同一档圆角 */
  border-radius: var(--r-control);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px 3px 8px;
  background: #2e2e32;
  border-radius: var(--r-chip);
  /* 标签内容是用户填的数据，和输入框里的文字同一档 */
  font-size: var(--fs-body);
  color: #d4d4d8;
}

.tag-remove {
  padding: 0 2px;
  background: transparent;
  border: none;
  color: var(--fg-hint);
  font-size: var(--fs-meta);
  line-height: 1;
  cursor: pointer;
}

.tag-remove:hover {
  color: #ef4444;
}

.tag-input {
  flex: 1;
  min-width: 120px;
}

.tag-input :deep(.n-input-wrapper) {
  padding-left: 0;
  padding-right: 0;
}

.tag-input :deep(.n-input__border),
.tag-input :deep(.n-input__state-border) {
  display: none;
}
</style>
