<script setup lang="ts">
import type { NodeRenderMeta } from '@/features/canvas/mapping.types'
import type { WorkflowPlacement } from '@/features/graph/graph.types'
import type { RunScope } from '@/features/runner/runner.types'
import type { NodeRunEntry } from '@/features/runs/NodeRunsPanel.vue'
import { darkTheme, NConfigProvider } from 'naive-ui'
/**
 * 画布页面 —— 装配面。
 *
 * 三条状态线在这里交汇，但彼此不交叉：
 *   - project store：工作流、节点位置与参数 —— 用户编辑的图（定义态，会持久化）
 *   - runner store：run / 节点运行状态 —— 执行产生的结果（运行态，不持久化）
 *   - 持久化 composable：把定义态自动存进 localStorage
 *
 * 这个 view 只做接线和意图翻译，不写业务逻辑。
 */
import { computed, ref } from 'vue'
import CandidatePanel from '@/features/assets/CandidatePanel.vue'
import { resolveOutput } from '@/features/assets/output'
import { computeWorkflowSize } from '@/features/canvas/partition'
import WorkflowCanvas from '@/features/canvas/WorkflowCanvas.vue'
import { buildNodeTypeMap, getNodeType } from '@/features/nodes'
import NodeConfigModal from '@/features/nodes/NodeConfigModal.vue'
import NodeRenameDialog from '@/features/nodes/NodeRenameDialog.vue'
import { useProjectPersistence } from '@/features/project/useProjectPersistence'
import { useRunner } from '@/features/runner/useRunner'
import NodeRunsPanel from '@/features/runs/NodeRunsPanel.vue'
import AppTopBar from '@/shared/components/AppTopBar.vue'
import { useProjectStore } from '@/stores/project.store'
import { useRunnerStore } from '@/stores/runner.store'

/** P1 单项目。多项目是后续的事。 */
const PROJECT_ID = 'proj_local'

/**
 * Naive UI 主题覆盖。
 *
 * 主要修两件事：
 * - **圆角**：Naive 默认 3px，在深色高对比界面上太硬。容器用大圆角，控件用中圆角。
 * - **字号**：Naive 默认正文 14px、小号 12px，但落在嵌套控件里会偏小；
 *   统一抬到 13/12，和 tokens.css 的阅读档对齐。
 *
 * 这里用字面 px 而不是 CSS 变量：Naive 内部会对这些值做字符串拼接（如
 * `radius + ' 0 0 ' + radius`），喂 var() 虽然大多能work但边界情况容易出怪值。
 */
const themeOverrides = {
  common: {
    fontFamily: 'var(--font-ui)',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontSize: '13px',
    fontSizeSmall: '12px',
    fontSizeMedium: '13px',
    fontSizeLarge: '15px',
    fontSizeHuge: '17px',
  },
  Card: {
    borderRadius: '14px',
  },
  Dialog: {
    borderRadius: '14px',
  },
  Input: {
    borderRadius: '8px',
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '6px',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px',
      },
    },
  },
}

const store = useProjectStore()
const runnerStore = useRunnerStore()
const runner = useRunner(PROJECT_ID)

// 草稿自动保存 + 首屏灌入（设计文档 §5.6 / MVP 1.18）
useProjectPersistence(PROJECT_ID)

const nodeTypes = buildNodeTypeMap()

/**
 * 把「按 workflowId 取图」的能力注入 runner store。
 *
 * reducer 的失败传播（设计文档 §4.4：失败节点的下游全部 skipped）需要图结构，
 * 但 runner store 不该 import project store（会形成双向依赖）。所以由这里注入。
 */
runnerStore.setGraphResolver(workflowId => store.findWorkflow(workflowId)?.graph)

// ── 节点弹窗 ──────────────────────────────────────────────────────────────
//
// 单击节点 → 配置弹窗；双击 → 候选面板。双击时浏览器会先派发两次 click，
// 所以打开候选面板要顺手关掉配置弹窗，否则两个弹窗会叠在一起。

const configNodeId = ref<string | undefined>(undefined)
const candidatesNodeId = ref<string | undefined>(undefined)

/**
 * 「弹窗可见」与「当前编辑哪个节点」必须分成两个状态。
 *
 * 合成一个的话会有个隐蔽的动画 bug：关闭时 id 立刻变 undefined，
 * 派生出来的 definition / params 跟着变空，表单内容当场卸载 ——
 * 盒子高度先塌成一条，缩放动画才作用在这个小矩形上，
 * 看起来就是「突然塌成一块」而不是「从当前大小缩回去」。
 *
 * 所以关闭只置 visible=false，等 `after-leave`（动画真正结束）再清 id。
 */
