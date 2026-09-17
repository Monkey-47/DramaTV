<script setup lang="ts">
/**
 * Schema 驱动的参数表单。
 *
 * 设计取向（这是整个「可配置」体验的落点）：
 * 1. **每个字段的 hint 直接铺在控件下面**，不塞 tooltip —— 新手最需要解释的
 *    时刻正是他还没意识到要悬停的时候。
 * 2. **默认只露 3–5 个关键参数**，其余收进「高级」折叠区（默认收起）。
 *    专业用户不受限，新手不劝退。
 * 3. **预设按钮置顶** —— 不懂 sampler / CFG 的人也能一键拿到调好的参数组合。
 */
import type { NodePreset, ParamField, ParamSchema } from './nodes.types'
import { NCollapse, NCollapseItem, NInputNumber, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { applyDefaults, partitionFields } from './fields/param-helpers'
import ParamControl from './fields/ParamControl.vue'

const props = defineProps<{
  schema: ParamSchema
  params: Record<string, unknown>
  presets?: readonly NodePreset[] | undefined
  /** 栅格列数，由节点定义声明（默认 3） */
  formColumns?: 2 | 3 | undefined
}>()

// 注：事件名用 camelCase 是 antfu 的 vue/custom-event-name-casing 要求的。
// 父组件照旧写 `@apply-preset` —— Vue 会把模板里的 kebab-case 归一成
// onApplyPreset，所以对外用法完全不变。
const emit = defineEmits<{
  'update:param': [key: string, value: unknown]
  'applyPreset': [preset: NodePreset]
}>()

/**
 * 表单显示用的参数 = 用户已设的值 + schema 声明的默认值。
 * 节点刚拖出来时 `data` 是空的，但用户要看到「不填会是什么效果」。
 */
const merged = computed(() => applyDefaults(props.schema, props.params))

const groups = computed(() => partitionFields(props.schema, merged.value))

const hasPresets = computed(() => (props.presets?.length ?? 0) > 0)

const advancedTitle = computed(() => `高级（${groups.value.advanced.length} 项）`)

function spanStyle(field: ParamField): Record<string, string> {
  return { gridColumn: `span ${field.span ?? 1}` }
}

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.formColumns ?? 3}, minmax(0, 1fr))`,
}))

/**
 * 滑块的当前值，用来在标签行右端显示。
 *
 * 这个读数**必须可编辑**，不能只做展示 —— 滑块拖到 0.7 很容易，拖到 0.65
 * 就不行了，而温度、CFG 这类参数恰恰经常要精确到小数点后一位。
 * 所以标签行右端放的是个无按钮的窄数字输入框，不是徽标。
 */
function sliderValue(key: string): number | null {
  const v = merged.value[key]
  return typeof v === 'number' ? v : null
}

/**
 * 条件展开边界值。
 *
 * 不能直接 `:min="field.min"` —— tsconfig 开了 exactOptionalPropertyTypes，
 * 给可选属性显式传 undefined 会判为类型错误。这个写法在本文件之外
 * （ParamControl 的 numericBounds）已经用过。
 */
function sliderBounds(field: ParamField): Record<string, number> {
  return {
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(field.step !== undefined ? { step: field.step } : {}),
  }
}
</script>

<template>
  <div class="param-form">
    <div v-if="hasPresets" class="preset-row">
      <span class="preset-caption">预设</span>
      <NTooltip
        v-for="preset in presets"
        :key="preset.name"
        trigger="hover"
        :disabled="preset.hint === undefined"
      >
        <template #trigger>
          <button type="button" class="preset-btn" @click="emit('applyPreset', preset)">
            {{ preset.name }}
          </button>
        </template>
        {{ preset.hint }}
      </NTooltip>
    </div>

    <div class="grid" :style="gridStyle">
      <div
        v-for="field in groups.basic"
        :key="field.key"
        class="field"
        :style="spanStyle(field)"
      >
        <div class="field-head">
          <label class="field-label">{{ field.label }}</label>
          <NInputNumber
            v-if="field.type === 'slider'"
            v-bind="sliderBounds(field)"
            class="field-value"
            size="tiny"
            :show-button="false"
            :value="sliderValue(field.key)"
            @update:value="v => emit('update:param', field.key, v)"
          />
        </div>
        <ParamControl
          :field="field"
          :value="merged[field.key]"
          @update:value="v => emit('update:param', field.key, v)"
        />
        <p v-if="field.hint" class="field-hint">
          {{ field.hint }}
        </p>
      </div>
    </div>

    <NCollapse v-if="groups.advanced.length > 0" class="advanced">
      <NCollapseItem :title="advancedTitle" name="advanced">
        <div class="grid" :style="gridStyle">
          <div
            v-for="field in groups.advanced"
            :key="field.key"
            class="field"
            :style="spanStyle(field)"
          >
            <div class="field-head">
              <label class="field-label">{{ field.label }}</label>
              <NInputNumber
                v-if="field.type === 'slider'"
                v-bind="sliderBounds(field)"
                class="field-value"
                size="tiny"
                :show-button="false"
                :value="sliderValue(field.key)"
                @update:value="v => emit('update:param', field.key, v)"
              />
            </div>
            <ParamControl
              :field="field"
              :value="merged[field.key]"
              @update:value="v => emit('update:param', field.key, v)"
            />
            <p v-if="field.hint" class="field-hint">
              {{ field.hint }}
            </p>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>
  </div>
</template>

<style scoped>
.param-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2e2e32;
}

.preset-caption {
  margin-right: 2px;
  font-size: var(--fs-caption);
  color: var(--fg-hint);
}

.preset-btn {
  padding: 5px 11px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: var(--r-control);
  color: #d4d4d8;
  font-size: var(--fs-body);
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.preset-btn:hover {
  background: rgba(99, 102, 241, 0.16);
  border-color: #6366f1;
  color: #c7d2fe;
}

/* 列数由节点的 formColumns 决定，见 gridStyle */
.grid {
  display: grid;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  /* 5 → 6px：标签升到 13px 后，与控件的间距再压 5px 会显得挤 */
  gap: 6px;
  min-width: 0;
}

/* 标签行：标签在左，滑块的当前值在右。
   把读数提到这一行是为了让它和标题同一视觉层级 —— 数值是这一项的结果，
   贴在控件旁边会被滑块的长度带得来回漂。 */
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
}

.field-label {
  font-size: var(--fs-label);
  font-weight: 600;
  color: #d4d4d8;
  line-height: var(--lh-tight);
}

/* 窄到只够放 0.65 这种值，不做成通用输入框的样子 */
.field-value {
  width: 68px;
  flex-shrink: 0;
}

.field-value :deep(.n-input__input-el) {
  text-align: right;
}

/* 说明文字常驻显示，不进 tooltip —— 新手最需要它的时候不会去悬停。
   这一档必须是全表单里最舍得给字号的地方：它就是「易上手」本身。 */
.field-hint {
  margin: 0;
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
  color: var(--fg-hint);
}

.advanced {
  margin-top: 2px;
}

.advanced :deep(.n-collapse-item__header) {
  font-size: var(--fs-body);
  color: #a1a1aa;
}
</style>
