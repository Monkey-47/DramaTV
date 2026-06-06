# 历史记录（undo/redo）重构方案

> 状态：**待决策**。本文档只描述方案，未改动任何代码。
> 关联问题：代码结构审查 #3。

## 背景：当前实现

`src/store/useDramaStore.ts` 用「命令式快照」实现 undo/redo：

- `saveHistory()` 把当前 `nodes / edges` 整体深拷贝后压入 `history` 栈。
- 每个会修改状态的 action（`addSceneNode` / `addTextNode` / `addImageNode` / `deleteNode` / `onConnect` / `onNodesChange` / `onEdgesChange` / `autoLayout`）在 `set(...)` 之后**手动调用** `saveHistory()`。
- `undo / redo` 通过移动 `historyIndex`，再把对应快照深拷贝回 `nodes / edges`。

深拷贝统一用 `JSON.parse(JSON.stringify(...))`。

## 两个结构性问题

### 1. `saveHistory()` 靠手动调用，容易漏 / 容易错位

目前有 9 处手动调用（store 内 `saveHistory()` 出现的位置）。新增 action 时必须记得在 `set` **之后**补一次调用——

- 漏调 → 该操作不进历史，undo 跳过它，行为不一致。
- 调用时机错位（`set` 之前调）→ 快照落后一步，正是之前修过的「redo 丢失最新变更」那类 bug（见 `DEVLOG.md` 2026-06-04）。

约束散落在每个 action 里、靠注释提醒，属于「靠纪律维持正确性」，不是「结构上不可能出错」。

### 2. `JSON.parse(JSON.stringify(...))` 全量深拷贝

- 每次存档/撤销/重做都把**整个**节点+边数组序列化再反序列化。节点数量增长后是线性开销，拖拽结束、连线、删除等高频操作都会触发。
- `JSON` 方案会丢失 `undefined`、`Map/Set`、`Date`、函数等。当前数据结构是纯 JSON-safe 的，暂时没踩坑，但这是个**隐性约束**：以后往 node data 里塞个 `Date` 或 `undefined` 字段就会静默出错。

## 方案对比

### 方案 A：抽一个 `withHistory()` 包装器（推荐，改动小）

把「执行 mutation → 存档」收敛成一个高阶函数，action 只描述「怎么改」，存档由包装器统一负责。

```ts
// 伪代码
const withHistory = <T extends unknown[]>(mutator: (...args: T) => void) => {
  return (...args: T) => {
    mutator(...args);   // 内部只管 set(...)
    saveHistory();      // 统一在这里存档，时机固定且不可能漏
  };
};

// 用法
addTextNode: withHistory((position) => {
  set((state) => { state.nodes.push(makeTextNode(position)); });
}),
```

- **优点**：彻底消除「忘记调 / 调错位置」；调用点从 9 处收敛到 1 处；改动局部，风险可控。
- **注意**：`onNodesChange` 这类**条件存档**（只在拖拽结束、增删时存）不适合无脑包装，需要保留它自己的判断逻辑，或给包装器加一个「是否存档」的谓词参数。

### 方案 B：换 zustand middleware 做自动历史（改动中等）

用 `zundo`（zustand 的 temporal middleware）或自写 middleware，订阅 `nodes / edges` 变化自动入栈。

- **优点**：action 完全不感知历史，最干净。
- **缺点**：引入新依赖 / 新心智模型；「拖拽中间帧不入栈、只在拖拽结束入栈」这类节流逻辑需要额外配置（partialize + 防抖），否则历史栈会被拖拽过程灌满。和现有「条件存档」语义对齐需要调试。

### 方案 C：优化深拷贝（可与 A/B 叠加）

- 项目已装 `immer`。可以用 `structuredClone`（现代浏览器原生，支持 Date/Map/Set）替换 `JSON.parse(JSON.stringify())`，顺手解决隐性约束。
- 或基于 immer 的结构共享做「只存 patch（diff）」而非整树快照，内存和耗时都更优，但实现复杂度最高。

## 建议

1. **先做方案 A + 方案 C 的 `structuredClone` 部分**：收益明确（消除漏调风险 + 去掉 JSON 隐性约束），改动可控，不引新依赖。
2. 方案 B / patch-based 历史留到节点规模真正变大、或历史需求变复杂（如分支历史）时再上。

## 影响面

- 改动集中在 `src/store/useDramaStore.ts` 一个文件。
- 对外行为（undo/redo 的可见效果）应保持不变——这点必须有回归验证：新增节点→撤销→重做、删除→撤销、拖拽结束→撤销、连线→撤销 这几条路径逐一过一遍。
- 当前无测试框架，验证暂时只能手动 + `npm run build`。若要动历史逻辑，建议同时补一个针对 store 的最小单元测试（Vitest），把上述路径固化下来。
