import { defineConfig, presetWind3 } from 'unocss'

// 注：色值与 src/shared/constants/theme.ts 保持一致。
// 不能跨 tsconfig.node.json 的 include 直接 import（vue-tsc -b 会报错），
// 故此处手抄一份。任何修改请同步两个文件。
const COLORS = {
  // 背景
  'canvas': '#131316',
  'node': '#1c1c20',
  'panel': '#1f1f24',
  'hover': '#26262a',
  // 边框
  'border': '#3f3f46',
  'border-subtle': '#2e2e32',
  // 文本
  'text-primary': '#e4e4e7',
  'text-secondary': '#a1a1aa',
  'text-tertiary': '#6b6b74',
  'text-disabled': '#52525b',
  // 状态
  'running': '#6366f1',
  'success': '#10b981',
  'frozen': '#f59e0b',
  'error': '#ef4444',
  // 端口类型
  'port-text': '#d4d4d8',
  'port-image': '#93c5fd',
  'port-video': '#c4b5fd',
  'port-audio': '#6ee7b7',
  'port-number': '#fcd34d',
  'port-any': '#a1a1aa',
  // 网格点
  'grid-dot': '#26262c',
}

export default defineConfig({
  presets: [
    presetWind3(),
  ],
  theme: {
    colors: {
      bg: {
        canvas: COLORS.canvas,
        node: COLORS.node,
        panel: COLORS.panel,
        hover: COLORS.hover,
      },
      border: {
        DEFAULT: COLORS.border,
        subtle: COLORS['border-subtle'],
      },
      text: {
        primary: COLORS['text-primary'],
        secondary: COLORS['text-secondary'],
        tertiary: COLORS['text-tertiary'],
        disabled: COLORS['text-disabled'],
      },
      state: {
        running: COLORS.running,
        success: COLORS.success,
        frozen: COLORS.frozen,
        error: COLORS.error,
      },
      port: {
        text: COLORS['port-text'],
        image: COLORS['port-image'],
        video: COLORS['port-video'],
        audio: COLORS['port-audio'],
        number: COLORS['port-number'],
        any: COLORS['port-any'],
      },
      grid: {
        dot: COLORS['grid-dot'],
      },
      // 工作流分区配色（保留 P1-c 使用）
      wf: {
        1: '#6366f1',
        2: '#f59e0b',
        3: '#10b981',
        4: '#ef4444',
        5: '#8b5cf6',
      },
    },
  },
})
