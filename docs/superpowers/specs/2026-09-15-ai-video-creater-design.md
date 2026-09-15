# ai-video-creater 设计文档

> 日期：2026-09-15
> 状态：待 review
> 配套文档：[API 契约](./2026-09-15-api-contract.md)

---

## 1. 产品定位

一个 **AI 视频生成的工作流画布**。用户在一张无限画布上铺开多个工作流分区，每个分区负责一个工序，通过项目级资产库把产物串起来，最终产出可下载的视频片段。

### 1.1 核心洞察：逐步收敛，而非一次性流水线

**这不是一条"一键出片"的流水线。** AI 视频的每一步生成都要花钱抽卡，用户不可能接受"全部串完再一次性看结果"。

真实的工作方式是**逐工序迭代直到满意**：

```
拖节点 → 填参数 → 只跑这一个节点 → 看产出（多个候选）
                    ↑                      ↓
                    └──── 不满意，改参数 ────┘
                                           ↓ 满意
                                    选定候选 → 冻结
                                           ↓
                                  作为稳定输入，下沉到下一个节点
```

**用户任何时刻只在迭代一个"工序"**，整图执行是罕见的最终动作。

每个工序（脚本、分镜、人物三视图、服装材质、表情宫格、片段视频）都要先确保产出满意，才往下走。

### 1.2 画布 = 项目工作台

画布的价值不是"画一张图"，而是**把散落的节点归档成可管理的工作区**：

- 画布上可**同时铺开多个工作流**，各自独立执行（"剧本"在跑的同时，"角色设定"也能跑）
- 侧边**产物面板**汇总所有产物，点击可**定位到画布中产出它的位置**，解决"内容多了找不到东西在哪"的问题
- 工作流之间通过**项目级资产库**共享产物（如角色的三视图被所有镜头引用）

---

## 2. 业务模型

### 2.1 层级结构

```
Project（项目）= 一张无限画布
│
├─ AssetLibrary（项目级资产库）        ← 跨工作流共享
│  ├─ 角色A 三视图
│  ├─ 角色A 服装材质
│  └─ 场景/风格参考
│
└─ Workflows（工作流，画布上的独立分区）
   ├─ 「生成剧本」
   ├─ 「角色设定」
   ├─ 「镜头1」
   └─ 「镜头2」
```

- **Project**：顶层容器，拥有一张画布 + 一个资产库
- **Workflow**：一等执行实体，有自己的图、执行、运行历史。在画布上占据一块区域
- **Asset**：项目级共享的产物

### 2.2 硬约束：跨工作流不连线

用户**不能**在「生成剧本」和「角色设定」之间拖一条线。要共享数据必须走资产库（`asset-ref` 节点引用一个 Asset）。

**这是刻意的约束，不是技术妥协。** 允许随意连线会让用户绕过资产库，导致产物散落各处——正是本产品要解决的问题。强制走资产库则促成正确的工作习惯：满意的产物沉淀下来，可被反复复用。

### 2.3 节点类型catalog

#### 生成方式全景（节点类型的备选池）

**A. 从无到有** —— 文生图
> 批量/多变体**不是独立节点**，是"候选数"参数，由候选集机制覆盖。

**B. 基于已有图**

| 方式 | 额外 UI 需求 |
|---|---|
| 图生图（参考图 + 提示词） | 无 ✅ |
| 局部重绘（蒙版区域重绘） | ⚠️ 蒙版编辑 UI（或上游传入蒙版图） |
| 扩图 | ⚠️ 方向 + 尺寸 UI |
| 变体微调 | 无，但**不必独立成节点**——做成图生图的参数即可 |

**C. 多图输入** —— 角色一致性的核心手段

| 方式 | 额外 UI 需求 |
|---|---|
| 多图参考（角色 + 服装 + 场景） | 无 ✅ 但需**多输入端口** |
| 角色身份参考（IP-Adapter 类） | 无 ✅ |
| 风格迁移 | 无，可并入多图参考 |

