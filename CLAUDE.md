# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
pnpm dev              # Vite 开发服务器（MSW 会在此模式下拦截 /api/v1）
pnpm build            # vue-tsc -b && vite build
pnpm typecheck        # vue-tsc -b
pnpm lint             # eslint .
pnpm lint:fix         # 自动修复（含格式化与 import 排序）
pnpm test             # vitest run
pnpm test:watch       # vitest（监听模式）

# 跑单个文件 / 单个用例
pnpm vitest run src/features/runner/__tests__/reduce.test.ts
pnpm vitest run -t "部分失败"
```

`vitest.config.ts` 的 `include` 只匹配 `src/**/*.{test,spec}.ts` —— **`.vue` 不会被收集**，所以没有组件测试，这是刻意的（见下）。

Windows 环境下 PowerShell 会把 pnpm 的进度输出当 stderr 渲染成 `NativeCommandError`，看着像失败。判断成败要看 `$LASTEXITCODE`，不要看有没有报错文本。

## 这个项目是什么

AI 视频生成的工作流画布。用户在一张无限画布上铺开多个工作流分区，每个分区负责一个工序。

**产品核心不是「一键出片」的流水线**，而是逐步收敛的循环：

```
拖节点 → 填参数 → 只跑这一个节点 → 看产出（多个候选）
            ↑                          ↓
            └──── 不满意，改参数 ────────┘
                                       ↓ 满意
                                选定候选 → 冻结
                                       ↓
                              作为稳定输入，下沉到下一个节点
```

用户任何时刻只在迭代一个工序，整图执行是罕见的最终动作。**这个循环是理解本项目一切设计取舍的前提** —— 比如为什么「候选」和「采用」要分开、为什么冻结是地基而不是优化。

权威设计文档在 `docs/superpowers/specs/`（设计文档、API 契约、MVP 分解表、UI 规范）。改动涉及跨模块语义时先读它们，不要凭代码反推意图。

## 三条状态线（最重要的架构约束）

| 状态                                            | 存放                      | 持久化          |
| ----------------------------------------------- | ------------------------- | --------------- |
| **定义态** —— 工作流、节点位置、参数、`adopted` | `stores/project.store.ts` | ✅ localStorage |
| **运行态** —— run、节点状态、候选、进度         | `stores/runner.store.ts`  | ❌ 绝不         |
| **UI 态** —— selected / hovered / dragging      | 组件本地                  | ❌ 绝不         |

**节点的运行状态绝不能写进 `GraphNode`。** 设计文档 §3.2 对此有专门的 `// ❌ 错误` 示例，持久化层也用**白名单重建**（而非黑名单删除）来保证运行态不可能漏进磁盘。

两个 store 互不 import。runner 的失败传播需要图结构，由 view 通过 `setGraphResolver` 注入 —— 直接 import 会形成双向依赖。

## 依赖方向与画布边界

`views → features → shared`，且 `graph ← canvas`、`graph ← nodes`、`graph ← runner`。

**`@vue-flow/*` 只允许出现在 `src/features/canvas/**`，由 ESLint 强制。** 这条规则直接决定了组件必须分两层：

- `features/canvas/CanvasNode.vue` —— Vue Flow 适配层，负责摆 handle，用 `provide/inject`（`canvas-actions.ts`）把用户意图发出去，**不认识任何 store**
- `features/nodes/NodeShell.vue` —— 节点外观，纯展示，**不 import 画布库**

同理，`features/canvas/mapping.ts` 用结构化类型声明「我需要节点定义的哪些字段」，而不是 import 注册表 —— 这样 canvas 不依赖 nodes 的类型。

## 节点注册表

`NodeTypeDefinition` 驱动渲染：端口、参数表单、卡片摘要全来自定义。

新增一种节点类型 = 改 `nodes/types/<type>/` 一个目录 + 在 `nodes/index.ts` 加一行 import。这是设计文档 §9.1 的验收标准。

**但有一个必须同步的地方**：`src/shared/mocks/fake-backend.ts` 的 `OUTPUT_SHAPE` 表要加一行（产出 mime + 默认候选数）。mock 不能 import 前端注册表 —— `shared → features` 会成环。真实后端从模型注册表拿这些，不需要改。

`nodes/__tests__/registry.test.ts` 里有一组 sanity 测试会替你把关：select/segmented/aspect 的默认值必须在自己的选项表里、slider 必须有 min/max/step、预设引用的 key 必须存在。

## 执行引擎的数据流

```
POST /workflows/:id/runs  →  后端返回的 run（含真实 runId）
        ↓
    hydrateRun(run)        ← 必须先做这一步
        ↓
SSE /projects/:id/events  →  事件带同一个 runId 才能被 store 认领
        ↓
  rAF 合帧  →  applyEvents(批量)  →  reduceEvent（纯函数）
```

