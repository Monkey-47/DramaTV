# AI Video Creator - UI 设计规范

## 文档信息

- **版本**: 1.2（修正版）
- **创建日期**: 2026-09-16
- **修正日期**: 2026-09-17
- **状态**: 已确认（含冲突项修正，见 §11）
- **设计来源**: Superpowers 头脑风暴会话 663-1789567548

## 概述

本文档定义 AI Video Creator 无限画布工作流编辑器的 UI 设计规范。设计目标：

1. **高信息密度** — 在有限屏幕内展示更多节点和连线，支持复杂工作流
2. **性能优先** — 通过 LOD（Level of Detail）渲染保证 60fps，即使在数百节点场景
3. **专业工具感** — 深色主题，清晰的状态编码，符合专业用户预期
4. **渐进式复杂度** — 远看结构（节点位置、连线走向），近看细节（缩略图、参数）

## 1. 视觉方向

### 1.1 主题风格

**深色高密度主题**

- **背景色**: `#131316` (接近纯黑，减少眼疲劳)
- **画布网格**: 径向点阵，`#26262c` 1px 圆点，间距 20px
- **节点背景**: `#1c1c20`
- **节点边框**: `#3f3f46` (中性灰，状态通过顶部色条表达)
- **主色调**: `#6366f1` (indigo-500，用于主要操作按钮和运行状态)

### 1.2 LOD 渲染策略

**三级缩放渲染**（详见 §6）：

- **远景** (< 50% 缩放) — 只显示节点标题 + 状态色条，不渲染参数/缩略图/进度条
- **中景** (50% - 120%) — 显示参数摘要、候选数、进度条，仍不渲染缩略图
- **近景** (> 120%) — 渲染缩略图、完整参数、端口标签

## 2. 布局结构

### 2.1 顶栏 (Top Bar)

**方案**: 左侧压缩栏

```
┌─────────────────────────────────────────────────┐
│ [☰ 菜单] AI Video    workflow-v3.json      [👤] │
└─────────────────────────────────────────────────┘
```

- **高度**: 44px
- **背景**: `#1f1f24`
- **下边框**: `1px solid #2e2e32`

**左上角菜单**包含（下拉展开）：

```
项目操作:
  📄 新建工作流    (POST /workflows)
  💾 保存          (PUT /workflows/:id 全量覆盖)
  📋 另存为副本    (POST /workflows/:id/duplicate)

视图控制:
  ⊡ 适配画布      (快捷键: Ctrl+0)
  # 显示/隐藏网格
  🗺 显示/隐藏小地图   (P1)

运行控制:
  ▶ 运行工作流    (快捷键: Ctrl+Enter)
  ■ 停止运行
  📊 查看运行历史

凭据与设置:
  🔑 凭据选择      (从 GET /credentials 选一个，永不输入明文)
  📊 用量与成本
  🎨 主题设置
```

> **修正记录（v1.1）**:
> - `📂 打开文件...` / `📤 导出为 JSON` → 删除。工作流是服务器端 `Workflow` 实体，没有"本地文件"概念（设计文档 §3.1）。
> - `⚙ API Key 配置` → 改为 `🔑 凭据选择`。**绝不能出现凭据明文输入框**——见设计文档 §4.1「API key 绝不能进前端」与 API 契约 §8「凭据明文永远不下发前端」。
> - `🗑 清空所有缓存` → 删除。API 契约无对应端点，待后端补 `DELETE /projects/:id/cache` 后再加回。
> - 新增 `📊 查看运行历史`（指向 `GET /workflows/:id/runs`）。
> - 新增 `📊 用量与成本`（指向 `features/runs` 跑历史与成本统计，P1 落地）。

**中间**: 当前文件名（灰色，11px）

**右上角**: 运行/成本指示器 + 用户头像（28×28px 圆形，渐变色）

**运行/成本指示器**（常驻，设计文档 §4.6）:

```
┌─────────────────────────────┐
│ ⚡ 2 运行中    ¥12.40 / ¥18  │   ← 实时任务数 + 累计实际花费 / 预估
└─────────────────────────────┘
```

- 任务数 = 当前所有 run 中 `status ∈ {queued, running}` 的数量
- 累计花费 = `Σ runs[].cost.actual`，货币单位 `cost.currency`
- 预估 = `Σ runs[].cost.estimated`；超出预估时数字变橙 (`#f59e0b`)
- 点击展开下拉：当前任务列表、近期完成的任务、本次会话总花费
- 状态色：空闲（灰）/ 有运行（蓝 `#6366f1`）/ 有失败（红 `#ef4444`）
- 暂未实现（P0 占位为 `⚡ 0 运行中    ¥0.00 / ¥0`，待 P1-e 接入 runner 后补数据）

### 2.2 画布区 (Canvas)

- **背景**: `#131316` + 径向点阵网格
- **网格**: `radial-gradient(circle, #26262c 1px, transparent 1px)`
- **网格间距**: 20px × 20px
- **缩放范围**: 25% - 400%
- **平移**: Space + 拖拽，或鼠标中键拖拽

### 2.3 候选面板 (Candidate Panel)

**方案**: 上下分区（双击节点弹出）

```
┌──────────────────────────────────────────┐
│ text-to-image      工作流「生成剧本」  [×]│
├──────────────────────────────────────────┤
│                                          │
│  [候选1] [候选2] [候选3] [候选4]          │  ← 候选图 4 列平铺
│                                          │
│  ┌─────────┬─────────┬─────────┐         │
│  │ Prompt  │ 模型    │ 候选数  │         │  ← 参数表单 3 列横向展开
│  │ [文本框] │ SDXL    │   4     │         │
│  │         │ 分辨率  │ [运行]  │         │
│  │         │1024×1536│         │         │
│  └─────────┴─────────┴─────────┘         │
└──────────────────────────────────────────┘
```

- **尺寸**: 800×500px (可拖拽调整)
- **候选图**: 4 列网格，每张约 160×220px
- **选中候选**: 蓝色边框 (`#6366f1`)，右上角显示 `✓`
- **参数表单**: 横向 3 列，常用参数一排看尽
- **按钮**: "运行" (主按钮，蓝色) / "冻结已选" (次要按钮，灰色)

### 2.4 小地图 (Minimap)

**方案**: 矩形节点 + 视口框

- **位置**: 画布右下角
- **尺寸**: 200×150px
- **背景**: `#1a1a1e` + `1px solid #2e2e32`
- **节点**: 简化成 8×6px 矩形，颜色表示状态（灰/蓝/绿/橙/红）
- **连线**: 简化成 1px 灰线 (`#3f3f46`)
- **视口框**: 半透明白框 (`rgba(255,255,255,0.15)`)，可拖拽跳转

## 3. 颜色系统

### 3.1 端口类型色彩编码

**方案**: Tailwind -300 档（提亮版）

| 类型   | 颜色      | Hex       | 用途                              |
|--------|-----------|-----------|-----------------------------------|
| text   | zinc-300  | `#d4d4d8` | 提示词、脚本、结构化文本          |
| image  | blue-300  | `#93c5fd` | 参考图、生成图、三视图、宫格      |
| video  | violet-300| `#c4b5fd` | 片段视频、动画                    |
| audio  | emerald-300| `#6ee7b7`| 配音、音效、BGM                   |
| number | amber-300 | `#fcd34d` | 种子、权重、时长、帧率            |
| any    | zinc-400  | `#a1a1aa` | 逃生舱口，接受任何类型（应尽量少用）|

**使用规则**:

- 端口圆点 (8×8px) 和连线 (3px) 共用同一个色
- 拖线时不兼容的端口变暗 + 禁止光标
- `any` 类型刻意更暗（zinc-400），视觉暗示"应尽量少用"

### 3.2 节点状态色彩编码