**D. 结构化控制**

| 方式 | 额外 UI 需求 |
|---|---|
| 姿势控制 / 深度 / 边缘 / 线稿 | ⚠️ 需要控制图来源 |
| 草图生图 | ⚠️ 需要画板 UI |
| 区域提示 | ⚠️ 需要区域框选 UI |

**E. 图片处理**（不生成新内容但几乎必用）—— 放大/超分、抠图、人脸修复、裁切

**F. 视频方向** —— 图生视频、首尾帧插值、视频生视频、插帧补帧

#### 首批节点类型

| 工序 | 节点类型 | 产出 | 候选数 |
|---|---|---|---|
| 脚本 | `llm-script` | 文本 | 1 |
| 分镜 | `llm-storyboard` | 结构化文本（镜头表） | 1 |
| 人物三视图 | `image-triple-view` | 图 | 多 |
| 服装/材质 | `image-costume` | 图 | 多 |
| 表情宫格 | `image-expression-grid` | 图（宫格） | 多 |
| 图片生成 | `text-to-image` / `image-to-image` / `multi-reference-image` | 图 | 多 |
| 图片处理 | `upscale` / `remove-background` | 图 | 1 |
| 片段视频 | `image-to-video` | 视频 | 多 |
| 资产引用 | `asset-ref` | 透传 Asset | 1 |
| 导出 | `export-video` | 下载到本地 | — |

#### 两条设计约束

**① 多参考图用多个具名输入端口**，不往 `PortType` 里引入数组类型。

```
multi-reference-image 的输入端口：
  character: image
  costume:   image
  scene:     image
```

多数生成 API 的形状本就是若干个具名参考图，具名端口比数组更贴合，也让参数表单更好渲染。

**② 局部重绘的蒙版优先走"上游传入蒙版图"**，不做节点内蒙版编辑器。

前者符合图模型、零额外 UI，能覆盖"改坏的手/脸"这个高频刚需；后者是需要独立 UI 能力的大功能，后置。

**剪辑/合成后置。** 导出 = 直接把视频下载到本地。

---

## 3. 数据模型

### 3.1 图模型

```ts
type PortType = 'text' | 'image' | 'video' | 'audio' | 'number' | 'any'

interface GraphNode {
  id: string                      // nanoid
  type: string                    // 对应注册表 key，如 'text-to-image'
  position: { x: number; y: number }
  data: Record<string, unknown>   // 该节点的参数值
  adopted?: {                     // 用户"采用"的产出 —— 持久化
    assetId: string
    frozen: boolean               // 冻结：锁定该产出，重跑不覆盖
  }
}

interface Port {
  id: string                      // 节点内唯一：'prompt' / 'image'
  label: string
  type: PortType
  required?: boolean
}

interface GraphEdge {
  id: string
  source: { nodeId: string; portId: string }
  target: { nodeId: string; portId: string }
}

interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  // 注意：viewport 不在这里。画布是项目级的（多个工作流共用一张画布），
  // 所以 viewport 属于 Project，不属于单个 Workflow。见 API 契约 §2。
}

// 工作流在画布上的摆放（属于 Workflow，不是 graph 的一部分）
interface WorkflowPlacement {
  x: number
  y: number
  color?: string
}
```

### 3.2 三条分离原则

**① 定义态 ≠ 运行态**

节点的运行状态**绝不能**写进 `GraphNode`。同一条工作流要能跑很多次，每次状态不同；混在一起就无法保留历史，保存工作流时还会把上次的运行状态污染进去。

