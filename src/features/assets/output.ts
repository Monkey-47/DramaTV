/**
 * 「这个节点现在该用哪个产出」—— 纯逻辑，不碰 UI。
 *
 * 三种来源的优先级（设计文档 §3.2）：
 *   1. 冻结的已采用产出 —— 最高优先级。重跑出新候选也不覆盖它，这正是冻结的意义
 *   2. 已采用产出 —— 用户选过但没锁
 *   3. 本轮候选 —— 仅供挑选，**不自动采用**
 *
 * 第 3 条是刻意的：产出必须由用户显式采用才会往下游走。
 * 自动采用会让"用户没看过就被下游用了"这种事发生，而那正是这个产品要避免的。
 */

import type { GraphNode } from '@/features/graph/graph.types'
import type { AssetRef, NodeRunState } from '@/features/runner/runner.types'

export type OutputSource = 'frozen' | 'adopted' | 'none'

export interface ResolvedOutput {
  /** 下游该拿到哪个产出。`undefined` 表示还没定，下游不该跑 */
  assetId: string | undefined
  source: OutputSource
  /** 本轮跑出的候选，永远原样透出供挑选 */
  candidates: AssetRef[]
  /**
   * 冻结的产出不在本轮候选里。
   *
   * 这不是错误 —— 它恰恰是冻结生效的证据：这是更早某次运行的结果，
   * 而本轮重跑并没有把它冲掉。UI 应该给个提示而不是报错。
   */
  frozenFromEarlierRun: boolean
}

export function resolveOutput(
  node: Pick<GraphNode, 'adopted'>,
  runState: NodeRunState | undefined,
): ResolvedOutput {
  const candidates = runState?.candidates ?? []
  const adopted = node.adopted

  if (adopted === undefined) {
    return { assetId: undefined, source: 'none', candidates, frozenFromEarlierRun: false }
  }

  const inThisRun = candidates.some(c => c.assetId === adopted.assetId)

  return {
    assetId: adopted.assetId,
    source: adopted.frozen ? 'frozen' : 'adopted',
    candidates,
    frozenFromEarlierRun: adopted.frozen && !inThisRun,
  }
}

/** 该节点是否处于「已锁定、重跑不会覆盖」状态 */
export function isLocked(node: Pick<GraphNode, 'adopted'>): boolean {
  return node.adopted?.frozen === true
}

/**
 * 本轮跑出的候选里，有没有用户还没看过的。
 *
 * 用来在节点上打一个小圆点提示"有新产出待挑"。
 */
export function hasUnadoptedCandidates(
  node: Pick<GraphNode, 'adopted'>,
  runState: NodeRunState | undefined,
): boolean {
  const candidates = runState?.candidates ?? []
  if (candidates.length === 0) {
    return false
  }
  if (node.adopted === undefined) {
    return true
  }
  return candidates.some(c => c.assetId !== node.adopted!.assetId)
}
