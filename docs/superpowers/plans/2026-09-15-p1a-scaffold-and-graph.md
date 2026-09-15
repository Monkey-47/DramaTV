# P1-a 工程脚手架与图模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可运行的 Vue 3 + TS 工程骨架，并实现 `graph` 模块的数据模型与纯逻辑（端口校验、拓扑排序、环检测），带单测。

**Architecture:** 先清空旧 React 实现（完整保留在 `main`），再手工搭建受控的 Vite 工程（不用脚手架生成器，避免生成物需要删改）。TypeScript 开满激进严格选项并用探针验证真的生效。`graph` 模块是纯函数、零 UI 依赖，是 `canvas` / `nodes` / `runner` 的共同地基，因此先于一切 UI 实现。

**Tech Stack:** Vue 3.5 · Vite 8 · TypeScript 7 · pnpm 11 · Vitest 5 · @antfu/eslint-config 9 · UnoCSS 66 · Naive UI 2.45

**范围说明：** 本计划是 P1 六份计划中的第一份，对应 MVP 计划表的 1.1 / 1.2 / 1.3 三项任务。

**明确不含**（避免执行时误以为漏了）：

| 不含项 | 为什么 | 何时做 |
|---|---|---|
| 画布引擎接入 | 是风险门禁，必须独立验收 | P1-b |
| **MSW** | 1.1 任务清单里列了它，但此刻还没有 API 层，装了也无 handler 可写 | P1-e（runner 需要假事件流时） |
| **vue-router** | 设计文档 §5.3 定义了路由，但本计划还没有任何页面。装了就是死依赖 | P1-c（画布页面落地时） |

> MSW 和 vue-router 是 1.1 清单里列的项，此处**有意延后**到它们有实际用途的那一刻。`src/views/` 目录先建好占位，但保持为空。

### 执行中发现的偏差（2026-09-15 执行时回写）

计划初稿里有两处错误，执行 Task 2 时撞到并已修正，**重跑本计划时以修正后的内容为准**：

**① TypeScript 必须用 6.x，不能用 7.x**