```ts
// ❌ 错误
interface GraphNode {
  status: 'running' | 'succeeded'
  outputUrl: string
}

// ✅ 正确：定义是定义，运行态按 runId 独立存放
interface NodeRunState {
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled'
  candidates: AssetRef[]          // 本次运行产出的全部候选
  progress?: number
  error?: { code: string; retryable: boolean; message: string }
  reused?: boolean                // 本次是复用缓存产出而非真跑
  startedAt?: number
  finishedAt?: number
}

type NodeRunStates = Record<string /* runId */, Record<string /* nodeId */, NodeRunState>>
```

**用户"采用"与运行产出的区分**（容易搞混，单独拎出来）：

| 概念 | 放哪 | 为什么 |
|---|---|---|
| `candidates` —— 本次跑出了哪些候选 | `NodeRunState`（运行态） | 是**执行的产物**，每次运行都不同 |
| `adopted.assetId` —— 用户选了哪个 | `GraphNode`（定义态，持久化） | 是**用户的决定**，跨运行保持 |
| `adopted.frozen` —— 是否锁定 | `GraphNode`（定义态，持久化） | 同上，用户说"这一步我满意了，锁住" |

所以用户在候选集里挑一个 → 写入 `node.adopted`。**没有这一层区分，用户永远不敢往下走**，因为下一次重跑会把满意的结果冲掉。

**② UI 态 ≠ 持久化态**

`selected`、`hovered`、`dragging`、`collapsed` **不进持久化**。`position` 进，因为它是图的一部分。UI 态放独立 store，保存时直接不序列化。

**③ 端口有类型，连线要校验**

这是画布应用的核心价值——**阻止用户拼出无效的图**。`image` 输入端口不能接 `text` 输出。连接时即拒绝并给出视觉反馈。

`any` 是逃生舱口，应尽量少用。

### 3.3 节点间的数据流：传引用，不传值

端口值统一是 `AssetRef`：

```ts
interface AssetRef {
  assetId: string
  url: string           // 预览用，可能是带签名的临时 URL
  mime: string
  width?: number
  height?: number
  duration?: number     // 视频/音频
}
```

**理由**：一段 5 秒的生成视频几十 MB，不可能塞进图里在网络上传。上游产出落到对象存储，下游只拿引用。

**副作用（好的那种）**：同一个 `AssetRef` 可被多个下游节点引用，天然支持扇出（"一张角色图喂给 5 个镜头"）。断点续跑时也能直接复用。

### 3.4 执行作用域

```ts
type RunScope =
  | { kind: 'node'; nodeIds: string[] }       // 只跑这几个（上游走缓存）← 高频
  | { kind: 'downstream'; nodeId: string }    // 从某节点往下跑
  | { kind: 'workflow' }                       // 整图 ← 低频，最终出片才用
```

### 3.5 Asset 模型

```ts
interface Asset {
  id: string
  projectId: string
  kind: 'image' | 'video' | 'audio' | 'text'
  url: string
  thumbnailUrl?: string
  mime: string
  width?: number; height?: number; duration?: number

  // 来源 —— 决定能不能"参数回填"
  origin:
    | { type: 'upload' }
    | { type: 'generated'; workflowId: string; nodeId: string; runId: string; params: Record<string, unknown> }

  pinned: boolean        // 是否已"存为资产"进入资产库
  tags: string[]         // '角色A' / '三视图' / '赛博朋克风格'
  label?: string
  createdAt: number
}
```

**三个设计点**：

1. **产出和资产是同一个实体** —— 后端所有节点产出都是 Asset，`pinned` 标记表示"用户存进了资产库"。不搞两套模型
2. **`tags` 是角色一致性的实现载体** —— 标记"角色A / 三视图"后，任何工作流都能搜出来复用
3. **`origin` 记录生成参数** —— 支持"反查这张图怎么生成的"和**参数回填**，是可复现性与迭代效率的基础

### 3.6 节点类型定义

