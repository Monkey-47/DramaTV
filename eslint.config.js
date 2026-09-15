import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  formatters: true,
  ignores: [
    'dist',
    'node_modules',
    '.agents',
    'docs/**',
  ],
}, {
  // 画布库边界约束（设计文档 §6.1）：
  // 除 features/canvas 外，任何地方都不许 import 画布库。
  // 全项目技术风险最高的一块，用 lint 锁死而非靠自觉。
  files: ['src/**/*.{ts,vue}'],
  ignores: ['src/features/canvas/**'],
  rules: {
    'no-restricted-imports': ['error', {
      // 用通配而非精确匹配：@vue-flow/core 及后续可能引入的
      // @vue-flow/minimap、@vue-flow/background 等子包一并覆盖。
      patterns: [
        {
          group: ['@vue-flow/*'],
          message: '画布库只允许在 features/canvas 内使用（见设计文档 §6.1）',
        },
      ],
    }],
  },
})
