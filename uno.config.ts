import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
  ],
  theme: {
    colors: {
      // 工作流分区配色（后续 canvas 分区使用）
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