```ts
interface NodeTypeDefinition<TParams = Record<string, unknown>> {
  type: string                   // 'text-to-image'
  label: string                  // '文生图'
  category: string               // 右键菜单分组
  icon: Component
  inputs: Port[]
  outputs: Port[]
  params: ParamSchema<TParams>   // 驱动参数面板渲染
  estimate?: (params: TParams) => { cost?: number; duration?: number }
}
```

**参数类型收窄**：`data` 不做 `Record<string, unknown>` 裸用，注册表带泛型，取节点参数时能拿到完整类型提示。

```ts
// nodes/registry.ts
const registry = new Map<string, NodeTypeDefinition<any>>()

export function registerNodeType<T>(def: NodeTypeDefinition<T>): void
export function getNodeType<T>(type: string): NodeTypeDefinition<T> | undefined
```

各节点类型在自己目录里调 `registerNodeType`，`nodes/index.ts` 统一 import 触发注册。

---

## 4. 执行架构

### 4.1 后端执行

**图在后端执行**，前端只做三件事：提交 run、订阅事件流、维护状态机。

两个硬性理由：

1. **视频生成单次要几分钟**。前端执行意味着用户一关标签页就全死，而画布上可能有多个工作流并行跑。后端执行才能做到"关掉明天回来看结果"
2. **API key 绝不能进前端**。生成 API 的 key 一旦打进 bundle 就等于公开泄露

### 4.2 两级状态机

**运行级（Run）**

```
idle → submitting → queued → running → succeeded
                                     ↘ failed
                                     ↘ cancelled
                                     ↘ partial      ← 有节点失败但非全线崩
```

**节点级（Node）**

```
pending → queued → running → succeeded
                          ↘ failed
                          ↘ skipped     ← 上游失败导致没机会跑
                          ↘ cancelled
```

`partial` 是必需状态——允许部分失败就必须有终止态表达"跑完了但有几个节点挂了"。

### 4.3 断点续跑是地基，不是优化

**这条不能砍。** 局部执行（只跑一个节点）的前提是上游产出已缓存——用户"只跑这一个节点"时，上游不重新执行，直接取缓存产出喂进来。

**没有产出缓存，局部执行根本无从实现。** 它不是省钱优化，是这张画布能用的前提。

后端实现要点：按 `nodeId + 参数hash + 上游输入hash` 建缓存键，命中则跳过执行直接返回已有产出。

**前端配合**：必须让"复用"和"真跑"在视觉上可区分（节点上显示复用标记），否则用户看到秒出结果会以为是 bug。

### 4.4 部分失败策略：DAG 语义

节点失败 → **其所有下游 `skipped`**；无依赖关系的其他分支**继续执行**。

理由：并行分支是画布应用的常态（一个角色参考图喂给 5 个镜头），一个镜头失败连坐其余 4 个不可接受。

### 4.5 重试策略

| 类型 | 策略 |
|---|---|
| 自动重试 | **只针对可重试错误**（网络抖动、429 限流）。后端在错误码里标 `retryable: true/false` |
| 生成失败 | **不自动重试**（直接烧钱） |
| 手动重试 | 三种粒度：单个节点 / 失败子树 / 整个 run |

**前端不做重试决策，只展示后端给的可重试标记。**

### 4.6 成本可视化

多个工作流并行跑 = 同时在烧钱。画布顶栏需要常驻的**运行/成本指示器**，一眼看到"当前几个任务在跑、累计花了多少"。节点的 `estimate` 提供预估，实际值由后端在运行历史里返回。

---

## 5. 前端架构

### 5.1 目录结构