初稿写的是 `typescript@^7.0.2`。实际装上后 `vue-tsc` 直接崩溃：

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]:
Package subpath './lib/tsc' is not defined by "exports" in typescript/package.json
```

原因：TypeScript 7 重构了 package `exports`，移除了 `./lib/tsc` 子路径，而 `vue-tsc` 正是靠 `require.resolve('typescript/lib/tsc')` 定位编译器的。

**注意 `vue-tsc` 的 peer 声明是 `typescript: ">=5.0.0"`，它允许 TS 7 通过 —— peer 范围在这里是错的，不能信。** 已改用 `typescript@^6.0.3`。

**② `baseUrl` 必须删掉**

初稿的 `tsconfig.app.json` 里有 `"baseUrl": "."`。TS 6 起该选项已废弃：

```
error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
```

`paths` 从 TS 4.1 起就不需要 `baseUrl` 了（相对 tsconfig 所在目录解析），所以正确做法是**直接删除该选项**，而不是按错误提示加 `ignoreDeprecations` 去掩盖。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | 依赖与脚本 |
| `vite.config.ts` | Vite 配置（含 `@` 别名） |
| `vitest.config.ts` | 测试配置（复用 Vite 配置） |
| `eslint.config.js` | Lint 规则，含**画布库边界约束** |
| `uno.config.ts` | 原子化 CSS 配置 |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | TS 严格配置 |
| `index.html` | 入口 HTML |
| `src/main.ts` | 应用装配（挂载 Pinia / Router / UnoCSS） |
| `src/App.vue` | 根组件，仅作装配面 |
| `src/features/graph/graph.types.ts` | 图的数据模型与端口类型 |
| `src/features/graph/port.ts` | 端口类型兼容校验（纯函数） |
| `src/features/graph/topo.ts` | 拓扑排序（纯函数） |
| `src/features/graph/cycle.ts` | 环检测（纯函数） |
| `src/features/*/` | 其余 feature 的空骨架 + `.gitkeep` |
| `src/shared/{components/base,composables,utils,types}/` | 跨 feature 共享层骨架 |
| `src/stores/` | app 级全局态（ui 偏好、session） |
| `src/views/` | 路由页面（保持薄） |

---

## Task 1: 移除旧 React 实现

旧实现（React + `@xyflow/react` + zustand）完整保留在 `main` 分支，此处删除只为给 Vue 重写腾出空间，**不丢代码**。

**Files:**
- Delete: `src/`（整目录）、`public/`、`index.html`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`、`eslint.config.js`
- Keep: `docs/`、`.gitignore`、`skills-lock.json`

- [ ] **Step 1: 确认旧实现安全落在 main 上**

Run:
```bash
git log --oneline origin/main -1
```
Expected: `d5a607f docs: 更新开发日志，添加历史重构方案文档`

- [ ] **Step 2: 删除旧实现文件**

Run:
```bash
git rm -r --quiet src public index.html package.json package-lock.json \
  vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js
```

- [ ] **Step 3: 验证工作区只剩该留的东西**

Run:
```bash
ls -a && echo "--- 剩余文件 ---" && git status --short | head -30
```
Expected: 目录下只剩 `.git/` `.gitignore` `.agents/` `.claude/` `docs/` `skills-lock.json`；`git status` 显示一批 `D` 开头的删除记录

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: 移除旧 React 实现，为 Vue 重写腾出空间

旧实现完整保留在 main 分支（d5a607f）。"
```

---

## Task 2: 初始化工程骨架

手工搭建而非用 `create-vue`，因为生成器会产出示例组件和路由样板，后续都要删改，不如直接建受控的最小集合。

**Files:**
- Create: `package.json`、`index.html`、`vite.config.ts`、`src/main.ts`、`src/App.vue`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "ai-video-creater",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@11.1.3",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pinia": "^4.0.3",
    "vue": "^3.5.42"
  },
  "devDependencies": {
    "@types/node": "^24.12.3",
    "@vitejs/plugin-vue": "^6.0.9",
    "@vue/test-utils": "^2.5.0",
    "jsdom": "^30.0.1",
    "typescript": "^6.0.3",
    "vite": "^8.3.0",
    "vitest": "^5.0.1",
    "vue-tsc": "^3.3.11"
  }
}
```

> ESLint / UnoCSS / Naive UI 各自的依赖在对应任务里单独装，避免一次引入太多变量。

- [ ] **Step 2: 创建 tsconfig 三件套**

`tsconfig.json`：
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["vite/client"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "noEmit": true,

    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

`tsconfig.node.json`：
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force"
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: 创建 `vite.config.ts`**

```ts
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 4: 创建 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Video Creator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: 创建 `src/main.ts` 与 `src/App.vue`**

`src/main.ts`：
```ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

`src/App.vue`（注意 SFC 段落顺序：`<script>` → `<template>` → `<style>`）：
```vue
<script setup lang="ts">
// 应用根组件：保持为装配面，不写业务实现（见 vue-best-practices §1.2）
</script>

<template>
  <div>AI Video Creator</div>
</template>
```

- [ ] **Step 6: 安装依赖**

Run:
```bash
pnpm install
```
Expected: 安装成功，生成 `pnpm-lock.yaml`。若提示 `packageManager` 版本不符，按提示执行 `corepack enable` 或改用本机 pnpm 版本。

- [ ] **Step 7: 验证 dev server 能起**

Run:
```bash
pnpm dev
```
Expected: 输出类似 `Local: http://localhost:5173/`，无报错。按 `Ctrl+C` 停止。

- [ ] **Step 8: 验证构建通过**

Run:
```bash
pnpm build
```
Expected: 输出 `dist/index.html` 与 `dist/assets/*.js`，退出码 0。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: 初始化 Vue 3 + Vite + TS 工程骨架"
```

---

## Task 3: 验证 TypeScript 激进严格配置真的生效

**这一步不能跳。** 配置文件里写了严格选项，但若实际未生效，后面所有代码的"类型安全"都是假的。用探针逐一验证。

**Files:**
- Create（临时，验证后删除）: `src/__typecheck-probe.ts`

- [ ] **Step 1: 写入探针文件**

`src/__typecheck-probe.ts`：
```ts
// 探针 1：noUncheckedIndexedAccess —— 索引访问应返回 T | undefined
const arr: string[] = []
export const probe1 = arr[0].length

// 探针 2：exactOptionalPropertyTypes —— 不能把 undefined 显式赋给可选属性
interface Opt { a?: string }
export const probe2: Opt = { a: undefined }

// 探针 3：strict（noImplicitAny）—— 参数隐式 any 应报错
export function probe3(x) {
  return x
}
```

- [ ] **Step 2: 运行类型检查，确认三个探针全部报错**

Run:
```bash
pnpm typecheck
```
Expected: 报错，且**三条都能看到**：
- `'arr[0]' is possibly 'undefined'`
- 关于 `a: undefined` 不能赋给 `a?: string` 的错误
- `Parameter 'x' implicitly has an 'any' type`

若某条没报错，说明对应选项未生效，**回到 Task 2 修 tsconfig 再继续**。

- [ ] **Step 3: 删除探针**

Run:
```bash
rm src/__typecheck-probe.ts
```

- [ ] **Step 4: 确认类型检查干净通过**

Run:
```bash
pnpm typecheck
```
Expected: 无输出，退出码 0

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 用探针验证 TS 严格选项生效"
```

---

## Task 4: ESLint 与画布库边界约束

边界约束是设计文档 §6.1 的硬要求：**画布库只允许出现在 `features/canvas/` 内**。全项目技术风险最高的一块，用 lint 规则锁死，而非靠自觉。

**Files:**
- Create: `eslint.config.js`
- Create（临时，验证后删除）: `src/shared/probe-import.ts`

- [ ] **Step 1: 安装 ESLint 与 antfu 配置，并装画布库以便测试规则**

Run:
```bash
pnpm add -D eslint@^10.10.0 @antfu/eslint-config@^9.5.1
pnpm add @vue-flow/core@^1.48.2
```
Expected: 安装成功

> 此处装 `@vue-flow/core` 是为了让边界规则可被实际测试。它是否长期保留，取决于 P1-b 画布引擎的可行性验证结果。

- [ ] **Step 2: 创建 `eslint.config.js`**

```js
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
  files: ['src/**/*.{ts,vue}'],
  ignores: ['src/features/canvas/**'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: '@vue-flow/core',
          message: '画布库只允许在 features/canvas 内使用（见设计文档 §6.1）',
        },
      ],
      patterns: [
        {
          group: ['@vue-flow/*'],
          message: '画布库只允许在 features/canvas 内使用（见设计文档 §6.1）',
        },
      ],
    }],
  },
})
```

- [ ] **Step 3: 确认当前代码 lint 通过**

Run:
```bash
pnpm lint
```
Expected: 无 error（warning 可接受）。若有关于 `eslint.config.js` 自身的报错，把 `eslint.config.js` 加入 `ignores`。

- [ ] **Step 4: 验证边界规则真的会拦**

创建 `src/shared/probe-import.ts`：
```ts
import { VueFlow } from '@vue-flow/core'