**方案**: 顶部色条 (3px) + 内容区图标

| 状态      | 色条颜色   | 内容区标记 | 说明                          |
|-----------|-----------|-----------|-------------------------------|
| `idle`      | 无        | 无        | 节点未运行，等待触发          |
| `pending`   | 无        | ·         | 已纳入本次 run，等待上游完成  |
| `queued`    | `#52525b` | 排队图标  | 已提交到后端，等候执行        |
| `running`   | `#6366f1` | 进度条    | 色条从左往右填充，显示进度百分比 |
| `succeeded` | `#10b981` | 无        | 本次运行完成，可继续迭代      |
| `failed`    | `#ef4444` | ✗ 文字    | 运行失败，显示"查看日志"      |
| `skipped`   | `#52525b` | ⊘ 文字    | 上游失败导致本节点未执行      |
| `cancelled` | `#52525b` | ⊘ 文字    | 用户主动取消                  |
| `frozen` (叠加) | `#f59e0b` | 🔒 文字 | 锁定已选候选，不再重跑        |
| `reused` (叠加) | `#6366f1` | ⚡ 文字 | 参数未变，秒出（0.1s）        |

> **修正记录（v1.1）**: 设计文档 §3.2 有 7 种节点状态（`pending`/`queued`/`running`/`succeeded`/`failed`/`skipped`/`cancelled`），原 v1.0 只覆盖了 5 种。`skipped` 尤其重要——它是 DAG 部分失败（设计文档 §4.4）的可见结果。`frozen` 与 `reused` 是叠加标记，可与基础状态并存。

**渲染细节**:

```css
.node {
  background: #1c1c20;
  border: 2px solid #3f3f46; /* 边框始终中性灰 */
  border-radius: 8px;
  position: relative;
}

.node-state-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 8px 8px 0 0;
  /* background 根据状态动态设置 */
}

/* 运行中进度动画 */
.node-state-bar.running {
  background: linear-gradient(
    to right,
    #6366f1 60%,      /* 已完成部分 */
    #3f3f46 60%       /* 未完成部分 */
  );
}
```

### 3.3 其他 UI 色彩

- **主按钮**: `#6366f1` (indigo-500)
- **次要按钮**: `#26262a` (zinc-800)
- **危险按钮**: `#ef4444` (red-500)
- **成功提示**: `#10b981` (emerald-500)
- **警告提示**: `#f59e0b` (amber-500)
- **文本主色**: `#e4e4e7` (zinc-200)
- **文本次色**: `#a1a1aa` (zinc-400)
- **文本禁用**: `#52525b` (zinc-600)
- **分割线**: `#2e2e32`

## 4. 节点设计

### 4.1 节点结构 (中景 / 近景)

```
┌─────────────────────────────────┐  ← 3px 状态色条
│                                 │
│  text-to-image                  │  ← 标题 (11px, 粗体)
│  1024×1536 · 候选 4             │  ← 参数摘要 (9px, 灰色)
│  [━━━━━━━━━━░░░░░] 60%          │  ← 进度条 (运行中显示)
│  ⚡ 复用缓存 · 0.1s              │  ← 状态标记 (9px, 颜色编码)
│                                 │
│  [缩略图 160×120px]              │  ← 缩略图 (仅近景渲染)
│                                 │
│  ● in  (text)        out (img) ●│  ← 端口 (近景显示标签)
└─────────────────────────────────┘
```

**尺寸规范**:

- **最小宽度**: 140px
- **标题**: 11px, font-weight: 600, color: `#e4e4e7`
- **参数摘要**: 9px, color: `#6b6b74`
- **状态标记**: 9px, color 根据类型变化
- **缩略图**: 长宽比 4:3，最大 160×120px
- **端口**: 8×8px 圆点，hover 时放大到 10×10px

### 4.2 节点 LOD 渲染

**远景 (< 50% 缩放)**:

```css
.node-far {
  padding: 3px 6px;
  border: 1px solid #3f3f46;
}

.node-title {
  font-size: 9px;
  color: #a1a1aa;
}

/* 不渲染: 参数摘要、进度条、缩略图、端口标签 */
```

**中景 (50% - 120% 缩放)** — 默认视图:

```css
.node-mid {
  padding: 10px 12px;
  border: 2px solid #3f3f46;
}

/* 渲染: 标题、参数摘要、候选数、进度条、状态标记 */
/* 不渲染: 缩略图 */
```

**近景 (> 120% 缩放)**:

```css
.node-near {
  padding: 10px 12px;
  border: 2px solid #3f3f46;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); /* 选中时 */
}

/* 渲染: 所有元素，包括缩略图、端口标签 */
```

## 5. 连线设计

### 5.1 连线样式

**方案**: 贝塞尔曲线 + 渐变色

```javascript
// 连线路径 (SVG path)
const edgePath = `M ${x1},${y1} C ${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`

// 渐变定义
<defs>
  <linearGradient id="edge-gradient-text-to-image">
    <stop offset="0%" stop-color="#d4d4d8" />   <!-- text 颜色 -->
    <stop offset="100%" stop-color="#93c5fd" /> <!-- image 颜色 -->
  </linearGradient>
</defs>

<path 
  d={edgePath}
  stroke="url(#edge-gradient-text-to-image)"
  stroke-width="3"
  fill="none"
/>
```

**曲率控制**:

- 水平距离 < 100px: `dx = 50`
- 水平距离 100-300px: `dx = 100`
- 水平距离 > 300px: `dx = 150`

### 5.2 连线交互

- **正常**: 3px 宽，端口颜色渐变
- **悬停**: 4px 宽，轻微发光 (`drop-shadow(0 0 4px rgba(147,197,253,0.5))`)
- **选中**: 5px 宽，高亮发光
- **不兼容**: 拖线时目标端口变暗 (`opacity: 0.3`) + 禁止光标

### 5.3 连线 LOD

- **远景**: 不渲染渐变，使用纯色 (`#6b6b74`) 2px 细线
- **中景/近景**: 渲染完整渐变 + 3px 宽度

## 6. 交互设计

### 6.1 右键菜单 (Context Menu)

**方案**: 智能菜单（根据节点状态动态显示 5-7 项）

**空闲状态**:

```
▶  运行此节点
📋 复制
🗑 删除
📋 复制参数 JSON
✏️ 重命名           F2
```

**运行中状态**:

```
■  停止运行
🐛 查看实时日志
📋 复制
🗑 删除
✏️ 重命名           F2
```

**运行成功状态**:

```
🔒 冻结已选候选
📜 查看历史运行
📋 复制
🗑 删除
✏️ 重命名           F2
```

**已冻结状态**:

```
🔓 解冻
📜 查看历史运行
📋 复制
🗑 删除
✏️ 重命名           F2
```

**失败状态**:

```
🔄 重试运行
🐛 查看错误日志
📋 复制参数 JSON
🗑 删除
✏️ 重命名           F2
```

**菜单样式**:

```css
.context-menu {
  background: #1f1f24;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.menu-item {
  padding: 7px 10px;
  border-radius: 5px;
  font-size: 11px;
  color: #d4d4d8;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover {
  background: #26262a;
}
```

### 6.2 节点交互：单击开配置，候选走可见入口

> **修正记录（v1.2）**: 原方案是「双击节点打开候选面板」。实现时发现它与「单击打开配置弹窗」**在手势层面互斥**：
>
> 单击后配置弹窗立刻挂载全屏遮罩，双击手势的第二个 click 和随后的 dblclick 都打在遮罩上，到不了节点。实测确认 dblclick 事件确实派发了，但目标是遮罩而非节点。这是浏览器事件模型决定的，不是实现问题。

**现行方案**：

| 手势 / 控件 | 行为 |
|---|---|
| 单击节点主体 | 打开**配置弹窗**（§6.2.1） |
| 点节点上的「N 个候选」按钮 | 打开**候选面板**（§2.3） |
| 点节点上的「运行此节点」 | 见 §6.1 智能右键菜单（P1-f） |

候选入口做成节点上的**可见控件**而非隐藏手势，除了避开冲突，也解决了可发现性 —— 双击是用户猜不到的，而按钮不用猜。

#### 6.2.1 配置弹窗

- **尺寸**: 720px 宽，最大高度 80vh，内容区滚动
- **结构**: 标题（图标 + 显示名 + 一句话说明）→ 输入端口连接状态 → 预设按钮 → 参数表单 → 预估 + 关闭
- **输入端口状态**: 已连接显示绿点，必填未连接显示红点并给出「这个节点现在跑不了」的明确警告

**参数表单的三条设计原则**（这是「专业 + 易上手」的落点）：

1. **提示常驻，不藏在 tooltip 里。** 每个字段的 `hint` 渲染为控件下方的常驻小字，写明推荐值和取舍（如「25–35 是平衡点。再往上收益很小、耗时线性涨」）。生成类工具的参数名对新手是黑话，把推荐值写进界面，用户不必查文档。
2. **渐进式披露。** 默认只露 3–5 个真正影响结果的参数，其余收进默认折叠的「高级（N 项）」。专业用户不被阉割，新手不被劝退。
3. **预设一键可用。** 每个生成类节点提供若干调好的预设（如「写实摄影」「动漫插画」「极速草稿」），不懂 sampler / CFG 的人也能直接出好结果。

**控件类型**（见 `nodes.types.ts` 的 `ParamFieldType`）:

| 类型 | 用途 |
|---|---|
| `slider` | 必须带实时数字读数 —— 光有滑块无法精调 |
| `seed` | 数字 + 🎲 随机 + 🔒 锁定。迭代调参最常用的控件 |
| `aspect` | 宽高比九宫格，按真实比例绘制。不做「1024x1536」字符串下拉 |
| `tags` | 多值 chip 输入。负面提示词天然是标签集合 |
| `select` | 选项的 `hint` 渲染在下拉行内（「DPM++ 3M SDE」这名字本身没有信息量） |

### 6.3 快捷键

| 快捷键           | 功能                |
|------------------|---------------------|
| Ctrl+Enter       | 运行工作流          |
| Ctrl+0           | 适配画布            |
| Ctrl+C           | 复制选中节点        |
| Ctrl+V           | 粘贴节点            |
| Del              | 删除选中节点        |
| F2               | 重命名节点          |
| Space + 拖拽     | 平移画布            |
| Ctrl + 滚轮      | 缩放画布            |

## 7. 性能优化策略

### 7.1 LOD 渲染阈值

```javascript
const LOD_LEVELS = {
  FAR: { min: 0, max: 0.5 },      // < 50% 缩放
  MID: { min: 0.5, max: 1.2 },    // 50% - 120%
  NEAR: { min: 1.2, max: 4 }      // > 120%
}

function getNodeLOD(zoom) {
  if (zoom < LOD_LEVELS.FAR.max) return 'FAR'
  if (zoom < LOD_LEVELS.MID.max) return 'MID'
  return 'NEAR'
}
```

### 7.2 视口裁剪

只渲染视口内 + 周边 200px 缓冲区的节点和连线。

```javascript
const VIEWPORT_PADDING = 200

function isInViewport(node, viewport) {
  return (
    node.x + node.width > viewport.x - VIEWPORT_PADDING &&
    node.x < viewport.x + viewport.width + VIEWPORT_PADDING &&
    node.y + node.height > viewport.y - VIEWPORT_PADDING &&
    node.y < viewport.y + viewport.height + VIEWPORT_PADDING
  )
}
```

### 7.3 缩略图懒加载

缩略图只在近景 + 视口内时渲染。

```javascript
function shouldRenderThumbnail(node, zoom, viewport) {
  return (
    zoom > 1.2 &&                    // 近景
    isInViewport(node, viewport)     // 视口内
  )
}
```

### 7.4 进度更新节流

> **修正记录（v1.1）**: 设计文档 §5.5② 要求 `requestAnimationFrame` 合帧；v1.0 写的是 `setInterval(100)`。**两处冲突，暂以设计文档为准（rAF）**。同时按设计文档 §8 风险 3「先做直连版本，压测后再决定是否加」——P0 不做节流，先直连，等 300 节点帧率数字出来再判断。
>
> ```javascript
> // 设计文档 §5.5② — SSE 消费端攒到 rAF 一次性 flush 到 store
> const pending = new Map<string, number>()
> let rafId = 0
> function enqueueProgress(nodeId: string, progress: number) {
>   pending.set(nodeId, progress)
>   if (rafId === 0) rafId = requestAnimationFrame(flush)
> }
> function flush() {
>   pending.forEach((p, id) => store.setProgress(id, p))
>   pending.clear()
>   rafId = 0
> }
> ```

## 8. 响应式规范

### 8.1 最小屏幕尺寸

- **最小宽度**: 1280px
- **最小高度**: 720px
- **推荐**: 1920×1080 或更高

### 8.2 小屏适配

宽度 < 1440px 时:

- 候选面板宽度缩小到 600px
- 候选图改为 3 列
- 小地图缩小到 150×112px

## 9. 实现优先级

### P0 (MVP 必须)

- [ ] 画布基础：平移、缩放、网格
- [ ] 节点渲染：标题、边框、状态色条
- [ ] 连线渲染：贝塞尔曲线 + 纯色（先不做渐变）
- [ ] 端口颜色编码
- [ ] 顶栏压缩菜单
- [ ] LOD 远景/中景切换

### P1 (早期优化)

- [ ] 连线渐变色
- [ ] 节点缩略图（近景）
- [ ] 候选面板（上下分区布局）
- [ ] 右键智能菜单
- [ ] 小地图

### P2 (后续增强)

- [ ] 进度条动画
- [ ] 连线悬停高亮
- [ ] 快捷键系统
- [ ] 视口裁剪优化
- [ ] 进度更新节流

> **修正记录（v1.1 · 优先级）**: 本规范的优先级列表与 `docs/superpowers/specs/2026-09-15-mvp-breakdown.md` 不对齐——
> - 候选面板（核心用户循环的体现）被本规范归到 P1，但它是设计文档 §3.2 的核心闭环、MVP 任务 1.10/1.11 的正经任务。
> - 「先做 P0」是 2026-09-17 与用户对齐的决定：跳过 P1-b 帧率门禁，直接把渲染做出来；本规范的 P1/P2 顺序在后续阶段仍需按 MVP 任务列表重新核对。

## 10. 参考资料

- **设计原型（UI 的真源）**: `.superpowers/brainstorm/663-1789567548/content/`
  - `visual-direction.html` / `lod-levels.html` / `candidate-panel.html` / `port-colors-v3.html` / `top-bar.html` / `node-state.html` / `context-menu.html`
- **设计文档**: `docs/superpowers/specs/2026-09-15-ai-video-creater-design.md`（**注意**：原 v1.0 误引 `docs/design.md`，该文件不存在）
  - §3.2 候选/采用/冻结、`NodeRunState` 与状态色映射
  - §4.6 运行/成本指示器的需求来源
  - §5.5② 进度事件合帧节流（与本规范 §7.4 冲突，以设计文档为准）
  - §6.1 画布库边界约束、`placement` 偏移叠加规则
- **API 契约**: `docs/superpowers/specs/2026-09-15-api-contract.md`（`POST /credentials` 等端点形状）
- **MVP 任务分解**: `docs/superpowers/specs/2026-09-15-mvp-breakdown.md`（42 任务，工期排序）
- **技术栈**: Vue 3.5 + Naive UI + UnoCSS + Vue Flow

## 11. 已知缺口（不在本次规范）

以下需求在设计文档中明确要求，但**未在本规范中给出视觉定义**，留待对应 MVP 阶段补齐：

| 缺口 | 出处 | 建议落点 |
|---|---|---|
| 产物面板 / 资产库 UI | 设计 §1.2 / MVP 3.11 | P3 |
| 工作流分区 (GroupNode) 视觉 | 设计 §6.1 / MVP 1.5 | P1-c |
| 节点新建入口 (node palette) | 设计 §3.6 `NodeTypeDefinition.category` | P1-d |
| 参数表单（schema 驱动） | 设计 §7.2 | P1-d |
| 运行历史 / 日志面板 | MVP 1.12 / `features/runs` | P1-e |
| undo/redo UI | 设计 §5.6（机制已定） | P2 |
| 断线重连态指示 | 设计 §5.5③ + §9.1 | P1-e |
| 凭据选择器 UI（替代明文输入） | 设计 §4.1 / API 契约 §8 | P1-e |
| per-node-type UI（分镜表/视频播放/下载） | MVP 2.2 / 4.2 / 4.3 | P2-P4 |
| 缩略图懒加载（条件渲染） | 设计 §8 风险 1 / 本规范 §7.3 | P1 —— **届时 LOD 必须从 CSS 切换改为条件渲染**，否则隐藏的 DOM 仍拖帧率 |
| 节点内 `run-history` 面板 | UI §6.1 提及，无 spec | P1-e |

> **修正记录（v1.1 · 缺口来源）**: 这些缺口是探索阶段发现并合并进规范的。v1.0 完全没有列，导致按 v1.0 实现会做出一个缺少核心 UI 的产品。

## 附录 A: 色值速查表

```css
/* 背景色 */
--bg-canvas: #131316;
--bg-node: #1c1c20;
--bg-panel: #1f1f24;
--bg-hover: #26262a;

/* 边框色 */
--border-default: #3f3f46;
--border-subtle: #2e2e32;

/* 文本色 */
--text-primary: #e4e4e7;
--text-secondary: #a1a1aa;
--text-tertiary: #6b6b74;
--text-disabled: #52525b;

/* 状态色 */
--state-idle: #3f3f46;
--state-pending: transparent;
--state-queued: #52525b;
--state-running: #6366f1;
--state-success: #10b981;
--state-skipped: #52525b;
--state-cancelled: #52525b;
--state-frozen: #f59e0b;
--state-error: #ef4444;

/* 端口类型色 */
--port-text: #d4d4d8;
--port-image: #93c5fd;
--port-video: #c4b5fd;
--port-audio: #6ee7b7;
--port-number: #fcd34d;
--port-any: #a1a1aa;
```

> **修正记录（v1.1 · 色值）**: 补全 `pending` / `queued` / `skipped` / `cancelled` 状态色。

---

**文档结束** | 版本 1.2 | 2026-09-17

## 附录 A: 色值速查表

```css
/* 背景色 */
--bg-canvas: #131316;
--bg-node: #1c1c20;
--bg-panel: #1f1f24;
--bg-hover: #26262a;

/* 边框色 */
--border-default: #3f3f46;
--border-subtle: #2e2e32;

/* 文本色 */
--text-primary: #e4e4e7;
--text-secondary: #a1a1aa;
--text-tertiary: #6b6b74;
--text-disabled: #52525b;

/* 状态色 */
--state-idle: #3f3f46;
--state-running: #6366f1;
--state-success: #10b981;
--state-frozen: #f59e0b;
--state-error: #ef4444;

/* 端口类型色 */
--port-text: #d4d4d8;
--port-image: #93c5fd;
--port-video: #c4b5fd;
--port-audio: #6ee7b7;
--port-number: #fcd34d;
--port-any: #a1a1aa;
```

---

**文档结束** | 版本 1.0 | 2026-09-16