```
src/
├─ main.ts
├─ App.vue
├─ router/
├─ features/
│  ├─ canvas/     # 视口/缩放/选择/框选/网格/小地图/分区渲染
│  ├─ graph/      # 节点&连线数据模型、端口类型校验、拓扑排序
│  ├─ nodes/      # 节点注册表 + 各类型定义 + 通用节点 UI
│  │  ├─ registry.ts
│  │  ├─ components/        # NodeShell / PortHandle ...
│  │  └─ types/
│  │     ├─ llm-script/
│  │     ├─ image-triple-view/
│  │     └─ ...
│  ├─ runner/     # 提交 run、订阅 SSE、事件 → 状态机归约
│  ├─ assets/     # 资产库 UI、asset-ref 节点、产物面板
│  ├─ runs/       # 运行历史、成本统计
│  ├─ project/    # 项目与工作流的存取、导入导出
│  └─ models/     # 模型清单、凭据选择
├─ shared/        # 跨 feature 且无业务语义
│  ├─ components/base/
│  ├─ composables/
│  ├─ utils/
│  └─ types/
├─ stores/        # app 级全局态（ui 偏好、session）
└─ views/         # 路由页面，保持薄
```

### 5.2 依赖方向（单向，不可逆）

```
views → features → shared

graph ← canvas
graph ← nodes → assets
graph ← runner → assets
```

### 5.3 跨 feature 组件的归属判定

按顺序问下来，基本都能定：

**① 有业务语义吗？没有 → `shared/components/base/`**

`Button` `Modal` `Tooltip` `Slider` 不属于任何 feature。**大部分"跨 feature 组件"其实是这类**，根本不该进 feature。

**② 有语义 → 问"这个概念的定义权在谁手里"，归定义方，使用方 import**

| 组件 | 被谁用 | 归属 | 理由 |
|---|---|---|---|
| `NodeShell` | 所有节点类型 | `nodes` | "一个节点长什么样"由 nodes 定义 |
| `AssetThumbnail` | `assets` 资产库、节点输出预览 | `assets` | "什么是一个素材"由 assets 定义 |
| `RunStatusBadge` | 节点、历史页、顶栏 | `runner` | 状态机的定义权在 runner |

**③ 是复用还是组合？**

很多"跨 feature 复用"实际是把两个组件拼起来。例：节点参数面板里放资产选择器——不必把 `AssetPicker` 搬进 `shared`，只需在 `nodes` 里写个容器用 slot 塞进去。**组合优先于搬迁。**

**④ 出现双向依赖 = 划错了**

`A → B` 且 `B → A`，只有两种可能：它们本来就是一个 feature，或中间缺一层抽象。**不要用 `shared` 去打破环**——那只是把环藏起来。

**⑤ 真·全局件 → 提升为独立 feature**

`runner` 本身就是这种——不属于 canvas 也不属于 nodes。

> **现实提醒**：100% 干净的 feature 边界不存在，总有约 10% 模糊地带。**判断结构好坏的标准是「改一个功能的改动面有多大」，不是「依赖图好不好看」。**

### 5.4 canvas 对外接口

其他 feature **不得**直接操作画布内部状态，只能通过这些接口：

```ts
// features/canvas 暴露
export function focusNode(workflowId: string, nodeId: string): void   // 平移动画 + 高亮脉冲
export function focusWorkflow(workflowId: string): void
export function getViewport(): Viewport
```

`focusNode` 是产物面板的支撑——点击产物定位到产出它的节点，解决"东西多了找不到"。

### 5.5 runner 的三个实现要点

**① SSE 认证**

`EventSource` **不能自定义 header**，标准 SSE 客户端带不了 `Authorization: Bearer`。

- ❌ token 塞 URL query —— 会进服务器访问日志、浏览器历史
- ✅ **该 SSE 接口改用 Cookie 认证**（采用）—— `/projects/:id/events` 单独开 cookie 鉴权，其他接口照常用 Bearer
- 备选：fetch + ReadableStream 手写 SSE 解析

**② 进度事件必须合帧节流**

20 个节点同时跑，`node.progress` 每秒可能几十条。每条都往 store 写 → 画布疯狂重渲染 → 卡死。

**必须在 SSE 消费端攒到 `requestAnimationFrame` 一次性 flush 到 store。**

> 注：此优化尚未实测验证，见 §8 未验证风险。