export const probe = VueFlow
```

- [ ] **Step 5: 运行 lint，确认被拦截**

Run:
```bash
pnpm lint
```
Expected: 报错并出现 `画布库只允许在 features/canvas 内使用（见设计文档 §6.1）`

**若没报错，说明规则未生效** —— 边界约束失效，必须修好再继续。

- [ ] **Step 6: 验证白名单位置不报错**

把探针文件移到 `src/features/canvas/probe-import.ts`（目录不存在先建）：

Run:
```bash
mkdir -p src/features/canvas
git mv src/shared/probe-import.ts src/features/canvas/probe-import.ts 2>/dev/null || mv src/shared/probe-import.ts src/features/canvas/probe-import.ts
pnpm lint
```
Expected: 该文件**不报** `no-restricted-imports` 错误

- [ ] **Step 7: 删除探针并做最终确认**

Run:
```bash
rm src/features/canvas/probe-import.ts
pnpm lint
```
Expected: 无 error

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: 接入 ESLint，锁定画布库只在 features/canvas 内使用"
```

---

## Task 5: 接入 UnoCSS 与 Naive UI

**Files:**
- Create: `uno.config.ts`
- Modify: `vite.config.ts`、`src/main.ts`、`src/App.vue`

- [ ] **Step 1: 安装依赖**

Run:
```bash
pnpm add -D unocss@^66.10.3
pnpm add naive-ui@^2.45.3
```
Expected: 安装成功

- [ ] **Step 2: 创建 `uno.config.ts`**

```ts
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
```

> 若 `presetWind3` 在 UnoCSS 66 中已改名，按安装版本的实际导出调整（`presetUno` / `presetWind3` / `presetWind4`）。

