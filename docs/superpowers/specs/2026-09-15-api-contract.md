# ai-video-creater API 契约 v1

> 日期：2026-09-15
> 状态：待 review
> 上游文档：[设计文档](./2026-09-15-ai-video-creater-design.md)
>
> **本文档是前后端的共同契约。** 后端尚未实现，前端按此契约写类型 + MSW mock；后端实现时必须逐条对齐，尤其是 §9 的实现要点。

---

## 1. 通用约定

| 项 | 约定 |
|---|---|
| Base URL | `/api/v1` |
| 认证 | `Authorization: Bearer <token>` —— **例外：SSE 端点用 Cookie**（见 §5.1） |
| 请求体 | `application/json` |
| 时间戳 | Unix 毫秒（number） |
| ID | 字符串，前缀化：`proj_` / `wf_` / `run_` / `node_` / `asset_` |

### 1.1 错误格式

所有非 2xx 响应统一：

```jsonc
{
  "error": {
    "code": "WORKFLOW_NOT_FOUND",
    "message": "Workflow wf_abc does not exist",
    "retryable": false        // 关键：前端据此决定是否允许自动重试
  }
}
```

`retryable` 为 `true` 的场景：`RATE_LIMITED`、`UPSTREAM_TIMEOUT`、`UPSTREAM_UNAVAILABLE`。
**生成类失败一律 `false`**（重试直接烧钱）。

### 1.2 分页

游标分页，不用 offset：

```jsonc
// 请求
GET /projects/proj_1/assets?limit=50&cursor=asset_120

// 响应
{
  "items": [ /* ... */ ],
  "nextCursor": "asset_70"    // null 表示没有下一页
}
```

---

## 2. Projects

### `GET /projects`

```jsonc
{
  "items": [
    {
      "id": "proj_1",
      "name": "赛博朋克短片",
      "thumbnailUrl": "https://...",
      "workflowCount": 4,
      "assetCount": 37,
      "createdAt": 1737000000000,
      "updatedAt": 1737000000000
    }
  ],
  "nextCursor": null
}
```

### `POST /projects`

```jsonc
// 请求
{ "name": "赛博朋克短片" }

// 响应 201
{ "id": "proj_1", "name": "赛博朋克短片", "createdAt": 1737000000000, "updatedAt": 1737000000000 }
```

### `GET /projects/:id`

返回项目详情 + **画布上所有工作流的摆放信息**（画布首屏加载需要）。

```jsonc
{
  "id": "proj_1",
  "name": "赛博朋克短片",
  "createdAt": 1737000000000,
  "updatedAt": 1737000000000,
  "workflows": [
    { "id": "wf_1", "name": "生成剧本", "placement": { "x": 0, "y": 0 }, "color": "#6366f1" },
    { "id": "wf_2", "name": "角色设定", "placement": { "x": 900, "y": 0 }, "color": "#f59e0b" }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

### `PATCH /projects/:id`

```jsonc
// 请求（字段均可选）
{ "name": "新名字", "viewport": { "x": -120, "y": 40, "zoom": 0.8 } }
```

### `DELETE /projects/:id`

`204 No Content`

---

## 3. Workflows

> 一个 Workflow = 画布上的一个分区 = 一个独立执行单元。

### `GET /projects/:id/workflows`

```jsonc
{ "items": [ { "id": "wf_1", "name": "生成剧本", "placement": { "x": 0, "y": 0 }, "nodeCount": 4 } ] }
```

### `POST /projects/:id/workflows`

```jsonc
// 请求
{ "name": "镜头1", "placement": { "x": 1800, "y": 0 }, "graph": null }   // graph 省略则创建空图