const configOpen = ref(false)
const candidatesOpen = ref(false)

function nodeOf(id: string | undefined) {
  if (id === undefined) {
    return undefined
  }
  return store.findWorkflowByNodeId(id)?.graph.nodes.find(n => n.id === id)
}

function runStateOf(id: string | undefined) {
  if (id === undefined) {
    return undefined
  }
  const wf = store.findWorkflowByNodeId(id)
  return wf === undefined ? undefined : runnerStore.nodeStatesFor(wf.id)[id]
}

const configNode = computed(() => nodeOf(configNodeId.value))
const configDefinition = computed(() => {
  const node = configNode.value
  return node === undefined ? undefined : getNodeType(node.type)
})
const configRunState = computed(() => runStateOf(configNodeId.value))
const configParams = computed(() => configNode.value?.data ?? {})

/**
 * 已经连上线的输入端口 id。
 *
 * 「必填输入没连线」是节点跑不起来最常见的原因，配置弹窗要能直接指出来。
 * `Port` 本身不带连接状态（它只是端口声明），所以连接信息得从图里的边算。
 */
const configConnectedPortIds = computed<readonly string[]>(() => {
  const id = configNodeId.value
  const wf = id === undefined ? undefined : store.findWorkflowByNodeId(id)
  if (wf === undefined || id === undefined) {
    return []
  }
  return wf.graph.edges.filter(e => e.target.nodeId === id).map(e => e.target.portId)
})

function onOpenNodeConfig(nodeId: string): void {
  candidatesOpen.value = false
  candidatesNodeId.value = undefined
  configNodeId.value = nodeId
  configOpen.value = true
}

function onOpenNodeCandidates(nodeId: string): void {
  configOpen.value = false
  configNodeId.value = undefined
  candidatesNodeId.value = nodeId
  candidatesOpen.value = true
}

/** 关闭配置弹窗：先触发动画，内容等 after-leave 再卸 */
function onConfigClose(): void {
  configOpen.value = false
}

function onConfigAfterLeave(): void {
  configNodeId.value = undefined
}

function onCandidatesClose(): void {
  candidatesOpen.value = false
}

function onCandidatesAfterLeave(): void {
  candidatesNodeId.value = undefined
}

// ── 配置弹窗的动作 ────────────────────────────────────────────────────────

function withNode(fn: (workflowId: string, nodeId: string) => void, nodeId: string | undefined): void {
  if (nodeId === undefined) {
    return
  }
  const wf = store.findWorkflowByNodeId(nodeId)
  if (wf === undefined) {
    return
  }
  fn(wf.id, nodeId)
}

function onParamUpdate(key: string, value: unknown): void {
  withNode((wfId, nodeId) => store.setNodeParam(wfId, nodeId, key, value), configNodeId.value)
}

function onApplyPreset(preset: { params: Record<string, unknown> }): void {
  withNode((wfId, nodeId) => store.setNodeParams(wfId, nodeId, preset.params), configNodeId.value)
}

// ── 候选面板的动作 ────────────────────────────────────────────────────────

const candidatesNode = computed(() => nodeOf(candidatesNodeId.value))
const candidatesOutput = computed(() => {
  const node = candidatesNode.value
  return node === undefined ? undefined : resolveOutput(node, runStateOf(candidatesNodeId.value))
})
/** 显示名优先级与画布一致：用户起的别名 > 类型定义 label > 类型 key */
const candidatesLabel = computed(() => {
  const node = candidatesNode.value
  if (node === undefined) {
    return ''
  }
  return node.label ?? getNodeType(node.type)?.label ?? node.type
})
const candidatesRunState = computed(() => runStateOf(candidatesNodeId.value))
const candidatesWorkflowName = computed(() => {
  const id = candidatesNodeId.value
  return id === undefined ? undefined : store.findWorkflowByNodeId(id)?.name
})

/** 候选还没出来但节点在跑 —— 用来显示"正在生成"而不是"还没有产出" */
const candidatesBusy = computed(() => {
  const status = candidatesRunState.value?.status
  return status === 'running' || status === 'queued' || status === 'pending'
})

function onAdopt(assetId: string): void {
  withNode((wfId, nodeId) => store.adoptCandidate(wfId, nodeId, assetId), candidatesNodeId.value)
}

function onFreeze(): void {
  withNode((wfId, nodeId) => store.setFrozen(wfId, nodeId, true), candidatesNodeId.value)
}

function onUnfreeze(): void {
  withNode((wfId, nodeId) => store.setFrozen(wfId, nodeId, false), candidatesNodeId.value)
}

