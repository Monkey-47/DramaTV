<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
/**
 * 应用顶栏 —— 设计文档 §2.1 + ui-design-spec v1.1，§4.6 运行/成本指示器。
 *
 * 纯展示 + emit。不 import store —— shared 层不该认识 features/stores，
 * 由 view 把 runner 的数据绑进来（依赖方向：views → features → shared）。
 *
 * NConfigProvider 在 CanvasView 顶层提供（全局挂一次，避免嵌套主题）。
 */
import { NDropdown } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  /** 当前正在跑的 run 数（含 queued / running / submitting） */
  runningCount?: number | undefined
  /** 累计实际花费 */
  cost?: number | undefined
  /** 累计预估花费 */
  estimatedCost?: number | undefined
  /** SSE 连接状态；reconnecting 时提示用户 */
  connection?: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | undefined
}>()

const emit = defineEmits<{
  run: []
  stop: []
}>()

const menuOptions = computed<DropdownOption[]>(() => ([
  { type: 'group', label: '项目操作' },
  { key: 'new-workflow', label: '📄 新建工作流' },
  { key: 'save', label: '💾 保存' },
  { key: 'duplicate', label: '📋 另存为副本' },
  { type: 'divider' },
  { type: 'group', label: '视图控制' },
  { key: 'fit-view', label: '⊡ 适配画布  Ctrl+0' },
  { key: 'toggle-grid', label: '# 显示/隐藏网格' },
  { key: 'toggle-minimap', label: '🗺 显示/隐藏小地图' },
  { type: 'divider' },
  { type: 'group', label: '运行控制' },
  { key: 'run', label: '▶ 运行工作流  Ctrl+Enter' },
  { key: 'stop', label: '■ 停止运行' },
  { key: 'run-history', label: '📊 查看运行历史' },
  { type: 'divider' },
  { type: 'group', label: '凭据与设置' },
  { key: 'credentials', label: '🔑 凭据选择' },
  { key: 'usage', label: '📊 用量与成本' },
  { key: 'theme', label: '🎨 主题设置' },
]))

function onSelect(key: string | number): void {
  if (key === 'run') {
    emit('run')
  }
  else if (key === 'stop') {
    emit('stop')
  }
  // 其余菜单项目前是占位，等对应任务落地
}

const costLabel = computed(() => {
  const actual = (props.cost ?? 0).toFixed(2)
  const estimated = Math.round(props.estimatedCost ?? 0)
  return `¥${actual} / ¥${estimated}`
})

/** 有运行中任务 → 蓝点；断线 → 红点并提示 */
const dotState = computed(() => {
  if (props.connection === 'reconnecting' || props.connection === 'closed')
    return 'reconnecting'
  return (props.runningCount ?? 0) > 0 ? 'running' : 'idle'
})
</script>

<template>
  <header class="topbar">
    <NDropdown
      trigger="click"
      :options="menuOptions"
      placement="bottom-start"
      @select="onSelect"
    >
      <button class="menu-btn" type="button">
        <span class="menu-icon">☰</span>
        菜单
      </button>
    </NDropdown>

    <div class="logo">
      AI Video
    </div>

    <div class="filename">
      workflow-untitled.json
    </div>

    <div class="spacer" />

    <div
      class="run-indicator"
      :data-dot="dotState"
      :title="dotState === 'reconnecting' ? '事件流断线，正在重连' : undefined"
    >
      <span class="run-dot" />
      <span>{{ props.runningCount ?? 0 }} 运行中</span>
      <span class="separator">·</span>
      <span>{{ costLabel }}</span>
    </div>

    <div class="avatar">
      A
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 14px;
  background: #1f1f24;
  border-bottom: 1px solid #2e2e32;
  color: #e4e4e7;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  font-size: 12px;
  user-select: none;
}

.menu-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: 5px;
  color: #d4d4d8;
  font-size: 11px;
  cursor: pointer;
}
.menu-btn:hover {
  background: #2e2e32;
}
.menu-icon {
  font-size: 13px;
}

.logo {
  font-size: 14px;
  font-weight: 700;
  color: #e4e4e7;
  letter-spacing: -0.5px;
}

.filename {
  font-size: 11px;
  color: #a1a1aa;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
}

.spacer {
  flex: 1;
}

.run-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: 5px;
  font-size: 11px;
  color: #a1a1aa;
}
.run-indicator .run-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #52525b;
}
.run-indicator[data-dot='running'] .run-dot {
  background: #6366f1;
  box-shadow: 0 0 6px #6366f1;
}
.run-indicator[data-dot='reconnecting'] .run-dot {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}
.run-indicator .separator {
  color: #52525b;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
</style>