**③ 重连补齐依赖 `seq`**

服务端每条事件发 `id: <seq>`，浏览器重连自动带 `Last-Event-ID`。**后端不实现这个，断线期间的状态变化永久丢失**，UI 会出现"节点卡在 running 但其实早已失败"。

### 5.6 持久化与撤销重做

- **工作流定义** → 后端 `PUT`，但前端要有**草稿自动保存**（debounce ~2s 写 localStorage），防止浏览器崩溃丢失画布
- **产出物** → 对象存储，前端只存 `AssetRef`
- **撤销重做** → 节点数量在几十级，**整图快照 + 结构共享**最简单可靠。用 Immer 的 `produceWithPatches`，栈深限制 50

---

## 6. 关键技术决策

### 6.1 画布引擎：Vue Flow

**`@vue-flow/core` 1.48.2，MIT，周下载 377k。**

选型依据——**我们的节点是"活的 Vue 组件"**（内部有参数表单、进度条、候选图墙、冻结标记，还要直读 store）：

| 库 | 自定义节点机制 | 结论 |
|---|---|---|
| **Vue Flow** | 就是 Vue 组件 | ✅ 采用 |
| `@xyflow/vue` | 也是 Vue 组件 | ⚠️ 停在 `2.0.0-next.17`，周下载 92。**不用，但盯着** |
| `@antv/x6` | 靠 `@antv/x6-vue-shape` 桥接 | ❌ 节点注册进它的图模型，Vue 组件塞进 HTML overlay，跨边界拿状态别扭 |
| `@logicflow/core` | 靠 `@logicflow/vue-node-registry` 桥接 | ❌ 同上，且 X6/LogicFlow 是**流程图/ER 图**取向，抽象为 BPMN 设计，不是为 AI 工作流 |

**多工作流分区的实现**：

```
一个 VueFlow 实例
├─ GroupNode「生成剧本」        ← 工作流分区
│   ├─ [剧本节点]  parentNode: group-1
│   └─ [分镜节点]  parentNode: group-1
└─ GroupNode「角色设定」
```

用 Vue Flow 的 `parentNode` 嵌套表达分区；**跨工作流不连线**的约束用 `isValidConnection` 回调实现——两端父级不同则拒绝，同时叠加端口类型校验。

**数据模型 → 渲染模型的映射**（实现的关键桥接，不能省）：

数据上工作流是**彼此独立的实体**（各有自己的 `graph`），但画布渲染时它们被摊平成一个 Vue Flow 图。映射关系：

| 数据模型 | 渲染模型 |
|---|---|
| `Project.workflows[]` | 每个 workflow → 一个 `GroupNode` |
| `Workflow.placement` | → 该 GroupNode 的 `position` |
| `Workflow.graph.nodes[]` | → GroupNode 的子节点，`parentNode` 指向该 group |
| `Workflow.graph.edges[]` | → 顶层 edges（Vue Flow 的边不参与父子嵌套） |

**节点坐标要转换**：`WorkflowGraph.nodes[].position` 是 **workflow 内相对坐标**，渲染时需要叠加 `placement` 偏移。这个转换只允许在 `canvas` feature 内部做，上层（`nodes` / `graph`）永远只认相对坐标。

> 这样设计的收益：工作流可以被单独导出/复制/挪动，而画布上的位置只是它的一条元数据。若把绝对坐标存进 `graph`，挪动整个工作流就要重写它每一个节点。

**硬约束**：

> **画布库只允许出现在 `features/canvas/` 内部。其他任何 feature 不许 import 它。**

这是全项目技术风险最高的一块。约束住它，一旦需要更换引擎，改动面被锁死在 `canvas/` 一个目录。

### 6.2 协议：SSE（项目级单通道）+ REST