/**
 * 只跑一个节点。候选面板的「运行」和右键菜单的「运行此节点」/「重试运行」
 * 都是这一件事，所以只有一份实现。
 *
 * 上游不重新执行，直接取缓存产出喂进来 —— 这是设计文档 §4.3 说的
 * 「断点续跑是地基」：用户只跑这一步时，上游会以「复用」标记回填。
 */
async function submitNodeScope(nodeId: string): Promise<void> {
  const wf = store.findWorkflowByNodeId(nodeId)
  if (wf === undefined) {
    return
  }
  await runner.submit(wf.id, { kind: 'node', nodeIds: [nodeId] }, wf.graph)
}

function onRunCandidatesNode(): void {
  const id = candidatesNodeId.value
  if (id !== undefined) {
    void submitNodeScope(id)
  }
}

// ── 右键菜单的动作 ────────────────────────────────────────────────────────

function onRunNode(nodeId: string): void {
  void submitNodeScope(nodeId)
}

/** 重试和重跑是同一个动作。是否该允许重试由后端标记决定（设计 §4.5） */
function onRetryNode(nodeId: string): void {
  void submitNodeScope(nodeId)
}

/** 停掉该节点所在工作流的运行。run 是工作流级的，节点没有独立的取消端点 */
function onStopNode(nodeId: string): void {
  const wf = store.findWorkflowByNodeId(nodeId)
  if (wf === undefined) {
    return
  }
  for (const runId of [...runnerStore.activeRunIds]) {
    if (runnerStore.runs[runId]?.workflowId === wf.id) {
      void runner.cancel(runId)
    }
  }
}

function onAdoptFrozen(nodeId: string): void {
  withNode((wfId, id) => store.setFrozen(wfId, id, true), nodeId)
}

function onUnfreezeNode(nodeId: string): void {
  withNode((wfId, id) => store.setFrozen(wfId, id, false), nodeId)
}

function onDuplicateNode(nodeId: string): void {
  withNode((wfId, id) => {
    store.duplicateNode(wfId, id)
  }, nodeId)
}

/** 复制参数 JSON，方便贴到别处或对比两次实验的差异 */
async function onCopyNodeParams(nodeId: string): Promise<void> {
  const node = nodeOf(nodeId)
  if (node === undefined) {
    return
  }
  const payload = JSON.stringify(
    {
      type: node.type,
      ...(node.label !== undefined ? { label: node.label } : {}),
      data: node.data,
    },
    null,
    2,
  )
  try {
    await navigator.clipboard.writeText(payload)
    showNotice('参数已复制到剪贴板')
  }
  catch {
    // 非安全上下文（http）或用户拒绝授权时会走到这里
    showNotice('复制失败：浏览器拒绝了剪贴板访问')
  }
}

/** 短暂的顶部提示。失败与成功共用一条，靠文案区分 */
const notice = ref<string | undefined>(undefined)
let noticeTimer: ReturnType<typeof setTimeout> | undefined

function showNotice(text: string): void {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = undefined
  }, 2600)
}

// ── 重命名 ────────────────────────────────────────────────────────────────

const renameNodeId = ref<string | undefined>(undefined)
const renameOpen = ref(false)

const renameCurrent = computed(() => {
  const node = nodeOf(renameNodeId.value)
  if (node === undefined) {
    return ''
  }
  return node.label ?? getNodeType(node.type)?.label ?? node.type
})

const renameTypeLabel = computed(() => {
  const node = nodeOf(renameNodeId.value)
  return node === undefined ? '' : (getNodeType(node.type)?.label ?? node.type)
})

function onRenameNode(nodeId: string): void {
  renameNodeId.value = nodeId
  renameOpen.value = true
}

function onRenameConfirm(label: string): void {
  withNode((wfId, id) => store.setNodeLabel(wfId, id, label), renameNodeId.value)
  renameOpen.value = false
}

function onRenameAfterLeave(): void {
  renameNodeId.value = undefined
}

// ── 运行历史 / 错误日志 ───────────────────────────────────────────────────

const historyNodeId = ref<string | undefined>(undefined)
const historyOpen = ref(false)

function onViewRunHistory(nodeId: string): void {
  historyNodeId.value = nodeId
  historyOpen.value = true
}

/** 「查看错误日志」和「查看历史运行」开同一个面板 —— 错误本来就是某次运行的属性 */
function onViewErrorLog(nodeId: string): void {
  onViewRunHistory(nodeId)
}

function onHistoryAfterLeave(): void {
  historyNodeId.value = undefined
}

