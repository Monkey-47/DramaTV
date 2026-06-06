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

---

## 2026-06-05 · 拖拽节点卡顿（仅 DevTools 打开时出现）

### 🐛 Bug 现象

拖拽画布上的场景/文本节点时，节点位置跟手出现明显卡顿、掉帧。

**复现步骤**：
1. 打开浏览器 DevTools（任意面板）
2. 在画布上拖动任意节点
3. 节点位置更新出现可见拖滞感

**预期**：拖拽流畅，节点跟手
**实际**：拖拽明显掉帧；关闭 DevTools 后立刻恢复流畅

---

### 🔍 Bug 原因

现象有迷惑性 —— 看起来像 DevTools 自己的性能问题，实际上 DevTools 只是把已有问题"放大"出来。

**根因**：拖拽过程中 React Flow 会以接近每帧一次的频率触发 `onNodesChange(position)`，当前实现把每次变更都直接写回全局 zustand store，所有订阅了 `nodes / edges` 的组件每帧都跟着重渲染。DevTools 打开后会附加额外的运行时开销（V8 关闭部分激进 JIT、DOM 事件同步给 Inspector），单帧渲染的常数因子被抬高，原本压在 16ms 内的工作就掉出帧预算。

#### 拖拽一帧的旧链路

| 触发点 | 影响 |
|-------|------|
| `ReactFlow.onNodesChange` | 每帧调用，传入 position 变更 |
| `useDramaStore.onNodesChange` | 直接 `set` 全局 `nodes` |
| `DramaCanvas` | `nodes` 引用变化，画布重渲染 |
| `SceneDetailPanel` | 选中节点对象引用变化，整块表单重渲染 |
| `PreviewModal`（关闭状态仍挂载） | 订阅 `nodes / edges`，重新跑 `getPreviewSequence` 拓扑排序 |

每拖一帧就要让画布 + 侧边栏 + 隐藏的预览弹窗各跑一次渲染。DevTools 把每次渲染的常数成本提升一档之后，叠加起来就从 60fps 掉到肉眼可见的卡顿。

---

### ✅ 修复方案

核心思路：**拖拽中的瞬时位置只放画布本地状态，不进全局 store；与拖拽无关的订阅者不该被 position 变化牵连。**

修改集中在三个文件：

#### 1. `src/components/Canvas/DramaCanvas.tsx`：拖拽帧改为本地状态

```ts
const storeNodes = useDramaStore((s) => s.nodes);
const persistNodesChange = useDramaStore((s) => s.onNodesChange);
const [localNodes, setLocalNodes] = useState<(SceneNode | TextNode)[]>(storeNodes);

useEffect(() => {
  setLocalNodes(storeNodes);
}, [storeNodes]);

const onNodesChange = useCallback<typeof persistNodesChange>(
  (changes) => {
    setLocalNodes((nodes) => applyNodeChanges(changes, nodes) as (SceneNode | TextNode)[]);

    // 拖拽中的 position 变更不进 store；
    // 拖拽结束（dragging === false）和其他类型变更才持久化
    const persistedChanges = changes.filter((change) => {
      if (change.type !== 'position') return true;
      return change.dragging === false;
    });

    if (persistedChanges.length > 0) {
      persistNodesChange(persistedChanges);
    }
  },
  [persistNodesChange]
);
```

效果：

- 拖拽过程中 store 的 `nodes` 引用保持不变，其他订阅者不再每帧重渲染
- 拖拽结束的最终位置仍会进 store + 历史快照，撤销/重做行为不变
- 增删节点等非 position 变更照常下发

#### 2. `src/components/Sidebar/SceneDetailPanel.tsx`：缩小订阅粒度

```ts
// ❌ 原写法：选中整个节点对象，position 变化也会触发重渲染
const selectedNode = useDramaStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId));

// ✅ 新写法：只订阅当前选中"场景节点"的 data
const selectedSceneData = useDramaStore((s) => {
  const node = s.nodes.find((n) => n.id === s.selectedNodeId);
  return node?.type === 'scene' ? node.data : null;
});
```

zustand 默认按引用相等做 bail-out。缩小订阅到 `data` 之后，position 变化拿到的还是同一个 `data` 引用，面板就不会再被牵着走。

#### 3. `src/App.tsx`：预览弹窗按需挂载

```tsx
{/* ❌ 原写法：始终挂载，关闭时也订阅 nodes/edges 并跑 getPreviewSequence */}
<PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />

{/* ✅ 新写法：仅在打开时挂载 */}
{previewOpen && <PreviewModal open onClose={() => setPreviewOpen(false)} />}
```

`PreviewModal` 内部用 `useMemo(() => getPreviewSequence(nodes, edges), [nodes, edges])` 做拓扑排序，关闭时也会跟着 `nodes` 变化重算。改成按需挂载后，关闭状态下完全不参与渲染。

---

### 🎯 经验教训

> **"DevTools 打开才卡"通常不是 DevTools 的锅，而是它把每帧的隐藏成本放大到了显示阈值之上。**
>
> 涉及高频事件（拖拽、滚动、resize）的状态管理：
> - 把"中间态"放本地、把"最终态"放全局 store —— 这是拖拽类交互的通用解法
> - 订阅时用最小粒度（具体字段而不是整个对象），避开无关属性变化引起的重渲染
> - 不可见的组件别让它常驻订阅 —— 关闭的 modal、隐藏的面板都是潜伏的性能税
