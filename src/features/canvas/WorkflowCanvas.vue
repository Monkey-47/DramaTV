<script setup lang="ts">
import type { Connection, NodeDragEvent, GraphNode as VfGraphNode } from '@vue-flow/core'
import type { NodeRenderMeta, RenderNodeTypeMap } from './mapping.types'
import type { MenuSection } from './node-menu'
import type { Workflow, WorkflowGraph } from '@/features/graph/graph.types'
/**
 * 画布组件 —— 唯一允许 import @vue-flow/* 的地方（见设计文档 §6.1）。
 *
 * 多工作流模式：每个 workflow 一个 GroupNode，子节点 parentNode 锁定、
 * extent='parent' 限定在分区内，跨分区连线被 isValidConnection 拒绝。
 *
 * 这个组件不认识应用级 store —— 用户操作一律 emit 出去，由 view 层决定怎么改状态。
 *
 * 交互方案（框选 vs 平移）：
 *   Shift + 左键拖  = 框选（Vue Flow 的 selectionKeyCode 默认 Shift）
 *   中键/右键拖     = 平移（panOnDrag: [1, 2]）
 *   空格 + 左键拖   = 平移（panActivationKeyCode 默认 Space）
 *
 * 为什么框选要按 Shift：@vue-flow/core 1.48.2 **没有** selectionOnDrag 这个 prop
 * （全库搜不到该标识符）。Pane 的 onPointerDown 里实际的条件是
 * `elementsSelectable && isSelecting && button === 0 && target === container`，
 * 其中 isSelecting 只由 selectionKeyCode 派生的按键状态驱动。
 * 也就是说这一版不按住修饰键就没有框选，想改成"左键直接框选"只能绕开库的内部接线，
 * 太脆。所以按库的能力来，并把它显式写出来 + 在画布上给出提示。
 */