/**
 * 这个节点在**本次会话**里跑过的每一次。
 *
 * 只呈现真实存在的数据：真实历史要靠 `GET /workflows/:id/runs`（设计文档 §4.5），
 * 而后端还没实现。宁可如实说「只有本次会话」，也不造一份假历史。
 */
const historyEntries = computed<NodeRunEntry[]>(() => {
  const id = historyNodeId.value
  if (id === undefined) {
    return []
  }
  const wf = store.findWorkflowByNodeId(id)
  if (wf === undefined) {
    return []
  }

  const out: NodeRunEntry[] = []
  for (const run of Object.values(runnerStore.runs)) {
    if (run.workflowId !== wf.id) {
      continue
    }
    const ns = run.nodes[id]
    if (ns === undefined) {
      continue
    }
    out.push({
      runId: run.id,
      runStatus: run.status,
      scopeText: scopeText(run.scope),
      nodeStatus: ns.status,
      reused: ns.reused === true,
      ...(ns.progress !== undefined ? { progress: ns.progress } : {}),
      candidateCount: ns.candidates.length,
      ...(ns.error !== undefined ? { error: ns.error } : {}),
      ...(ns.startedAt !== undefined ? { startedAt: ns.startedAt } : {}),
      ...(ns.finishedAt !== undefined ? { finishedAt: ns.finishedAt } : {}),
    })
  }
  return out
})

const historyLabel = computed(() => {
  const node = nodeOf(historyNodeId.value)
  if (node === undefined) {
    return ''
  }
  return node.label ?? getNodeType(node.type)?.label ?? node.type
})

function scopeText(scope: RunScope): string {
  switch (scope.kind) {
    case 'node': return `单节点（${scope.nodeIds.length} 个）`
    case 'downstream': return '从此节点往下'
    case 'workflow': return '整图'
  }
}

// ── 运行态 → 画布渲染 meta ────────────────────────────────────────────────

const meta = computed<Record<string, NodeRenderMeta>>(() => {
  const out: Record<string, NodeRenderMeta> = {}
  for (const wf of store.workflows) {
    for (const [nodeId, state] of Object.entries(runnerStore.nodeStatesFor(wf.id))) {
      const node = wf.graph.nodes.find(n => n.id === nodeId)
      out[nodeId] = {
        status: state.status,
        ...(state.progress !== undefined ? { progress: state.progress } : {}),
        ...(state.reused !== undefined ? { reused: state.reused } : {}),
        ...(state.candidates.length > 0 ? { candidateCount: state.candidates.length } : {}),
        // 可重试性透传自后端的 error.retryable —— 前端不做重试决策（设计文档 §4.5）
        ...(state.error !== undefined ? { retryable: state.error.retryable } : {}),
        // 冻结是定义态，由 project store 说了算，不是运行态
        ...(node?.adopted?.frozen === true ? { frozen: true } : {}),
      }
    }
  }
  // 没有跑过但有冻结产出的节点也要显示锁定标记
  for (const wf of store.workflows) {
    for (const node of wf.graph.nodes) {
      if (node.adopted?.frozen === true && out[node.id] === undefined) {
        out[node.id] = { frozen: true }
      }
    }
  }
  return out
})

const workflows = computed(() => store.workflows)

const runningCount = computed(() => runnerStore.runningCount())
const totalCost = computed(() => runnerStore.totalCost())
const totalEstimatedCost = computed(() => runnerStore.totalEstimatedCost())

/**
 * 跑整个项目 —— 画布上每个工作流各起一次 run。
 *
 * 设计文档 §1.2 的核心场景：「剧本」在跑的同时「角色设定」也能跑。
 * 必须并发提交而不是 for-await 串行，否则第二、三个工作流会排队等待。
 */
async function onRun(): Promise<void> {
  await Promise.all(
    store.workflows.map(wf => runner.submit(wf.id, { kind: 'workflow' }, wf.graph)),
  )
}

function onStop(): void {
  for (const runId of [...runnerStore.activeRunIds]) {
    void runner.cancel(runId)
  }
}

// ── 画布事件 ──────────────────────────────────────────────────────────────

function onWorkflowAdd(): void {
  store.addWorkflow(`工作流 ${store.workflows.length + 1}`, nextPlacement())
}

/**
 * 新分区放到最右侧分区之后。
 *
 * placement.x 必须留出分区**完整宽度**再加间距，否则新分区会压到旧分区上。
 * 宽度只能靠 computeWorkflowSize 算 —— 它和 renderProject 用的是同一套规则。
 */
