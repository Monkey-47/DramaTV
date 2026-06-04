# 开发日志

记录开发过程中遇到的问题、原因分析和修复方案。

---

## 2026-06-04 · 撤销/重做丢失最新变更

### 🐛 Bug 现象

底部工具栏的撤销/重做按钮异常：

**复现步骤**：
1. 点击底部工具栏的「故事」按钮，画布出现一个新故事节点
2. 点击「撤销」按钮 → 新节点消失 ✓
3. 点击「重做」按钮 → 预期新节点应重新出现，但**节点没有回来** ✗

**预期**：redo 应当恢复到刚才撤销前的状态（即包含新节点的状态）
**实际**：redo 后画布上仍是被撤销后的状态

---

### 🔍 Bug 原因

根本原因在 store 的 `saveHistory()` 调用**时序**错误 —— 在状态变更**之前**调用，导致历史快照保存的是"旧状态"而非"新状态"。

#### 原代码（以 `addSceneNode` 为例）

```ts
addSceneNode: (position, sceneType = 'normal') => {
  // ...构建 newNode
  const newNode = { id: ..., ... };

  saveHistory();  // ⚠️ 在 nodes 变更之前调用
  set((state) => {
    state.nodes.push(newNode);  // 此时 nodes 才被加上新节点
  });
}
```

#### 历史栈变化过程

| 操作 | saveHistory 时 nodes 内容 | 入栈内容 | historyIndex | 备注 |
|------|------------------------|---------|--------------|------|
| 初始 | 初始 3 个节点 | `[初始]` | 0 | — |
| 点「故事」 | **3 个节点**（新节点还没入栈） | `[初始, 初始]` ❌ | 1 | 重复保存了"旧状态" |
| 撤销 | 回到 history[0] | `[初始, 初始]` | 0 | 节点消失 ✓（碰巧正确）|
| 重做 | 回到 history[1] = "初始" | `[初始, 初始]` | 1 | **节点回不来** ✗ |

可以看到，历史栈里**根本没有保存过"含新节点的状态"**，因为 `saveHistory` 在 `set` 之前执行了。

`onConnect`、`deleteNode`、`onNodesChange`、`onEdgesChange`、`autoLayout` 都有同样的问题。

---

### ✅ 修复方案

**核心思路**：`saveHistory()` 的语义改为"**先改 state，再保存最新快照**"，确保入栈的是用户操作**之后**的状态。

#### 修改模板

```ts
// ❌ 错误：先保存再改 state
saveHistory();
set((state) => { state.nodes.push(newNode) });

// ✅ 正确：先改 state 再保存
set((state) => { state.nodes.push(newNode) });
saveHistory();
```

#### 修改的方法清单

`src/store/useDramaStore.ts` 中所有会改 state 的方法，都把 `saveHistory()` 移到 `set(...)` **之后**：

- `addSceneNode`
- `deleteNode`
- `onConnect`
- `onNodesChange` / `onEdgesChange`
- `autoLayout`

#### 验证

修复后的时序：

| 操作 | 入栈内容 | historyIndex | nodes 内容 |
|------|---------|--------------|-----------|
| 初始 | `[初始]` | 0 | 3 个节点 |
| 点「故事」 | `[初始, 含故事节点]` | 1 | 4 个节点 |
| 撤销 | `[初始, 含故事节点]` | 0 | 3 个节点 ✓ |
| 重做 | `[初始, 含故事节点]` | 1 | 4 个节点 ✓ |

---

### 📝 附加优化

为防止后续再踩同样的坑：

1. **在 `saveHistory()` 上加了 JSDoc 注释**：

   ```ts
   /**
    * 保存历史快照。⚠️ 必须在状态变更（set 之后）调用，
    * 语义是"把当前最新状态入栈"，用于 redo 时能回到这个状态。
    */
   ```

2. **简化了 canUndo / canRedo 逻辑**：
   - `saveHistory` 内部统一处理为：`canUndo = true`、`canRedo = false`（新操作丢弃 redo 队列）
   - 之前的判断 `canUndo = newIndex > 0` 在边界处容易出错，现在语义更清晰

3. **边界判断保留**：undo/redo 的 `if (historyIndex <= 0) return` 和 `if (historyIndex >= history.length - 1) return` 防止越界。

---

### 🎯 经验教训

> **历史快照的"保存时机"是 undo/redo 实现的核心**。
>
> 两种常见策略：
> - **命令式**（本项目采用）：用户操作后，主动保存当前状态到历史栈
> - **快照式**：每次 state 变更都自动入栈（更安全但内存开销大）
>
> 命令式的关键约束：**任何会改 state 的操作，都必须"先改后存"**，否则 redo 永远回到"操作前"的状态。