// 响应 201 —— 完整 workflow 对象
```

### `GET /workflows/:id`

返回完整定义，**含 graph**：

```jsonc
{
  "id": "wf_1",
  "projectId": "proj_1",
  "name": "角色设定",
  "placement": { "x": 900, "y": 0 },
  "graph": {
    "nodes": [
      {
        "id": "node_a1",
        "type": "image-triple-view",
        "position": { "x": 40, "y": 60 },
        "data": { "prompt": "赛博朋克少女", "style": "anime" },
        "adopted": { "assetId": "asset_88", "frozen": true }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": { "nodeId": "node_a1", "portId": "image" },
        "target": { "nodeId": "node_a2", "portId": "reference" }
      }
    ]
  },
  "createdAt": 1737000000000,
  "updatedAt": 1737000000000
}
```

> ⚠️ **graph 内不得出现任何运行态**（`status` / `candidates` / `progress`）与 UI 态（`selected` / `hovered`）。见设计文档 §3.2。

### `PUT /workflows/:id`

全量覆盖保存。

```jsonc
{
  "name": "角色设定",
  "placement": { "x": 900, "y": 0 },
  "graph": { "nodes": [ /* ... */ ], "edges": [ /* ... */ ] }
}
```

### `DELETE /workflows/:id`

`204 No Content`

### `POST /workflows/:id/duplicate`

```jsonc
// 请求
{ "name": "角色设定 副本", "placement": { "x": 900, "y": 700 } }
```

---

## 4. Runs

### `POST /workflows/:id/runs` —— 提交运行

**这是最高频的端点。** `scope` 决定跑什么。

```jsonc
// 请求
{
  "scope": { "kind": "node", "nodeIds": ["node_a1"] },
  "graph": { /* 可选：本次运行的图快照。省略则后端取已保存的版本 */ }
}
```

`scope` 三种形态：

```ts
type RunScope =
  | { kind: 'node';       nodeIds: string[] }   // 只跑这几个（上游走缓存）← 高频
  | { kind: 'downstream'; nodeId: string }      // 从某节点往下跑
  | { kind: 'workflow' }                         // 整图 ← 低频
```

```jsonc
// 响应 202
{
  "id": "run_abc",
  "workflowId": "wf_1",
  "status": "queued",
  "scope": { "kind": "node", "nodeIds": ["node_a1"] },
  "nodeStates": {
    "node_a1": { "status": "queued" }
  },
  "cost": { "estimated": 0.12, "actual": null, "currency": "USD" },
  "startedAt": 1737000000000,
  "finishedAt": null
}
```

### `GET /runs/:id` —— 运行详情

用于**页面刷新后重建状态**（SSE 只推增量，首屏需要全量）。

```jsonc
{
  "id": "run_abc",
  "workflowId": "wf_1",
  "status": "partial",
  "scope": { "kind": "workflow" },
  "nodeStates": {
    "node_a1": {
      "status": "succeeded",
      "candidates": [
        { "assetId": "asset_88", "url": "https://...", "mime": "image/png", "width": 1024, "height": 1024 }
      ],
      "reused": false,
      "startedAt": 1737000000000,
      "finishedAt": 1737000004000
    },
    "node_a2": {
      "status": "failed",
      "candidates": [],
      "error": { "code": "UPSTREAM_TIMEOUT", "retryable": true, "message": "..." },
      "startedAt": 1737000004000,
      "finishedAt": 1737000010000
    },
    "node_a3": { "status": "skipped" }
  },
  "cost": { "estimated": 0.50, "actual": 0.19, "currency": "USD" },
  "startedAt": 1737000000000,
  "finishedAt": 1737000010000
}
```

### `POST /runs/:id/cancel`

```jsonc
// 请求（可选）
{ "scope": { "kind": "node", "nodeIds": ["node_a1"] } }   // 省略则取消整个 run
```

### `POST /runs/:id/retry` —— 重试

```jsonc
// 请求
{ "scope": { "kind": "failed-subtree", "nodeId": "node_a2" } }
```

```ts
type RetryScope =
  | { kind: 'node';            nodeIds: string[] }
  | { kind: 'failed-subtree';  nodeId: string }
  | { kind: 'all-failed' }
```

### `GET /workflows/:id/runs`

运行历史（跨工作流的汇总走 `GET /projects/:id/runs`）。

```jsonc
{
  "items": [
    {
      "id": "run_abc",
      "status": "partial",
      "scopeKind": "workflow",
      "cost": { "actual": 0.19, "currency": "USD" },
      "startedAt": 1737000000000,
      "finishedAt": 1737000010000,
      "durationMs": 10000
    }
  ],
  "nextCursor": null
}
```

---

## 5. Events（SSE）

### 5.1 端点

```
GET /projects/:id/events
```

**项目级单通道** —— 一条连接推送该项目下所有 run 的事件。

> **为什么不按 run 订阅**：画布上多个工作流并行跑，按 run 订阅就要开 N 条连接。浏览器对同域名 SSE 连接数有限制（HTTP/1.1 下 6 条），跑 5 个工作流就危险了。

**认证：Cookie**（不是 Bearer）。

> `EventSource` 无法自定义请求 header，标准 SSE 客户端带不了 `Authorization`。**不要用 URL query 传 token** —— 会进服务器访问日志、浏览器历史、Referer。后端单独为 `/events` 端点开 Cookie 鉴权。

请求头：

```
Accept: text/event-stream
Cache-Control: no-cache
```

### 5.2 消息格式

每条事件必须带 `id:` 字段（值为单调递增的 `seq`）：

```
id: 128
event: node.status
data: {"seq":128,"workflowId":"wf_1","runId":"run_abc","nodeId":"node_a2","status":"running","ts":1737000005000}