- [ ] **Step 3: 在 `vite.config.ts` 注册 UnoCSS**

把 `vite.config.ts` 改成：

```ts
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 4: 在 `src/main.ts` 引入样式与 Pinia**

```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

createApp(App)
  .use(createPinia())
  .mount('#app')
```

- [ ] **Step 5: 用 UnoCSS 类名验证样式真的被产出**

把 `src/App.vue` 改成：

```vue
<script setup lang="ts">
// 应用根组件：保持为装配面，不写业务实现（见 vue-best-practices §1.2）
</script>

<template>
  <div class="text-red-500">
    AI Video Creator
  </div>
</template>
```

- [ ] **Step 6: 构建并确认样式被编译进产物**

Run:
```bash
pnpm build
grep -rl "text-red-500\|--un-text-red-500\|rgb(239 68 68" dist/assets/*.css
```
Expected: 至少命中一个 `dist/assets/*.css` 文件

> 若 grep 无输出，说明 UnoCSS 未生效 —— 检查 `vite.config.ts` 是否注册了插件、`main.ts` 是否引入了 `virtual:uno.css`。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: 接入 UnoCSS 与 Naive UI，挂载 Pinia"
```

---

## Task 6: Vitest 配置与首个测试

**Files:**
- Create: `vitest.config.ts`
- Create: `src/shared/utils/__tests__/sanity.test.ts`

- [ ] **Step 1: 创建 `vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.ts'],
      passWithNoTests: false,
    },
  }),
)
```

- [ ] **Step 2: 写一个会失败的测试**

`src/shared/utils/__tests__/sanity.test.ts`：
```ts
import { describe, expect, it } from 'vitest'

describe('测试环境自检', () => {
  it('vitest 能跑起来', () => {
    expect(1 + 1).toBe(3)
  })
})
```

- [ ] **Step 3: 运行测试，确认它失败**

Run:
```bash
pnpm test
```
Expected: FAIL，报 `expected 2 to be 3`

> 先看它失败，是为了确认测试真的被执行了，而不是因为路径写错导致"零测试通过"。

- [ ] **Step 4: 改正断言**

```ts
import { describe, expect, it } from 'vitest'

describe('测试环境自检', () => {
  it('vitest 能跑起来', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: 运行测试，确认通过**

Run:
```bash
pnpm test
```
Expected: PASS，`1 passed`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 接入 Vitest 并验证测试环境可用"
```

---

## Task 7: 建立目录结构与 feature 骨架

按设计文档 §5.1 建立 `features` / `shared` 布局。Git 不跟踪空目录，用 `.gitkeep` 占位。

**Files:**
- Create: `src/features/{canvas,graph,nodes,runner,assets,runs,project,models}/.gitkeep`
- Create: `src/shared/{components/base,composables,utils,types}/.gitkeep`
- Create: `src/stores/.gitkeep`、`src/views/.gitkeep`

- [ ] **Step 1: 创建目录骨架**

Run:
```bash
mkdir -p src/features/{canvas,graph,nodes,runner,assets,runs,project,models}
mkdir -p src/shared/{components/base,composables,utils,types}
mkdir -p src/stores src/views
touch src/features/{canvas,graph,nodes,runner,assets,runs,project,models}/.gitkeep
touch src/shared/{components/base,composables,utils,types}/.gitkeep
touch src/stores/.gitkeep src/views/.gitkeep
```

- [ ] **Step 2: 确认结构与设计文档一致**

Run:
```bash
find src -type d -not -path '*/__tests__*' | sort
```
Expected:
```
src
src/features
src/features/assets
src/features/canvas
src/features/graph
src/features/models
src/features/nodes
src/features/project
src/features/runner
src/features/runs
src/shared
src/shared/components
src/shared/components/base
src/shared/composables
src/shared/types
src/shared/utils
src/stores
src/views
```

- [ ] **Step 3: 确认 lint 与类型检查仍通过**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 建立 features/shared 目录骨架"
```

---

## Task 8: graph 数据模型

对应设计文档 §3.1。**这一步只定义类型，不写逻辑。**

**Files:**
- Create: `src/features/graph/graph.types.ts`

- [ ] **Step 1: 写类型定义**