import { Panel, useVueFlow, VueFlow } from '@vue-flow/core'
import { computed, markRaw, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { isPortTypeCompatible } from '@/features/graph/port'
import { getLod, ZOOM } from '@/shared/constants/theme'
import { CANVAS_ACTIONS } from './canvas-actions'
import CanvasNode from './CanvasNode.vue'
import GroupNode from './GroupNode.vue'
import { renderGraph, renderProject } from './mapping'
import { buildNodeMenu, menuContextFrom } from './node-menu'
import NodeContextMenu from './NodeContextMenu.vue'
import { isCrossWorkflowEdge } from './partition'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

interface Props {
  /** type → 节点类型定义，由 view 从注册表取（registry.buildNodeTypeMap()） */
  nodeTypes: RenderNodeTypeMap
  meta?: Record<string, NodeRenderMeta>
  workflows?: Workflow[]
  graph?: WorkflowGraph
}

const props = defineProps<Props>()

const emit = defineEmits<{
  nodeMove: [payload: { workflowId: string, nodeId: string, position: { x: number, y: number } }]
  nodeRemove: [nodeIds: string[]]
  workflowAdd: []
  workflowMove: [payload: { workflowId: string, position: { x: number, y: number } }]
  workflowRemove: [workflowId: string]
  workflowRename: [payload: { workflowId: string, name: string }]
  openNodeConfig: [nodeId: string]
  openNodeCandidates: [nodeId: string]
  // 右键菜单的动作。key 与 node-menu.ts 的 MenuItem.key 一一对应，
  // 由 view 层翻译成 store 操作。
  runNode: [nodeId: string]
  stopNode: [nodeId: string]
  adoptFrozen: [nodeId: string]
  unfreezeNode: [nodeId: string]
  retryNode: [nodeId: string]
  viewRunHistory: [nodeId: string]
  viewErrorLog: [nodeId: string]
  duplicateNode: [nodeId: string]
  renameNode: [nodeId: string]
  copyNodeParams: [nodeId: string]
  removeNode: [nodeId: string]
}>()

const { viewport, getSelectedNodes } = useVueFlow()
const lodClass = computed(() => `lod-${getLod(viewport.value.zoom)}`)

// ── 右键菜单 ──────────────────────────────────────────────────────────────
//
// 菜单状态放在这里而不是节点组件里：菜单要浮在画布之上、不能被节点边界裁剪，
// 而且它需要读节点的运行态（props.meta），那是画布手上的数据。

const menuNodeId = ref<string | undefined>(undefined)
const menuOpen = ref(false)
const menuPos = ref({ x: 0, y: 0 })

function openNodeMenu(nodeId: string, clientX: number, clientY: number): void {
  menuNodeId.value = nodeId
  menuPos.value = { x: clientX, y: clientY }
  menuOpen.value = true
}

/** 从图里找节点的定义态（只有 adopted 是菜单关心的） */
function adoptedOf(nodeId: string): { frozen: boolean } | undefined {
  const node = props.workflows?.flatMap(wf => wf.graph.nodes).find(n => n.id === nodeId)
  return node?.adopted
}

const menuSections = computed<MenuSection[]>(() => {
  const nodeId = menuNodeId.value
  if (nodeId === undefined)
    return []
  return buildNodeMenu(menuContextFrom({
    ...(props.meta?.[nodeId] !== undefined ? { meta: props.meta[nodeId] } : {}),
    ...(adoptedOf(nodeId) !== undefined ? { adopted: adoptedOf(nodeId) } : {}),
  }))
})

/**
 * 菜单 key → 动作。
 *
 * 表里直接放 emit 调用而不是事件名：事件名组成的联合类型在 emit() 的重载
 * 解析里会失败（TS 无法把联合 key 对应回正确的 payload 元组）。
 *
 * 这样也把「菜单加了项但忘了接线」集中在同一处 —— 漏了就是表里少一个键。
 */
const MENU_ACTIONS: Record<string, (nodeId: string) => void> = {
  runNode: nodeId => emit('runNode', nodeId),
  stopNode: nodeId => emit('stopNode', nodeId),
  adoptFrozen: nodeId => emit('adoptFrozen', nodeId),
  unfreezeNode: nodeId => emit('unfreezeNode', nodeId),
  retryNode: nodeId => emit('retryNode', nodeId),
  viewRunHistory: nodeId => emit('viewRunHistory', nodeId),
  viewErrorLog: nodeId => emit('viewErrorLog', nodeId),
  duplicateNode: nodeId => emit('duplicateNode', nodeId),
  renameNode: nodeId => emit('renameNode', nodeId),
  copyNodeParams: nodeId => emit('copyNodeParams', nodeId),
  removeNode: nodeId => emit('removeNode', nodeId),
  // 候选面板在画布上已有独立入口，这里复用既有的动作而不是再加一个事件
  openCandidates: nodeId => emit('openNodeCandidates', nodeId),
}

function onMenuSelect(key: string): void {
  const nodeId = menuNodeId.value
  if (nodeId === undefined)
    return
  MENU_ACTIONS[key]?.(nodeId)
}

// 分区标题和节点主体上的交互由 Vue Flow 渲染的节点组件触发，
// 它们的 emit 不会冒泡到这里 —— 所以走 provide/inject。
provide(CANVAS_ACTIONS, {
  removeWorkflow: (workflowId: string) => emit('workflowRemove', workflowId),
  renameWorkflow: (workflowId: string, name: string) => emit('workflowRename', { workflowId, name }),
  addWorkflow: () => emit('workflowAdd'),
  openNodeConfig: (nodeId: string) => emit('openNodeConfig', nodeId),
  openNodeCandidates: (nodeId: string) => emit('openNodeCandidates', nodeId),
  openNodeMenu,
  runNode: (nodeId: string) => emit('runNode', nodeId),
  stopNode: (nodeId: string) => emit('stopNode', nodeId),
  adoptFrozen: (nodeId: string) => emit('adoptFrozen', nodeId),
  unfreezeNode: (nodeId: string) => emit('unfreezeNode', nodeId),
  retryNode: (nodeId: string) => emit('retryNode', nodeId),
  viewRunHistory: (nodeId: string) => emit('viewRunHistory', nodeId),
  viewErrorLog: (nodeId: string) => emit('viewErrorLog', nodeId),
  duplicateNode: (nodeId: string) => emit('duplicateNode', nodeId),
  renameNode: (nodeId: string) => emit('renameNode', nodeId),
  copyNodeParams: (nodeId: string) => emit('copyNodeParams', nodeId),
  removeNode: (nodeId: string) => emit('removeNode', nodeId),
})

/**
 * Vue Flow 的 `:node-types` 要的是「节点 type → Vue 组件」，和 `props.nodeTypes`
 * （节点 type → RenderNodeDefinition，是给 mapping.ts 查定义用的）不是同一回事。
 * 名字撞在一起容易改错，所以这里叫 `vueFlowNodeTypes`。
 */
const vueFlowNodeTypes = { 'canvas-node': markRaw(CanvasNode), 'group-node': markRaw(GroupNode) }

interface RenderedOutput {
  groupNodes: import('./mapping.types').VueFlowGroupNode[]
  nodes: import('./mapping.types').VueFlowNode[]
  edges: import('./mapping.types').VueFlowEdge[]
}

const rendered = computed<RenderedOutput>(() => {
  if (props.workflows) {
    return renderProject({
      workflows: props.workflows,
      nodeTypes: props.nodeTypes,
      ...(props.meta !== undefined ? { meta: props.meta } : {}),
    })
  }
  if (props.graph) {
    const input = props.meta !== undefined
      ? { graph: props.graph, nodeTypes: props.nodeTypes, meta: props.meta }
      : { graph: props.graph, nodeTypes: props.nodeTypes }
    const r = renderGraph(input)
    return { groupNodes: [], nodes: r.nodes, edges: r.edges }
  }
  return { groupNodes: [], nodes: [], edges: [] }
})

const allNodes = computed(() => [
  ...rendered.value.groupNodes,
  ...rendered.value.nodes,
])

function isValidConnection(connection: Connection): boolean {
  if (!props.workflows)
    return true
  const edge = {
    id: '__tmp__',
    source: { nodeId: connection.source, portId: connection.sourceHandle ?? '' },
    target: { nodeId: connection.target, portId: connection.targetHandle ?? '' },
  }
  if (isCrossWorkflowEdge(edge, props.workflows))
    return false

  // 端口类型校验
  const sourceNode = props.workflows.flatMap(wf => wf.graph.nodes).find(n => n.id === connection.source)
  const targetNode = props.workflows.flatMap(wf => wf.graph.nodes).find(n => n.id === connection.target)
  if (!sourceNode || !targetNode)
    return false

  const sourcePorts = props.nodeTypes[sourceNode.type]?.outputs ?? []
  const targetPorts = props.nodeTypes[targetNode.type]?.inputs ?? []
  const sourceType = sourcePorts.find(p => p.id === connection.sourceHandle)?.type ?? 'any'
  const targetType = targetPorts.find(p => p.id === connection.targetHandle)?.type ?? 'any'

  return isPortTypeCompatible(sourceType, targetType)
}

/**
 * 拖动结束才回写，避免拖动过程中每帧都往 store 写。
 *
 * 子节点带 parentNode，Vue Flow 给的 node.position 已经是 **父分区内的相对坐标**，
 * 正好是 store 要的坐标系，不需要再换算（换算只允许在 canvas 内做，见 §6.1，
 * 而这里拿到的就已经是相对值，等于不需要换算）。
 */
function onNodeDragStop({ node }: NodeDragEvent): void {
  const parentId = node.parentNode
  if (typeof parentId === 'string' && parentId.length > 0) {
    emit('nodeMove', {
      workflowId: parentId,
      nodeId: node.id,
      position: { x: node.position.x, y: node.position.y },
    })
    return
  }
  // 没有父节点 = 拖的是分区本身，位置属于 placement 而非节点
  if (!props.workflows?.some(wf => wf.id === node.id))
    return
  emit('workflowMove', {
    workflowId: node.id,
    position: { x: node.position.x, y: node.position.y },
  })
}

/**
 * Vue Flow 的 d.ts 把 getSelectedNodes 声明成 `GraphNode[]`，但运行时它是 ComputedRef
 * （源码里就是 `getSelectedNodes.value` 在用）。这里按运行时实际形状取。
 */
const selectedNodes = computed<VfGraphNode[]>(() => {
  const raw = getSelectedNodes as unknown as { value?: VfGraphNode[] } | VfGraphNode[]
  return Array.isArray(raw) ? raw : (raw.value ?? [])
})

/**
 * 删除选中节点。刻意不用 Vue Flow 内建的删除 —— 它只改画布内部状态，
 * 而我们的 nodes prop 才是真源，下次 prop 更新会把删掉的节点又渲染回来。
 * 所以这里只发意图，由 store 改状态，再经 prop 回流。
 * （因此 VueFlow 上设了 :delete-key-code="null" 关掉内建删除。）
 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Delete' && e.key !== 'Backspace')
    return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
    return

  const ids = selectedNodes.value.filter(n => n.parentNode).map(n => n.id)
  if (ids.length === 0)
    return

  e.preventDefault()
  emit('nodeRemove', ids)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="canvas-host" :class="[lodClass]">
    <VueFlow
      :nodes="allNodes"
      :edges="rendered.edges"
      :node-types="vueFlowNodeTypes"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :min-zoom="ZOOM.min"
      :max-zoom="ZOOM.max"
      :pan-on-drag="[1, 2]"
      selection-key-code="Shift"
      :pan-on-scroll="false"
      :zoom-on-scroll="false"
      :zoom-on-pinch="true"
      :zoom-on-double-click="false"
      :nodes-draggable="true"
      :nodes-connectable="true"
      :elements-selectable="true"
      :delete-key-code="null"
      :is-valid-connection="isValidConnection"
      fit-view-on-init
      class="vue-flow-dark"
      @node-drag-stop="onNodeDragStop"
    >
      <Panel v-if="props.workflows" position="bottom-left" class="canvas-panel">
        <button class="add-workflow" type="button" @click="emit('workflowAdd')">
          + 新建工作流
        </button>
        <span class="canvas-hint">Shift + 拖拽 框选 · 中键/右键 平移 · 拖动标题栏 移动分区 · 右键节点 更多操作 · Delete 删除</span>
      </Panel>
    </VueFlow>

    <!-- 菜单 teleport 到 body，避免被画布的 overflow 裁掉 -->
    <NodeContextMenu
      :open="menuOpen"
      :sections="menuSections"
      :x="menuPos.x"
      :y="menuPos.y"
      @select="onMenuSelect"
      @close="menuOpen = false"
    />
  </div>
</template>

<style scoped>
.canvas-host {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #131316;
  background-image: radial-gradient(circle, #26262c 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: 0 0;
}

.canvas-host :deep(.vue-flow) {
  background: transparent;
}

.canvas-host :deep(.vue-flow__edge-path) {
  stroke-width: 3;
}

.canvas-host :deep(.vue-flow__edge) {
  pointer-events: stroke;
}

/* 框选矩形 */
.canvas-host :deep(.vue-flow__selection) {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.6);
}

/* 注：分区节点的 pointer-events 不能在这里写 —— Vue Flow 会给节点元素
   写内联的 pointer-events，样式表压不过内联。见 mapping.ts 的 renderProject()。 */

.canvas-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px;
}

.canvas-hint {
  color: #52525b;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  font-size: 10px;
  user-select: none;
}

.add-workflow {
  padding: 6px 12px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: 5px;
  color: #d4d4d8;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  font-size: 11px;
  cursor: pointer;
}

.add-workflow:hover {
  background: #2e2e32;
  border-color: #6366f1;
  color: #e4e4e7;
}

/* LOD：远景下隐藏次要文字与进度条，按规范 §4.2
   选择器用 .node-shell / .label —— 那是 NodeShell 里的真实类名。
   （早先这里写的是 .canvas-node / .title，两个类都已经不存在，等于没生效。） */
.lod-far :deep(.node-shell .summary),
.lod-far :deep(.node-shell .progress),
.lod-far :deep(.node-shell .badge) {
  display: none;
}

.lod-far :deep(.node-shell) {
  padding: 3px 6px;
  border-width: 1px;
}

.lod-far :deep(.node-shell .label) {
  font-size: 9px;
}
</style>
