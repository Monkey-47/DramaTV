/**
 * 项目 store —— 定义态。
 *
 * 设计文档 §6.4：Store 只负责状态与同步 mutate，异步请求放 composables。
 * 这里不调任何 API，将来接持久化时由 composable 调 action 写入结果。
 *
 * 设计文档 §3.2 第二条：UI 态 ≠ 持久化态。`selected` / `hovered` / `dragging`
 * 不进这里 —— 它们是 Vue Flow 内部状态。
 *
 * 设计文档 §3.2 第一条：定义态 ≠ 运行态。节点的运行状态（status/progress/
 * candidates）绝不能写进 GraphNode，所以这个 store 里没有任何运行相关字段。
 */

import type { GraphNode, Workflow, WorkflowPlacement } from '@/features/graph/graph.types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

// ── 初始数据 ──────────────────────────────────────────────────────────────
// P1-d 阶段还没有持久化（MVP 1.18 才做），先用一份演示数据。

/**
 * 初始演示数据 —— 覆盖注册表里全部 5 种节点类型，并连成可跑的真实管线：
 *
 *   剧本     创意 → 剧本 → 分镜          （文本链）
 *   角色设定 三视图 → 服装设定            （文生图 → 图生图）
 *   镜头 1   关键帧 → 放大 → 片段         （文生图 → 超分 → 图生视频）
 *
 * placement.x 必须留出分区完整宽度 + 间距，宽度由 computeWorkflowSize 算。
 */
const SEED_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-script',
    name: '剧本',
    placement: { x: 40, y: 40, color: 1 },
    graph: {
      nodes: [
        {
          id: 'idea',
          type: 'llm-script',
          position: { x: 40, y: 60 },
          data: { prompt: '赛博朋克少女在雨夜街头寻找失踪的哥哥', model: 'gpt-4o', temperature: 0.9, topP: 0.9, maxTokens: 2048, style: 'thriller', seed: -1 },
        },
        {
          id: 'script',
          type: 'llm-script',
          position: { x: 280, y: 60 },
          data: { prompt: '扩写成三幕剧本，每幕标出关键转折', model: 'gpt-4o', temperature: 0.7, topP: 0.9, maxTokens: 4096, style: 'thriller', seed: -1 },
        },
        {
          id: 'storyboard',
          type: 'llm-script',
          position: { x: 520, y: 60 },
          data: { prompt: '拆成镜头表，每镜给出景别与运镜', model: 'claude-sonnet', temperature: 0.5, topP: 0.9, maxTokens: 4096, style: 'none', seed: -1 },
        },
      ],
      edges: [
        { id: 'e1', source: { nodeId: 'idea', portId: 'script' }, target: { nodeId: 'script', portId: 'context' } },
        { id: 'e2', source: { nodeId: 'script', portId: 'script' }, target: { nodeId: 'storyboard', portId: 'context' } },
      ],
    },
  },
  {
    id: 'wf-character',
    name: '角色设定',
    placement: { x: 900, y: 40, color: 2 },
    graph: {
      nodes: [
        {
          id: 'triple',
          type: 'text-to-image',
          position: { x: 60, y: 60 },
          data: { prompt: '赛博朋克少女三视图，正侧背，全身，霓虹光', model: 'sdxl', resolution: '832x1216', candidateCount: 4, steps: 30, cfgScale: 7, sampler: 'dpmpp_2m_karras', seed: -1 },
        },
        {
          id: 'costume',
          type: 'image-to-image',
          position: { x: 340, y: 60 },
          data: { prompt: '把外套换成带发光纤维的黑色机能风大衣', model: 'sdxl', denoise: 0.55, resolution: '832x1216', candidateCount: 4, steps: 30, cfgScale: 6.5, seed: -1 },
        },
        {
          id: 'expression',
          type: 'text-to-image',
          position: { x: 60, y: 300 },
          data: { prompt: '同一角色的表情宫格，3×3，喜怒哀惊', model: 'sdxl', resolution: '1024x1024', candidateCount: 8, steps: 28, cfgScale: 7.5, sampler: 'euler_a', seed: -1 },
        },
      ],
      edges: [
        { id: 'e3', source: { nodeId: 'triple', portId: 'image' }, target: { nodeId: 'costume', portId: 'reference' } },
      ],
    },
  },
  {
    id: 'wf-shot',
    name: '镜头 1',
    placement: { x: 1560, y: 40, color: 3 },
    graph: {
      nodes: [
        {
          id: 'keyframe',
          type: 'text-to-image',
          position: { x: 60, y: 60 },
          data: { prompt: '雨夜霓虹街头中景，少女撑伞回头，浅景深，电影感打光', model: 'sdxl', resolution: '1344x768', candidateCount: 4, steps: 32, cfgScale: 6.5, sampler: 'dpmpp_sde_karras', seed: -1 },
        },
        {
          id: 'upscale',
          type: 'upscale',
          position: { x: 340, y: 60 },
          data: { model: 'real-esrgan', scale: 2, faceRestore: true, denoise: 0.3, tileSize: 512 },
        },
        {
          id: 'clip',
          type: 'image-to-video',
          position: { x: 620, y: 60 },
          data: { prompt: '镜头缓慢推近，雨滴落在肩上，头发轻微摆动', model: 'kling-v2', duration: 5, aspectRatio: '16:9', cameraMotion: 'dolly_in', cameraIntensity: 'medium', motionStrength: 0.5, fps: 24, keepFirstFrame: true, seed: -1 },
        },
      ],
      edges: [
        { id: 'e4', source: { nodeId: 'keyframe', portId: 'image' }, target: { nodeId: 'upscale', portId: 'image' } },
        { id: 'e5', source: { nodeId: 'upscale', portId: 'image' }, target: { nodeId: 'clip', portId: 'keyframe' } },
      ],
    },
  },
]