- **任务状态推送是纯单向的**（后端 → 前端），SSE 正为此设计
- **SSE 浏览器原生自动重连**，带 `Last-Event-ID` 断点续传——视频生成跑几分钟，用户切后台、网抖一下，重连后必须能补齐漏掉的状态
- 后端实现成本远低于 WebSocket

**项目级单通道**：多个工作流同时跑，若按 run 订阅就要开 N 条 SSE 连接（HTTP/1.1 下同域名上限 6 条）。改为：

```
GET /projects/:id/events      ← 一条连接推该项目下所有 run 的事件
```

事件带 `workflowId` + `runId`，前端 `runner` 只需维护一个 EventSource 实例。

取消/暂停等主动操作走普通 REST POST。

> 未来若要做多人协作画布（实时光标、协同编辑），必须上 WebSocket。届时加一条独立 WS 通道即可，不影响现有设计。

### 6.3 Schema 所有权：前端定节点，后端定模型

- **前端** `nodes/registry.ts` 管"有哪些节点、每个节点长什么样"（UI 需定制，纯 schema 表达不了）
- **后端** `/models` 接口管"有哪些模型可选、参数范围、价格"

理由：**模型清单是高频变的后端数据，节点 UI 是低频变的前端代码**。各管各擅长的，两边都不用为对方频繁发版。

### 6.4 Store 职责：只存状态，不调 API

Store 只负责状态与同步 mutate；异步请求放 composables，由 composable 调用 store 的 action 写入结果。

**尤其 `runner`**：其状态来源是 SSE 事件流而非请求，store 里塞异步请求会让状态与副作用耦合，测试和调试都变难。

**纪律**：状态默认放本地，跨 feature 才提升到全局。**不是所有状态都往 Pinia 塞。**

---

## 7. 技术规范

### 7.1 技术底座

| 项 | 决定 |
|---|---|
| 语言 | TypeScript，**激进严格** |
| tsconfig | `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` |
| 包管理 | **pnpm** |
| Vue API | **Composition API + `<script setup lang="ts">`**，全项目统一 |

> `exactOptionalPropertyTypes` 是唯一可能和第三方类型定义（Vue / VueUse / UI 库的 `props`）冲突的选项。若撞上，**明确指出是哪一处，再决定局部压制还是关闭该规则**——不静默降标准。

### 7.2 工具链

| 项 | 选择 | 理由 |
|---|---|---|
| Lint / Format | `@antfu/eslint-config` | 一个包搞定 lint + 格式化，Vue/TS 预设合理，自带 import 排序，不用维护两套配置 |
| HTTP | `ofetch` | 拦截器、重试、自动 JSON 解析，体积小 |
| Mock | **MSW** | 拦截网络层，切真接口时业务代码零改动 |
| 样式 | **UnoCSS** | Vue 生态、快、按需。画布 70% 是自定义渲染，原子化最合适 |
| UI 组件 | **Naive UI** | TS 类型好、主题可定制、按需引入。节点参数表单是 schema 动态渲染，需要可靠表单组件 |
| auto-import | **不用** | 显式 import 更符合严格路线。`unplugin-auto-import` 会让类型跳转变模糊 |
| Git hooks | `simple-git-hooks` + `lint-staged` | 比 husky 轻 |
| Commit | commitlint（Conventional Commits） | 自动 changelog + 语义化版本 |
| 测试 | Vitest | 见 7.4 |
| CI | GitHub Actions：lint + test + build | 防止坏代码进主干 |

**不引 zod**：后端尚未实现，现在引 zod 没有可校验对象。先手写 TS 类型 + MSW 假数据；后端接上后直接用 `openapi-typescript` 从 OpenAPI 生成类型，比手写 schema 更省事、更不会漂移。

### 7.3 命名约定