```

`seq` 在**项目范围内**单调递增。重连时浏览器自动带上 `Last-Event-ID`，后端据此补发之后的事件。

### 5.3 事件类型

```ts
type EventType =
  | 'run.status'        // run 级状态变更
  | 'node.status'       // 节点状态变更
  | 'node.progress'     // 进度更新（高频）
  | 'node.candidates'   // 候选产出就绪
  | 'run.done'          // 终止事件
```

**`run.status`**

```jsonc
{
  "seq": 120, "workflowId": "wf_1", "runId": "run_abc",
  "event": "run.status",
  "status": "running",              // queued | running | succeeded | failed | cancelled | partial
  "cost": { "estimated": 0.5, "actual": 0.03, "currency": "USD" },
  "ts": 1737000000000
}
```

**`node.status`**

```jsonc
{
  "seq": 121, "workflowId": "wf_1", "runId": "run_abc",
  "event": "node.status",
  "nodeId": "node_a1",
  "status": "succeeded",            // pending | queued | running | succeeded | failed | skipped | cancelled
  "reused": false,                  // true = 复用缓存产出，前端需显示"复用"标记
  "error": null,                    // 失败时 { code, retryable, message }
  "ts": 1737000004000
}
```

**`node.progress`**（高频）

```jsonc
{
  "seq": 122, "workflowId": "wf_1", "runId": "run_abc",
  "event": "node.progress",
  "nodeId": "node_a1",
  "progress": 0.35,                 // 0..1
  "ts": 1737000003000
}
```

**`node.candidates`**

```jsonc
{
  "seq": 123, "workflowId": "wf_1", "runId": "run_abc",
  "event": "node.candidates",
  "nodeId": "node_a1",
  "candidates": [
    { "assetId": "asset_88", "url": "https://...", "mime": "image/png", "width": 1024, "height": 1024 }
  ],
  "ts": 1737000004000
}
```

**`run.done`**

```jsonc
{
  "seq": 130, "workflowId": "wf_1", "runId": "run_abc",
  "event": "run.done",
  "status": "succeeded",
  "cost": { "estimated": 0.5, "actual": 0.19, "currency": "USD" },
  "ts": 1737000010000
}
```

### 5.4 心跳

长时间无事件时，每 **30s** 发送一次注释行保活（防止代理断连）：

```
: keepalive

```

---

## 6. Assets

### `GET /projects/:id/assets`

```
?kind=image|video|audio|text
&tags=角色A,三视图          // 逗号分隔，AND 语义
&pinned=true                // 只看已存入资产库的
&limit=50&cursor=asset_120
```

```jsonc
{
  "items": [
    {
      "id": "asset_88",
      "projectId": "proj_1",
      "kind": "image",
      "url": "https://...",
      "thumbnailUrl": "https://...",
      "mime": "image/png",
      "width": 1024, "height": 1024,
      "origin": {
        "type": "generated",
        "workflowId": "wf_2", "nodeId": "node_a1", "runId": "run_abc",
        "params": { "prompt": "赛博朋克少女", "style": "anime", "seed": 42 }
      },
      "pinned": true,
      "tags": ["角色A", "三视图"],
      "label": "角色A 三视图 v2",
      "createdAt": 1737000004000
    }
  ],
  "nextCursor": null
}
```

### `POST /assets/upload-url` —— 预签名直传

大文件不经应用服务器。

```jsonc
// 请求
{ "filename": "ref.png", "mime": "image/png", "size": 2048000 }