`src/features/graph/graph.types.ts`：
```ts
/** 端口承载的数据类型。`any` 是逃生舱口，应尽量少用。 */
export type PortType = 'text' | 'image' | 'video' | 'audio' | 'number' | 'any'

/** 节点上的一个输入/输出端口。`id` 在所属节点内唯一。 */
export interface Port {
  id: string
  label: string
  type: PortType
  required?: boolean
}

/** 节点位置（workflow 内的相对坐标，不含 placement 偏移）。 */
export interface NodePosition {
  x: number
  y: number
}

/** 用户"采用"的产出 —— 持久化，跨运行保持。见设计文档 §3.2 */
export interface AdoptedOutput {
  assetId: string
  frozen: boolean
}

export interface GraphNode {
  id: string
  /** 对应 nodes/registry 里的节点类型 key */
  type: string
  position: NodePosition
  /** 该节点的参数值 */
  data: Record<string, unknown>
  adopted?: AdoptedOutput
}

export interface PortRef {
  nodeId: string
  portId: string
}

export interface GraphEdge {
  id: string
  source: PortRef
  target: PortRef
}

/**
 * 工作流的图。
 * 注意：不含 viewport —— 画布是项目级的，viewport 属于 Project（设计文档 §3.1）。
 */
export interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

- [ ] **Step 2: 确认类型检查通过**

Run:
```bash
pnpm typecheck
```
Expected: 无输出，退出码 0

- [ ] **Step 3: Commit**

```bash
git add src/features/graph/graph.types.ts
git commit -m "feat(graph): 定义图数据模型与端口类型"
```

---

## Task 9: 端口类型兼容校验（TDD）

对应设计文档 §3.2 原则③：**阻止用户拼出无效的图**。

**Files:**
- Create: `src/features/graph/port.ts`
- Test: `src/features/graph/__tests__/port.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/features/graph/__tests__/port.test.ts`：
```ts
import { describe, expect, it } from 'vitest'
import { isPortTypeCompatible } from '../port'

