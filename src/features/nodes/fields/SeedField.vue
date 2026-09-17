<script setup lang="ts">
/**
 * 种子输入。
 *
 * 迭代调参时最常用的一个控件：先随机出几张看方向，锁定满意的种子后
 * 只改提示词微调构图。所以随机和锁定必须是并列的两个按钮，不能藏进菜单。
 *
 * `-1` 是「每次随机」的哨兵值，与后端约定一致。
 */
import { NButton, NInputNumber, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { isRandomSeed, RANDOM_SEED, randomSeed } from './param-helpers'

const props = defineProps<{
  value: number | undefined
}>()

const emit = defineEmits<{
  'update:value': [value: number]
}>()

const isRandom = computed(() => isRandomSeed(props.value))

const lockTitle = computed(() =>
  isRandom.value
    ? '当前每次运行都会换种子。点此锁一个固定值，方便复现'
    : '已锁定固定种子。点此改回每次随机',
)

/** 锁定时给一个具体值，解锁时回哨兵 */
function toggleLock(): void {
  emit('update:value', isRandom.value ? randomSeed() : RANDOM_SEED)
}

function reroll(): void {
  emit('update:value', randomSeed())
}

/** 手输一个数字等于锁定它 —— 这是用户的明确意图，不该再被随机覆盖 */
function onInput(next: number | null): void {
  if (typeof next === 'number' && Number.isFinite(next)) {
    emit('update:value', Math.trunc(next))
  }
}
</script>

<template>
  <div class="seed-field">
    <NInputNumber
      class="seed-input"
      size="small"
      :value="isRandom ? null : (value ?? null)"
      :placeholder="isRandom ? '每次随机' : ''"
      :show-button="false"
      :min="RANDOM_SEED"
      :max="2147483647"
      @update:value="onInput"
    />

    <NTooltip trigger="hover">
      <template #trigger>
        <NButton size="small" @click="reroll">
          🎲
        </NButton>
      </template>
      随机一个新种子（会同时锁定它）
    </NTooltip>

    <NTooltip trigger="hover">
      <template #trigger>
        <NButton
          size="small"
          :type="isRandom ? 'default' : 'primary'"
          :ghost="!isRandom"
          @click="toggleLock"
        >
          {{ isRandom ? '🔓' : '🔒' }}
        </NButton>
      </template>
      {{ lockTitle }}
    </NTooltip>
  </div>
</template>

<style scoped>
.seed-field {
  display: flex;
  align-items: center;
  gap: 5px;
}

.seed-input {
  flex: 1;
  min-width: 110px;
}
</style>