// 响应
{
  "assetId": "asset_90",
  "uploadUrl": "https://s3.../presigned",
  "method": "PUT",
  "headers": { "Content-Type": "image/png" },
  "expiresAt": 1737000600000
}
```

前端直传后调 `POST /assets/:id/confirm` 落库。

### `PATCH /assets/:id`

```jsonc
// 请求（字段均可选）—— 主要用途：存为资产 / 打标签
{ "pinned": true, "tags": ["角色A", "三视图"], "label": "角色A 三视图 v2" }
```

### `DELETE /assets/:id`

`204 No Content`

---

## 7. Models

**模型清单由后端提供**（设计文档 §6.3：前端定节点类型，后端定模型）。

### `GET /models`

```
?kind=image|video|audio|text
```

```jsonc
{
  "items": [
    {
      "id": "kling-v2",
      "label": "Kling v2",
      "kind": "video",
      "provider": "kuaishou",
      "paramSchema": [
        { "key": "duration", "label": "时长", "type": "enum", "options": [5, 10], "default": 5 },
        { "key": "aspectRatio", "label": "画幅", "type": "enum", "options": ["16:9", "9:16", "1:1"], "default": "16:9" }
      ],
      "pricing": { "unit": "per-second", "amount": 0.05, "currency": "USD" },
      "capabilities": { "maxDuration": 10, "supportedMime": ["video/mp4"] }
    }
  ]
}
```

前端节点的参数表单里，"模型选择"这类枚举项从这个接口动态拉，**后端加模型不需要前端发版**。

---

## 8. Credentials

**凭据明文永远不下发前端。** 前端只能选"用哪个"，看不到内容。

### `GET /credentials`

```jsonc
{
  "items": [
    { "id": "cred_1", "name": "我的 Kling Key", "provider": "kuaishou", "createdAt": 1737000000000, "lastUsedAt": 1737000000000 }
  ]
}
```

> ⚠️ **响应中绝不能出现 key 明文、部分掩码以外的任何凭据内容。**

### `POST /credentials`

```jsonc
// 请求
{ "name": "我的 Kling Key", "provider": "kuaishou", "secret": "sk-..." }

// 响应 201 —— 只返回元信息，不回显 secret
{ "id": "cred_1", "name": "我的 Kling Key", "provider": "kuaishou" }
```

### `DELETE /credentials/:id`

`204 No Content`

---

## 9. 后端实现要点

这几条**不做的话前端会出 bug**，不是可选项。

### 9.1 `seq` 单调递增 + `Last-Event-ID` 补齐

- 每条 SSE 事件带 `id: <seq>`，`seq` 在项目范围内递增
- 重连时读取请求头 `Last-Event-ID`，**补发该 seq 之后的所有事件**
- 若 `Last-Event-ID` 过旧（超出保留窗口），发送一个 `run.status` 全量快照或让前端走 `GET /runs/:id` 重建

> **不实现这个，断线期间的状态变化会永久丢失**，UI 上出现"节点卡在 running 但实际早已失败"。

### 9.2 产出缓存（断点续跑的支撑）

缓存键：`hash(nodeId + 参数 + 上游输入 assetId 列表 + 模型版本)`

命中则：
- 跳过实际执行
- 事件里 `reused: true`
- 直接返回已有 `candidates`

> **这是"只跑单个节点"能成立的前提**，不是性能优化。没有它，局部执行无从实现。

### 9.3 错误必须标 `retryable`

| code | retryable |
|---|---|
| `RATE_LIMITED` | `true` |
| `UPSTREAM_TIMEOUT` | `true` |
| `UPSTREAM_UNAVAILABLE` | `true` |
| `GENERATION_FAILED` | **`false`** |
| `INVALID_PARAMS` | `false` |
| `QUOTA_EXCEEDED` | `false` |
| `CONTENT_BLOCKED` | `false` |

前端**不做重试决策**，只按这个标记显示"可重试"按钮。

### 9.4 graph 中不得含运行态

`PUT /workflows/:id` 落库前应校验 `graph.nodes[].data` 里没有 `status` / `candidates` / `progress` 之类的字段。前端已按规范实现，但后端加一道防线成本很低。

### 9.5 部分失败语义（DAG）

节点失败时：
- 其**所有下游**标记 `skipped`
- **无依赖关系的其他分支继续执行**
- 全部结束后，若有失败节点则 run 状态为 `partial`

---

## 10. 待定项

| 项 | 说明 |
|---|---|
| 鉴权方案细节 | token 类型（JWT / opaque）、刷新机制、Cookie 的 `SameSite`/`Secure` 配置 |
| 速率限制 | 是否对 `POST /runs` 限流，限多少 |
| 文件大小上限 | 上传与产出物的上限 |
| 产出物保留策略 | 是否自动清理未 `pinned` 的历史产出 |
| 多租户 | 是否需要 `org` 层级 |