/**
 * 必须深拷贝。之前直接把模块级数组塞进 store，结果是多个 store 实例共享同一份
 * 节点对象 —— moveNode 会改到"种子数据"本身，$reset 也就复位不了。
 */
function initialWorkflows(): Workflow[] {
  return structuredClone(SEED_WORKFLOWS)
}

export const useProjectStore = defineStore('project', () => {
  const workflows = ref<Workflow[]>(initialWorkflows())

  function findWorkflow(workflowId: string): Workflow | undefined {
    return workflows.value.find(w => w.id === workflowId)
  }

  /**
   * 回写节点位置。坐标系必须是 **workflow 内相对坐标** —— placement 偏移的
   * 叠加/剥离只允许在 features/canvas 内做（设计文档 §6.1），store 永远只认相对坐标。
   */
  function moveNode(workflowId: string, nodeId: string, position: { x: number, y: number }): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    node.position = { x: position.x, y: position.y }
  }

  /** 回写分区位置。分区本身也可拖动，不回写的话刷新就回原位 —— 与节点位置同一类问题。 */
  function moveWorkflow(workflowId: string, position: { x: number, y: number }): void {
    const wf = findWorkflow(workflowId)
    if (!wf)
      return
    wf.placement = { ...wf.placement, ...position }
  }

  /** 返回新分区的 id，供调用方选中或滚动到它 */
  function addWorkflow(name: string, placement: WorkflowPlacement): string {
    const id = `wf_${crypto.randomUUID().slice(0, 8)}`
    workflows.value.push({
      id,
      name,
      placement,
      graph: { nodes: [], edges: [] },
    })
    return id
  }

  function removeWorkflow(workflowId: string): void {
    workflows.value = workflows.value.filter(w => w.id !== workflowId)
  }

  function renameWorkflow(workflowId: string, name: string): void {
    const wf = findWorkflow(workflowId)
    if (wf)
      wf.name = name
  }

  /**
   * 删除节点。连带清理引用它们的边 —— 留下悬空边会让图不一致，
   * 虽然 topo/cycle 对悬空边是宽容的（P1-a 的约定），但定义态不该存这种脏数据。
   */
  function removeNodes(nodeIds: string[]): void {
    const doomed = new Set(nodeIds)
    for (const wf of workflows.value) {
      wf.graph.nodes = wf.graph.nodes.filter(n => !doomed.has(n.id))
      wf.graph.edges = wf.graph.edges.filter(
        e => !doomed.has(e.source.nodeId) && !doomed.has(e.target.nodeId),
      )
    }
  }

  function findNode(id: string): { workflowId: string, node: GraphNode } | undefined {
    for (const wf of workflows.value) {
      const node = wf.graph.nodes.find(n => n.id === id)
      if (node)
        return { workflowId: wf.id, node }
    }
    return undefined
  }

  // ── 采用与冻结（设计文档 §3.2，MVP 1.10 / 1.11）────────────────────────
  //
  // 这两个是**用户的决定**，属于定义态，要持久化。
  // 而 `candidates`（本次跑出了什么）是执行产物，属于运行态，只在 runner store 里。
  // 混在一起的话，用户永远不敢往下走 —— 下次重跑会把满意的结果冲掉。

  /**
   * 采用一个候选。会把 `frozen` 重置为 false ——
   * 换了一张图就不再是"锁定原来那张"，语义上必须重新确认一次冻结。
   */
  function adoptCandidate(workflowId: string, nodeId: string, assetId: string): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    node.adopted = { assetId, frozen: false }
  }

  /**
   * 冻结 / 解冻已采用的产出。
   *
   * 冻结的语义是"这一步我满意了，重跑不要覆盖它"（设计文档 §3.2）。
   * 没有已采用的产出时冻结无意义，直接忽略 —— 冻结的是产出，不是节点本身。
   */
  function setFrozen(workflowId: string, nodeId: string, frozen: boolean): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node?.adopted)
      return
    node.adopted = { ...node.adopted, frozen }
  }

  /** 取消采用。解冻的同时把 adopted 清掉 —— 两者的生命周期是绑在一起的。 */
  function clearAdopted(workflowId: string, nodeId: string): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    delete node.adopted
  }

  // ── 节点参数 ──────────────────────────────────────────────────────────

  /**
   * 写一个节点参数。
   *
   * 参数值住在 `GraphNode.data` 里，是定义态，会跟着工作流一起持久化。
   * 运行态（status / candidates / progress）绝不能写进来（设计文档 §3.2）。
   */
  function setNodeParam(workflowId: string, nodeId: string, key: string, value: unknown): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    node.data = { ...node.data, [key]: value }
  }

  /** 批量写参数。应用预设时一次改好几个字段，逐条写会触发多次重渲染。 */
  function setNodeParams(workflowId: string, nodeId: string, patch: Record<string, unknown>): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    node.data = { ...node.data, ...patch }
  }

  /**
   * 按节点 id 反查它属于哪个工作流。
   *
   * 画布层只上报 nodeId（它不认识工作流归属），而写 store 需要 workflowId。
   * 节点 id 在项目内唯一（设计文档 §3.1），所以这个反查是确定的。
   */
  function findWorkflowByNodeId(nodeId: string): Workflow | undefined {
    return workflows.value.find(wf => wf.graph.nodes.some(n => n.id === nodeId))
  }

  /** 给节点起别名。传空串等于清除，回到显示类型名 */
  function setNodeLabel(workflowId: string, nodeId: string, label: string): void {
    const node = findWorkflow(workflowId)?.graph.nodes.find(n => n.id === nodeId)
    if (!node)
      return
    const trimmed = label.trim()
    if (trimmed.length === 0) {
      delete node.label
    }
    else {
      node.label = trimmed
    }
  }

  /**
   * 复制节点。
   *
   * 连同 `data`（参数）和 `label`（别名）一起复制，但**不复制 `adopted`** ——
   * 采用是「我认可这一步的产出」的决定，属于具体那一个节点，跟着复制会凭空
   * 让新节点声称自己也有已采用的产出。新节点要重新跑、重新挑。
   *
   * 位置往右下偏移一点，否则新节点会和原节点完全重叠、看不出来复制成功。
   */
  function duplicateNode(workflowId: string, nodeId: string): string | undefined {
    const wf = findWorkflow(workflowId)
    const node = wf?.graph.nodes.find(n => n.id === nodeId)
    if (!wf || !node)
      return undefined

    const id = `n_${crypto.randomUUID().slice(0, 8)}`
    wf.graph.nodes.push({
      id,
      type: node.type,
      position: { x: node.position.x + 32, y: node.position.y + 32 },
      data: { ...node.data },
      ...(node.label !== undefined ? { label: node.label } : {}),
    })
    return id
  }

  // ── 持久化 ────────────────────────────────────────────────────────────

  /**
   * 用外部数据整体替换工作流。
   *
   * 持久化层读回草稿后调它。刻意不做"合并" —— 草稿就是权威，
   * 合并会引出「内存里的新改动 vs 磁盘上的旧版本」谁赢的问题，而那是
   * 多端同步才需要面对的（本项目还没有）。
   */
  function replaceWorkflows(next: Workflow[]): void {
    workflows.value = next
  }

  /** 恢复到初始演示数据 */
  function $reset(): void {
    workflows.value = initialWorkflows()
  }

  /** 当前的初始演示数据（持久化层在磁盘上没有草稿时用它做回落） */
  function seedWorkflows(): Workflow[] {
    return initialWorkflows()
  }

  return {
    workflows,
    findNode,
    findWorkflow,
    moveNode,
    moveWorkflow,
    addWorkflow,
    removeWorkflow,
    renameWorkflow,
    removeNodes,
    adoptCandidate,
    setFrozen,
    clearAdopted,
    setNodeParam,
    setNodeParams,
    setNodeLabel,
    duplicateNode,
    findWorkflowByNodeId,
    replaceWorkflows,
    seedWorkflows,
    $reset,
  }
})
