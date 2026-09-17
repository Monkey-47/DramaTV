<script setup lang="ts">
/**
 * 单个参数字段的控件分发。
 *
 * 抽出来有两个原因：
 * 1. ParamForm 里基本区和高级区要渲染同一批控件，不抽的话模板要写两遍。
 * 2. 类型窄化、以及 naive-ui 的 prop 类型冲突，全部收口在这一个文件里。
 *
 * **关于 `exactOptionalPropertyTypes`**：tsconfig 开了这个选项后，
 * `{ min: number | undefined }` 不能赋给 `{ min?: number }`，所以
 * 直接用 `:min="field.min"` 会编译失败。这里的做法是用条件展开构造
 * 「只含已定义键」的对象再 v-bind —— 既不丢类型，也不用 `as any` 蒙混。
 */
import type { VNodeChild } from 'vue'
import type { ParamField } from '../nodes.types'
import {
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSlider,
  NSwitch,
} from 'naive-ui'
import { computed, h } from 'vue'
import AspectPicker from './AspectPicker.vue'
import SeedField from './SeedField.vue'
import TagsField from './TagsField.vue'

const props = defineProps<{
  field: ParamField
  value: unknown
}>()

const emit = defineEmits<{
  'update:value': [value: unknown]
}>()

const strValue = computed(() => (typeof props.value === 'string' ? props.value : ''))
const numValue = computed(() =>
  typeof props.value === 'number' && Number.isFinite(props.value) ? props.value : null,
)
const boolValue = computed(() => props.value === true)

/** NSelect 只接受 string | number，unknown 要窄化后才能绑 */
const selectValue = computed<string | number | null>(() => {
  const v = props.value
  return typeof v === 'string' || typeof v === 'number' ? v : null
})

const radioValue = computed<string | number | boolean | null>(() => {
  const v = props.value
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null
})

/**
 * 只保留 { label, value }：把 ParamOption 的 hint 带进 naive-ui 的
 * SelectMixedOption 联合类型会编译失败，所以 hint 改由 renderOptionLabel
 * 从 field.options 里按 value 反查。
 */
const selectOptions = computed(() =>
  (props.field.options ?? []).map(o => ({ label: o.label, value: o.value })),
)

/** 条件展开：键不存在时完全不出现，而不是出现且为 undefined */
const numericBounds = computed(() => ({
  ...(props.field.min !== undefined ? { min: props.field.min } : {}),
  ...(props.field.max !== undefined ? { max: props.field.max } : {}),
  ...(props.field.step !== undefined ? { step: props.field.step } : {}),
}))

const textareaAutosize = computed(() => ({
  minRows: props.field.rows ?? 3,
  maxRows: 12,
}))

function set(v: unknown): void {
  emit('update:value', v)
}

/** 选项名（如 DPM++ 3M SDE）对人没有信息量，把说明画在标签下方 */
function renderOptionLabel(option: { label?: string, value?: string | number }): VNodeChild {
  const hint = props.field.options?.find(o => o.value === option.value)?.hint
  if (hint === undefined) {
    return option.label ?? ''
  }
  return h('div', { class: 'opt' }, [
    h('div', { class: 'opt-label' }, option.label ?? ''),
    h('div', { class: 'opt-hint' }, hint),
  ])
}
</script>

<template>
  <NInput
    v-if="field.type === 'text'"
    :value="strValue"
    :placeholder="field.placeholder ?? ''"
    size="small"
    @update:value="set"
  />

  <NInput
    v-else-if="field.type === 'textarea'"
    type="textarea"
    :value="strValue"
    :placeholder="field.placeholder ?? ''"
    :autosize="textareaAutosize"
    @update:value="set"
  />

  <NInputNumber
    v-else-if="field.type === 'number'"
    v-bind="numericBounds"
    class="full"
    size="small"
    :value="numValue"
    @update:value="v => set(v)"
  />

  <div v-else-if="field.type === 'slider'" class="slider-row">
    <NSlider
      class="slider"
      :value="numValue ?? field.min ?? 0"
      :min="field.min ?? 0"
      :max="field.max ?? 100"
      :step="field.step ?? 1"
      :tooltip="false"
      @update:value="set"
    />
    <!-- 只有滑块没有数字，精确调参就没法做 -->
    <NInputNumber
      v-bind="numericBounds"
      class="slider-readout"
      size="small"
      :value="numValue"
      :show-button="false"
      @update:value="v => set(v)"
    />
  </div>

  <NSelect
    v-else-if="field.type === 'select'"
    :value="selectValue"
    :options="selectOptions"
    :render-label="renderOptionLabel"
    size="small"
    @update:value="set"
  />

  <NRadioGroup
    v-else-if="field.type === 'segmented'"
    :value="radioValue"
    size="small"
    @update:value="set"
  >
    <NRadioButton
      v-for="option in selectOptions"
      :key="String(option.value)"
      :value="option.value"
    >
      {{ option.label }}
    </NRadioButton>
  </NRadioGroup>

  <NSwitch
    v-else-if="field.type === 'switch'"
    :value="boolValue"
    size="small"
    @update:value="set"
  />

  <SeedField
    v-else-if="field.type === 'seed'"
    :value="numValue ?? undefined"
    @update:value="set"
  />

  <AspectPicker
    v-else-if="field.type === 'aspect'"
    :value="strValue"
    :options="field.options ?? []"
    @update:value="set"
  />

  <TagsField
    v-else-if="field.type === 'tags'"
    :value="value"
    :placeholder="field.placeholder"
    @update:value="set"
  />
</template>

<style scoped>
.full {
  width: 100%;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider {
  flex: 1;
  min-width: 0;
}

.slider-readout {
  width: 76px;
  flex-shrink: 0;
}
</style>

<style>
/* 非 scoped：naive-ui 的浮层挂在 body 上 */
.opt {
  display: flex;
  flex-direction: column;
  /* 1 → 2px：两行字号都变大后，1px 的行间距会让说明贴在标题上 */
  gap: 2px;
  padding: 3px 0;
}

.opt-label {
  font-size: var(--fs-body);
  line-height: 1.3;
}

/* 选项说明：「DPM++ 3M SDE」这类名字本身没有信息量，全靠这行 */
.opt-hint {
  font-size: var(--fs-meta);
  line-height: 1.35;
  color: var(--fg-hint);
}
</style>