function nextPlacement(): WorkflowPlacement {
  const GAP = 100
  let right = 0
  for (const wf of store.workflows) {
    right = Math.max(right, wf.placement.x + computeWorkflowSize(wf.graph.nodes).width)
  }
  const color = ((store.workflows.length % 5) + 1) as 1 | 2 | 3 | 4 | 5
  return { x: right + GAP, y: 40, color }
}

function onWorkflowRemove(workflowId: string): void {
  store.removeWorkflow(workflowId)
}

function onWorkflowRename(payload: { workflowId: string, name: string }): void {
  store.renameWorkflow(payload.workflowId, payload.name)
}

function onNodeMove(payload: { workflowId: string, nodeId: string, position: { x: number, y: number } }): void {
  store.moveNode(payload.workflowId, payload.nodeId, payload.position)
}

function onWorkflowMove(payload: { workflowId: string, position: { x: number, y: number } }): void {
  store.moveWorkflow(payload.workflowId, payload.position)
}

function onNodeRemove(nodeIds: string[]): void {
  store.removeNodes(nodeIds)
}
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <div class="canvas-view">
      <AppTopBar
        :running-count="runningCount"
        :cost="totalCost"
        :estimated-cost="totalEstimatedCost"
        :connection="runner.connection.value"
        @run="onRun"
        @stop="onStop"
      />

      <div v-if="runner.lastError.value" class="run-error">
        {{ runner.lastError.value }}
      </div>

      <Transition name="notice">
        <div v-if="notice" class="notice">
          {{ notice }}
        </div>
      </Transition>

      <main class="canvas-area">
        <WorkflowCanvas
          :workflows="workflows"
          :node-types="nodeTypes"
          :meta="meta"
          @node-move="onNodeMove"
          @node-remove="onNodeRemove"
          @workflow-add="onWorkflowAdd"
          @workflow-move="onWorkflowMove"
          @workflow-remove="onWorkflowRemove"
          @workflow-rename="onWorkflowRename"
          @open-node-config="onOpenNodeConfig"
          @open-node-candidates="onOpenNodeCandidates"
          @run-node="onRunNode"
          @stop-node="onStopNode"
          @adopt-frozen="onAdoptFrozen"
          @unfreeze-node="onUnfreezeNode"
          @retry-node="onRetryNode"
          @view-run-history="onViewRunHistory"
          @view-error-log="onViewErrorLog"
          @duplicate-node="onDuplicateNode"
          @rename-node="onRenameNode"
          @copy-node-params="onCopyNodeParams"
        />
      </main>

      <NodeConfigModal
        :open="configOpen"
        :definition="configDefinition"
        :params="configParams"
        :run-state="configRunState"
        :inputs="configDefinition?.inputs"
        :connected-port-ids="configConnectedPortIds"
        @update:param="onParamUpdate"
        @apply-preset="onApplyPreset"
        @close="onConfigClose"
        @after-leave="onConfigAfterLeave"
      />

      <CandidatePanel
        v-if="candidatesOutput"
        :open="candidatesOpen"
        :node-label="candidatesLabel"
        :candidates="candidatesOutput.candidates"
        :adopted-id="candidatesOutput.assetId"
        :frozen="candidatesNode?.adopted?.frozen"
        :busy="candidatesBusy"
        :reused="candidatesRunState?.reused"
        :workflow-name="candidatesWorkflowName"
        @adopt="onAdopt"
        @freeze="onFreeze"
        @unfreeze="onUnfreeze"
        @run="onRunCandidatesNode"
        @close="onCandidatesClose"
        @after-leave="onCandidatesAfterLeave"
      />

      <NodeRenameDialog
        :open="renameOpen"
        :current="renameCurrent"
        :type-label="renameTypeLabel"
        @confirm="onRenameConfirm"
        @close="renameOpen = false"
        @after-leave="onRenameAfterLeave"
      />

      <NodeRunsPanel
        :open="historyOpen"
        :node-label="historyLabel"
        :entries="historyEntries"
        @close="historyOpen = false"
        @after-leave="onHistoryAfterLeave"
      />
    </div>
  </NConfigProvider>
</template>

<style scoped>
.canvas-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #131316;
  color: #e4e4e7;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
}

.canvas-area {
  flex: 1;
  min-height: 0;
  position: relative;
}

.run-error {
  padding: 6px 14px;
  background: #3b1215;
  border-bottom: 1px solid #7f1d1d;
  color: #fca5a5;
  font-size: var(--fs-body);
}

/* 短暂提示（如「参数已复制」）。做得轻 —— 它不该抢画布的注意力 */
.notice {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  padding: 7px 14px;
  background: #26262a;
  border: 1px solid #3f3f46;
  border-radius: var(--r-control);
  font-size: var(--fs-body);
  color: #d4d4d8;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}
</style>
