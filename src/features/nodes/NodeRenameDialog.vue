<script setup lang="ts">
/**
 * 节点重命名。
 *
 * 为什么不用 `window.prompt`：eslint 的 no-alert 禁掉了原生弹窗，
 * 而且原生弹窗在深色界面里很突兀、也没法提示「留空会恢复类型名」。
 */
import { NButton, NInput, NModal } from 'naive-ui'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  /** 节点当前的显示名（可能是类型名，也可能是已起的别名） */
  current: string
  /** 节点类型名，用作留空时的占位提示 */
  typeLabel: string
}>()

const emit = defineEmits<{
  confirm: [label: string]
  close: []
  afterLeave: []
}>()

const draft = ref('')
const inputEl = ref<InstanceType<typeof NInput> | null>(null)

watch(() => props.open, async (open) => {
  if (!open) {
    return
  }
  draft.value = props.current
  await nextTick()
  inputEl.value?.focus()
})

function confirm(): void {
  emit('confirm', draft.value)
}
</script>

<template>
  <NModal
    :show="open"
    preset="card"
    :style="{ width: '420px', maxWidth: '92vw' }"
    :bordered="false"
    @update:show="v => { if (!v) emit('close') }"
    @after-leave="emit('afterLeave')"
  >
    <template #header>
      <span class="dlg-title">重命名节点</span>
    </template>

    <div class="dlg-body">
      <NInput
        ref="inputEl"
        v-model:value="draft"
        :placeholder="typeLabel"
        @keydown.enter.prevent="confirm"
      />
      <p class="dlg-hint">
        留空则恢复显示类型名「{{ typeLabel }}」。同一工作流里有多个同类型节点时，
        起个能认出来的名字会省很多事。
      </p>
    </div>

    <template #footer>
      <div class="dlg-footer">
        <NButton size="small" @click="emit('close')">
          取消
        </NButton>
        <NButton size="small" type="primary" @click="confirm">
          确定
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.dlg-title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dlg-hint {
  margin: 0;
  font-size: var(--fs-hint);
  line-height: var(--lh-body);
  color: var(--fg-hint);
}

.dlg-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
