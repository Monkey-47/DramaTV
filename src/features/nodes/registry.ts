/**
 * 节点注册表 —— 设计文档 §3.6
 *
 * 验收标准（设计文档 §9.1）：新增一种节点类型，只允许修改
 * nodes/types/<type>/ 一个目录。若需要改动 canvas/、graph/、runner/
 * 任何一行，说明注册表设计失败。
 */

import type { NodeTypeDefinition } from './nodes.types'

const registry = new Map<string, NodeTypeDefinition<any>>()

/** 注册一个节点类型。重复注册直接抛错 —— 静默覆盖会让调试变成噩梦。 */
export function registerNodeType<TParams>(def: NodeTypeDefinition<TParams>): void {
  if (registry.has(def.type)) {
    throw new Error(`节点类型重复注册：${def.type}`)
  }
  registry.set(def.type, def as NodeTypeDefinition<any>)
}

export function getNodeType<TParams = Record<string, unknown>>(
  type: string,
): NodeTypeDefinition<TParams> | undefined {
  return registry.get(type) as NodeTypeDefinition<TParams> | undefined
}

export function getAllNodeTypes(): NodeTypeDefinition<any>[] {
  return [...registry.values()]
}

export function hasNodeType(type: string): boolean {
  return registry.has(type)
}

/** 按 category 分组，供后续的节点面板使用 */
export function getNodeTypesByCategory(): Map<string, NodeTypeDefinition<any>[]> {
  const out = new Map<string, NodeTypeDefinition<any>[]>()
  for (const def of registry.values()) {
    const list = out.get(def.category) ?? []
    list.push(def)
    out.set(def.category, list)
  }
  return out
}

/** 仅测试用：清空注册表 */
export function __clearRegistry(): void {
  registry.clear()
}

/**
 * 把注册表压成 { [type]: definition } 的普通对象，传给 canvas 做渲染。
 *
 * canvas 不直接 import 注册表 —— 它只收一个 map（见 WorkflowCanvas 的 nodeTypes prop）。
 * 这样 canvas 与注册表解耦，view 层负责把两者接起来（组合优先于搬迁，设计文档 §5.3）。
 */
export function buildNodeTypeMap(): Record<string, NodeTypeDefinition<any>> {
  const out: Record<string, NodeTypeDefinition<any>> = {}
  for (const [type, def] of registry) {
    out[type] = def
  }
  return out
}