**不要本地先造 runId 再提交。** 本地自造的 id 和后端事件里的 id 对不上，`applyEvent` 会全部认不出、静默丢弃，表现为「画布永远不动」。

**SSE 消费端必须合帧**（`useRunEvents.commit` → `flush`）。压测数据：9 节点下把进度事件拉到 77 条/秒时，直连版本主线程累计阻塞 4.6 秒、掉帧 4.5%、最差单帧 434ms；合帧后 P99 从 233ms 降到 16.8ms。每条事件单独写 store 会让 `runs` 换引用 → 渲染 meta 重算 → Vue Flow 全量 diff 节点 data，成本乘以事件数。

`reduceEvent` 是纯函数（无 Vue、无 store），含设计文档 §4.4 的部分失败语义：失败节点的**下游全部 skipped、无关分支继续跑、run 落 `partial`**。

## Mock 优先，载荷对齐契约

后端尚未实现，全程用 MSW 模拟，工作流存 localStorage。**所有 mock 的接口形状都对齐 `docs/superpowers/specs/2026-09-15-api-contract.md`**，目的是将来换真后端时改动是机械的。

MSW 只在 `import.meta.env.DEV` 下动态 import，生产包里 grep 不到任何痕迹。

## TypeScript 严格选项的实际影响

`tsconfig.app.json` 开了几个会在日常编码中反复撞到的选项：

- `verbatimModuleSyntax` —— 类型导入必须写 `import type`
- `exactOptionalPropertyTypes` —— 可选属性若调用方会传 `undefined`，声明处需显式写 `| undefined`。**组件的 props 几乎总是需要这个**，否则父组件传可选值时判为类型错误
- `noUncheckedIndexedAccess` —— `arr[i]` 的类型是 `T | undefined`，需要显式收窄

## Vue SFC 模板里 props 必须显式带 `props.` 前缀

`<script setup>` 里写了 `const props = defineProps<...>()` 之后，模板里可以裸写字段名（Vue 自动绑定），也可以写 `props.xxx`。**本项目统一后者** —— script 和 template 里的 props 引用都显式带 `props.` 前缀。

理由：

- Vue Flow 的 `NodeProps<T>` 会一次性注入 `id / data / type / position / selected / dragging / connectable` 等十几个字段，裸写时 `data` 很容易和本地变量撞名，也看不出是哪来的
- 读代码时一眼分清「这是 props」还是「这是本地 computed / ref」，少一个心智负担
- 本项目的 script 部分本来就全写 `props.xxx`，template 跟它对齐最自然

**不要**写裸的 `data.meta.reused`、`open`、`status === 'running'`；**要**写 `props.data.meta.reused`、`props.open`、`props.status === 'running'`。

## 字号有两套，不要合并

`src/styles/tokens.css` 定义了「阅读档」字号（13px 正文 / 12px 说明）。**画布组件不用它** —— 画布上的节点是「扫视」的，9–11px 密集排版是对的，LOD 还会按缩放隐藏细节；而弹窗表单是「细读」的，必须用可读档。

`--fg-hint` 带 WCAG AA 硬约束（≥4.5:1），改动前先算对比度 —— 说明文字是「容易上手」的主要载体，字号调大但颜色看不清等于没修。

## 测试约定

Vitest + jsdom，测试放同级的 `__tests__/`，命名 `<module>.test.ts`，显式从 `vitest` import（无 globals）。

设计文档 §7.4 划定的范围：**只有 `graph` 和 `runner` 必须有单测**；canvas 的**交互**（拖拽/缩放/框选）明确排除，理由是覆盖成本极高、收益极低。但 canvas 里的**纯逻辑**（映射、分区尺寸、右键菜单项）照常测。

## 提交风格

Conventional Commits，中文描述，scope 在括号里，例如 `feat(canvas): 画布、节点、分区与右键菜单`。

摘要一行说清做了什么；正文写**为什么** —— 尤其是被压测数据、设计文档条款或浏览器行为逼出来的决定。这类判断依据在代码里读不出来，留在提交历史里比留在注释里更容易被看到。

## 已知的技术债

- **打包体积 751 KB（229 KB gzip）**，Vite 警告 chunk 过大。主要来自 Naive UI 全量引入 + Vue Flow。上线前应做代码分割。
- `useRunEvents` 本身没有单测 —— jsdom 没有 `EventSource`。传输层用基于 fetch 的集成测试覆盖（流式、`id:` 行、seq 单调、断线补齐），但 `EventSource` 那层接线只能在浏览器里验证。
- 画布节点摘要仍是 9px + `#6b6b74`（约 3.1:1 对比度）。这是头脑风暴阶段定下的刻意密集排版，但严格说没过对比度标准。