| 类型 | 约定 | 示例 |
|---|---|---|
| 组件文件 | PascalCase | `NodeShell.vue` |
| Composable | `use` 前缀，camelCase | `useRunStream.ts` |
| Store 文件 | `xxx.store.ts`，导出 `useXxxStore` | `runner.store.ts` → `useRunnerStore` |
| 类型文件 | `xxx.types.ts` | `graph.types.ts` |
| API 文件 | `xxx.api.ts` | `workflow.api.ts` |
| feature 目录 | kebab-case | `image-to-video/` |
| 常量 | SCREAMING_SNAKE_CASE | `MAX_UNDO_DEPTH` |

**SFC 段落顺序**：`<script>` → `<template>` → `<style>`

### 7.4 测试范围：只测 `graph` 和 `runner`

| 模块 | 测？ | 理由 |
|---|---|---|
| `graph` | ✅ | 连线类型校验、拓扑排序、环检测 —— 纯函数，测试成本极低收益极高 |
| `runner` | ✅ | 事件流 → 状态机归约。出错会直接导致 UI 状态错乱 |
| 画布组件 | ❌ | 拖拽/缩放/框选用单测覆盖成本极高、收益极低，等 E2E 需求再说 |
| 其他 feature | ❌ | 暂不覆盖 |

写测试时遵循 `vue-testing-best-practices` skill 的规范。

### 7.5 组件与状态规范

来自 `vue-best-practices` skill：

- **根组件与路由页面保持"组合面"** —— 只做装配、暴露和 feature 组合，不写业务实现
- **组件拆分有客观触发条件**，满足任一即拆：
  - 同时承担编排/状态与多个区块的大量模板
  - 有 3+ 个独立 UI 区块（表单、筛选、列表、底部状态）
  - 模板块重复或可复用（列表项、卡片）
- **数据流**：props down / events up 为主；`v-model` 只用于真正的双向契约；`provide/inject` 只用于深层依赖或共享上下文
- **状态默认本地，跨 feature 才提升到全局**

---

## 8. 未验证风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | **Vue Flow 性能未实测**。我们的节点比典型流程图节点重约 10 倍（~50–100 DOM 元素 vs ~5），300 个节点时的拖拽/缩放帧率**未经验证** | 若 <30fps 需重新评估引擎 | 画布库锁死在 `canvas/` 内；**节点渲染从第一天按"可能要被虚拟化"设计**（进度更新不直接绑 DOM、候选图懒加载）；关注 `onlyRenderVisibleElements` |
| 2 | **Vue Flow 维护节奏**。最近发布 2026-01-28，已 8 个月无更新 | 长期无人维护 | 动手前查仓库 issue/PR 活跃度；关注 `@xyflow/vue` 转正 |
| 3 | **合帧节流可能过度设计**。20 节点同时更新进度是否真的会卡，未实测 | 多一层不必要的复杂度 | 实现时先做直连版本，压测后再决定是否加 |
| 4 | **`exactOptionalPropertyTypes` 与第三方类型冲突** | 编译报错 | 撞上时明确指出，局部压制或关闭该规则 |
| 5 | **多工作流分区是 Vue Flow 的非主流用法** | 可能撞到未验证边界 | 用 group node 嵌套 + `isValidConnection`；出现阻塞时评估自研视图层 |

---

## 9. 验收标准

架构层面的硬性验收：

1. **新增一种节点类型，只允许修改 `nodes/types/<type>/` 一个目录。** 若需要改动 `canvas/`、`graph/`、`runner/` 任何一行，说明注册表设计失败
2. **`@vue-flow/core` 的 import 只出现在 `features/canvas/` 内**（可用 ESLint `no-restricted-imports` 强制）
3. **feature 依赖单向无环**（可用 `eslint-plugin-boundaries` 或依赖图脚本检查）
4. **`graph` 与 `runner` 有单测覆盖**
5. **保存工作流时不序列化任何运行态与 UI 态**

---

## 10. 后续（本次不做）

- 视频剪辑/合成
- 多人协作画布（需 WebSocket）
- E2E 测试
- 模板市场 / 工作流导出分享