describe('isPortTypeCompatible', () => {
  it('同类型可以连接', () => {
    expect(isPortTypeCompatible('image', 'image')).toBe(true)
    expect(isPortTypeCompatible('text', 'text')).toBe(true)
  })

  it('不同类型不可连接', () => {
    expect(isPortTypeCompatible('text', 'image')).toBe(false)
    expect(isPortTypeCompatible('image', 'video')).toBe(false)
    expect(isPortTypeCompatible('audio', 'number')).toBe(false)
  })

  it('目标端是 any 时可连接', () => {
    expect(isPortTypeCompatible('image', 'any')).toBe(true)
  })

  it('源端是 any 时可连接', () => {
    expect(isPortTypeCompatible('any', 'image')).toBe(true)
  })

  it('两端都是 any 时可连接', () => {
    expect(isPortTypeCompatible('any', 'any')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
pnpm test src/features/graph/__tests__/port.test.ts
```
Expected: FAIL —— 无法解析 `../port`（模块不存在）

- [ ] **Step 3: 写最小实现**

`src/features/graph/port.ts`：
```ts
import type { PortType } from './graph.types'

/**
 * 判断源端口能否连到目标端口。
 *
 * `any` 在任一端都视为通配，这是逃生舱口 —— 它让用户能绕过类型系统，
 * 所以应尽量少用（设计文档 §3.2 原则③）。
 */
export function isPortTypeCompatible(source: PortType, target: PortType): boolean {
  if (source === 'any' || target === 'any') {
    return true
  }
  return source === target
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
pnpm test src/features/graph/__tests__/port.test.ts
```
Expected: PASS，`5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/features/graph/port.ts src/features/graph/__tests__/port.test.ts
git commit -m "feat(graph): 端口类型兼容校验"
```

---

## Task 10: 拓扑排序（TDD）

对应设计文档 §4：执行引擎需要按依赖顺序跑节点。用 Kahn 算法。

**Files:**
- Create: `src/features/graph/topo.ts`
- Test: `src/features/graph/__tests__/topo.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/features/graph/__tests__/topo.test.ts`：
```ts
import type { GraphEdge, GraphNode, WorkflowGraph } from '../graph.types'
import { describe, expect, it } from 'vitest'
import { topologicalSort } from '../topo'

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return {
    id,
    source: { nodeId: from, portId: 'out' },
    target: { nodeId: to, portId: 'in' },
  }
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges }
}

describe('topologicalSort', () => {
  it('空图返回空数组', () => {
    expect(topologicalSort(graph([], []))).toEqual([])
  })

  it('单节点返回它自己', () => {
    expect(topologicalSort(graph([node('a')], []))).toEqual(['a'])
  })

  it('链式依赖按顺序返回', () => {
    const g = graph([node('a'), node('b'), node('c')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')])
    expect(topologicalSort(g)).toEqual(['a', 'b', 'c'])
  })

  it('钻石依赖中，分叉节点排在汇聚节点之前', () => {
    const g = graph(
      [node('a'), node('b'), node('c'), node('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')],
    )
    const order = topologicalSort(g)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('互不相连的节点全部出现在结果里', () => {
    const order = topologicalSort(graph([node('a'), node('b'), node('c')], []))
    expect(order.slice().sort()).toEqual(['a', 'b', 'c'])
  })

  it('有环时抛错', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])
    expect(() => topologicalSort(g)).toThrowError(/环/)
  })

  it('指向不存在节点的边会被忽略，不影响其余排序', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')])
    const order = topologicalSort(g)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
pnpm test src/features/graph/__tests__/topo.test.ts
```
Expected: FAIL —— 无法解析 `../topo`

- [ ] **Step 3: 写最小实现**

`src/features/graph/topo.ts`：
```ts
import type { WorkflowGraph } from './graph.types'

/**
 * 对图做拓扑排序（Kahn 算法），返回节点 id 的执行顺序。
 *
 * 指向不存在节点的边会被忽略 —— 这类边通常来自正在编辑中的中间状态，
 * 不应该让整个排序失败。
 *
 * @throws 图中有环时抛错
 */
export function topologicalSort(graph: WorkflowGraph): string[] {
  const indegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of graph.nodes) {
    indegree.set(node.id, 0)
    children.set(node.id, [])
  }

  for (const edge of graph.edges) {
    const from = edge.source.nodeId
    const to = edge.target.nodeId
    if (!indegree.has(from) || !indegree.has(to)) {
      continue
    }
    const list = children.get(from)
    if (list !== undefined) {
      list.push(to)
    }
    indegree.set(to, (indegree.get(to) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const node of graph.nodes) {
    if (indegree.get(node.id) === 0) {
      queue.push(node.id)
    }
  }

  const order: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) {
      break
    }
    order.push(current)

    for (const child of children.get(current) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1
      indegree.set(child, next)
      if (next === 0) {
        queue.push(child)
      }
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error('工作流中存在环，无法确定执行顺序')
  }

  return order
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
pnpm test src/features/graph/__tests__/topo.test.ts
```
Expected: PASS，`7 passed`

- [ ] **Step 5: Commit**

```bash
git add src/features/graph/topo.ts src/features/graph/__tests__/topo.test.ts
git commit -m "feat(graph): 拓扑排序（Kahn 算法）"
```

---

## Task 11: 环检测（TDD）

拓扑排序能发现"有环"，但说不出**环在哪**。连线校验需要知道具体环路才能提示用户。

**Files:**
- Create: `src/features/graph/cycle.ts`
- Test: `src/features/graph/__tests__/cycle.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/features/graph/__tests__/cycle.test.ts`：
```ts
import type { GraphEdge, GraphNode, WorkflowGraph } from '../graph.types'
import { describe, expect, it } from 'vitest'
import { findCycle } from '../cycle'

function node(id: string): GraphNode {
  return { id, type: 'stub', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, from: string, to: string): GraphEdge {
  return {
    id,
    source: { nodeId: from, portId: 'out' },
    target: { nodeId: to, portId: 'in' },
  }
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges }
}

describe('findCycle', () => {
  it('无环图返回 null', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b')])
    expect(findCycle(g)).toBeNull()
  })

  it('空图返回 null', () => {
    expect(findCycle(graph([], []))).toBeNull()
  })

  it('自环能检出，返回该节点', () => {
    const g = graph([node('a')], [edge('e1', 'a', 'a')])
    expect(findCycle(g)).toEqual(['a'])
  })

  it('两节点互指能检出', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])
    const cycle = findCycle(g)
    expect(cycle).not.toBeNull()
    expect(cycle).toHaveLength(2)
    expect(cycle?.slice().sort()).toEqual(['a', 'b'])
  })

  it('三节点环路能检出，只包含环上的节点', () => {
    const g = graph(
      [node('a'), node('b'), node('c'), node('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a'), edge('e4', 'c', 'd')],
    )
    const cycle = findCycle(g)
    expect(cycle).not.toBeNull()
    expect(cycle?.slice().sort()).toEqual(['a', 'b', 'c'])
  })

  it('指向不存在节点的边不会导致误报', () => {
    const g = graph([node('a'), node('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')])
    expect(findCycle(g)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
pnpm test src/features/graph/__tests__/cycle.test.ts
```
Expected: FAIL —— 无法解析 `../cycle`

- [ ] **Step 3: 写最小实现**

`src/features/graph/cycle.ts`：
```ts
import type { WorkflowGraph } from './graph.types'

const WHITE = 0 // 未访问
const GRAY = 1 // 在当前 DFS 路径上
const BLACK = 2 // 已完成

/**
 * 找出图中的一个环，返回环上的节点 id（按环路顺序）。
 * 无环返回 null。
 *
 * 用三色 DFS：遇到 GRAY 节点说明回到了当前路径上的点，即构成环。
 */
export function findCycle(graph: WorkflowGraph): string[] | null {
  const color = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of graph.nodes) {
    color.set(node.id, WHITE)
    children.set(node.id, [])
  }

  for (const edge of graph.edges) {
    const from = edge.source.nodeId
    const to = edge.target.nodeId
    if (!color.has(from) || !color.has(to)) {
      continue
    }
    children.get(from)?.push(to)
  }

  const stack: string[] = []

  function visit(id: string): string[] | null {
    color.set(id, GRAY)
    stack.push(id)

    for (const child of children.get(id) ?? []) {
      const childColor = color.get(child)
      if (childColor === GRAY) {
        const start = stack.indexOf(child)
        return stack.slice(start)
      }
      if (childColor === WHITE) {
        const found = visit(child)
        if (found !== null) {
          return found
        }
      }
    }

    stack.pop()
    color.set(id, BLACK)
    return null
  }

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE) {
      const found = visit(node.id)
      if (found !== null) {
        return found
      }
    }
  }

  return null
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
pnpm test src/features/graph/__tests__/cycle.test.ts
```
Expected: PASS，`6 passed`

- [ ] **Step 5: 跑完整测试套件与 lint**

Run:
```bash
pnpm test && pnpm lint && pnpm typecheck
```
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/features/graph/cycle.ts src/features/graph/__tests__/cycle.test.ts
git commit -m "feat(graph): 环检测（三色 DFS）"
```

---

## 完成标准

全部完成后应当满足：

- [ ] `pnpm dev` 能起服务，浏览器打开无报错
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` 四条命令零错误
- [ ] 故意触发 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` 会编译报错（Task 3 已验）
- [ ] 在 `features/canvas/` 之外 import `@vue-flow/core` 会被 lint 拦截（Task 4 已验）
- [ ] `src/features/graph/` 有 18 个通过的测试（port 5 + topo 7 + cycle 6）
- [ ] 目录结构与设计文档 §5.1 一致

---

## 后续计划（不在本计划范围）

| 计划 | 内容 | 对应 MVP 任务 |
|---|---|---|
| **P1-b** | 画布引擎接入与**可行性验证**（占位节点、300 节点帧率实测） | 1.4 |
| **P1-c** | 画布交互与工作流分区（分区渲染、坐标偏移、跨区拦截、缩放平移拖拽框选） | 1.5 / 1.6 / 1.19 |
| **P1-d** | 节点系统（注册表、NodeShell、schema 表单、`llm-script`、`text-to-image`） | 1.7 / 1.8 / 1.9 |
| **P1-e** | 执行引擎（runner 状态机、SSE 消费、MSW 事件流、合帧节流、执行作用域、复用标记） | 1.12 / 1.13 / 1.14 / 1.15 / 1.16 |
| **P1-f** | 候选与冻结、多工作流并发、持久化 | 1.10 / 1.11 / 1.17 / 1.18 |

> **P1-b 是一道门禁**：它要验证 Vue Flow 在我们的节点重量下能否撑住。若帧率不达标需换方案，此时尚未写任何业务代码，返工面最小。**P1-b 通过前不要开始 P1-c。**
