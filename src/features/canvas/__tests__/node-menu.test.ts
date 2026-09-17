import type { MenuContext, MenuItem } from '../node-menu'
import type { NodeStatus } from '@/shared/constants/theme'
import { describe, expect, it } from 'vitest'
import { buildNodeMenu, menuContextFrom } from '../node-menu'

/** 把分段菜单摊平，断言时不用关心中间那条分隔线 */
function flatten(ctx: MenuContext): MenuItem[] {
  return buildNodeMenu(ctx).flatMap(s => s.items)
}

function keys(ctx: MenuContext): string[] {
  return flatten(ctx).map(i => i.key)
}

function item(ctx: MenuContext, key: string): MenuItem | undefined {
  return flatten(ctx).find(i => i.key === key)
}

const ALL_STATUSES: NodeStatus[] = [
  'idle',
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
]

describe('主操作随状态切换', () => {
  it('没跑过时给「运行此节点」', () => {
    expect(item({}, 'runNode')?.label).toBe('运行此节点')
    expect(item({ status: 'idle' }, 'runNode')).toBeDefined()
  })

  it('正在跑的三个状态都给「停止运行」，且不给运行入口', () => {
    for (const status of ['pending', 'queued', 'running'] as const) {
      const k = keys({ status })
      expect(k, `${status} 该有停止`).toContain('stopNode')
      expect(k, `${status} 不该有运行`).not.toContain('runNode')
    }
  })

  it('已成功时给「重新运行此节点」而不是「运行此节点」', () => {
    const ctx: MenuContext = { status: 'succeeded' }
    expect(item(ctx, 'runNode')?.label).toBe('重新运行此节点')
  })

  it('skipped / cancelled 不当作「正在跑」，可以重新运行', () => {
    for (const status of ['skipped', 'cancelled'] as const) {
      const k = keys({ status })
      expect(k).toContain('runNode')
      expect(k).not.toContain('stopNode')
    }
  })
})

describe('重试项受后端的 retryable 标记约束', () => {
  it('retryable 为 true 时可点', () => {
    const it0 = item({ status: 'failed', retryable: true }, 'retryNode')
    expect(it0?.disabled).toBeFalsy()
    expect(it0?.disabledReason).toBeUndefined()
  })

  it('retryable 为 false 时置灰并给出原因，而不是隐藏', () => {
    const it0 = item({ status: 'failed', retryable: false }, 'retryNode')
    expect(it0).toBeDefined()
    expect(it0?.disabled).toBe(true)
    expect(it0?.disabledReason).toBeTruthy()
  })

  it('缺少 retryable 信息时按不可重试处理（前端不替后端做决定）', () => {
    const it0 = item({ status: 'failed' }, 'retryNode')
    expect(it0?.disabled).toBe(true)
  })

  it('非失败状态不出现重试项', () => {
    for (const status of ALL_STATUSES) {
      if (status === 'failed')
        continue
      expect(keys({ status })).not.toContain('retryNode')
    }
  })
})

describe('冻结与解冻', () => {
  it('成功且有已采用产出时可以冻结', () => {
    const ctx: MenuContext = { status: 'succeeded', hasAdopted: true }
    expect(keys(ctx)).toContain('adoptFrozen')
  })

  it('成功但还没采用任何候选时不给冻结入口 —— 冻结的是产出不是节点', () => {
    expect(keys({ status: 'succeeded' })).not.toContain('adoptFrozen')
  })

  it('已冻结时给解冻，且不再给冻结', () => {
    const ctx: MenuContext = { status: 'succeeded', hasAdopted: true, frozen: true }
    const k = keys(ctx)
    expect(k).toContain('unfreezeNode')
    expect(k).not.toContain('adoptFrozen')
  })

  it('冻结状态独立于运行态 —— 重跑之后仍然是冻结的', () => {
    // 冻结是定义态，不该因为新一轮运行把它清掉
    const ctx: MenuContext = { status: 'idle', hasAdopted: true, frozen: true }
    expect(keys(ctx)).toContain('unfreezeNode')
  })
})

describe('候选入口', () => {
  it('有候选时给出数量', () => {
    const ctx: MenuContext = { hasCandidates: true, candidateCount: 4 }
    expect(item(ctx, 'openCandidates')?.label).toBe('查看候选（4 个）')
  })

  it('知道有候选但不知道数量时不编一个数字', () => {
    expect(item({ hasCandidates: true }, 'openCandidates')?.label).toBe('查看候选')
  })

  it('没有候选时不出现该入口', () => {
    expect(keys({ status: 'succeeded' })).not.toContain('openCandidates')
  })
})

describe('历史与日志', () => {
  it('失败时给错误日志，不给历史运行', () => {
    const ctx: MenuContext = { status: 'failed' }
    const k = keys(ctx)
    expect(k).toContain('viewErrorLog')
    expect(k).not.toContain('viewRunHistory')
  })

  it('成功过就给历史运行', () => {
    expect(keys({ status: 'succeeded' })).toContain('viewRunHistory')
  })

  it('已采用产出但当前 idle 时也给历史 —— 产出来自更早某次运行', () => {
    expect(keys({ hasAdopted: true })).toContain('viewRunHistory')
  })

  it('全新节点没有任何历史入口', () => {
    expect(keys({})).not.toContain('viewRunHistory')
    expect(keys({})).not.toContain('viewErrorLog')
  })
})

describe('编辑区恒定存在', () => {
  it('无论什么状态都有四项编辑操作', () => {
    for (const status of ALL_STATUSES) {
      const k = keys({ status })
      for (const key of ['copyNodeParams', 'duplicateNode', 'renameNode', 'removeNode']) {
        expect(k, `${status} 缺 ${key}`).toContain(key)
      }
    }
  })

  it('删除是危险项', () => {
    expect(item({}, 'removeNode')?.danger).toBe(true)
  })
})

describe('menuContextFrom：把画布手上的数据组装成菜单上下文', () => {
  it('两条来源合流 —— 运行态来自 meta，定义态来自 adopted', () => {
    const ctx = menuContextFrom({
      meta: { status: 'succeeded', candidateCount: 4, retryable: true },
      adopted: { frozen: true },
    })
    expect(ctx.status).toBe('succeeded')
    expect(ctx.hasCandidates).toBe(true)
    expect(ctx.candidateCount).toBe(4)
    expect(ctx.retryable).toBe(true)
    expect(ctx.frozen).toBe(true)
    expect(ctx.hasAdopted).toBe(true)
  })

  it('什么都没有时是空上下文（全新节点）', () => {
    const ctx = menuContextFrom({})
    expect(ctx.status).toBeUndefined()
    expect(ctx.frozen).toBe(false)
    expect(ctx.hasAdopted).toBe(false)
    expect(ctx.hasCandidates).toBe(false)
    expect(ctx.retryable).toBeUndefined()
  })

  it('没跑过但有已采用产出时，冻结状态从定义态读出来', () => {
    const ctx = menuContextFrom({ adopted: { frozen: true } })
    expect(ctx.frozen).toBe(true)
    expect(ctx.hasAdopted).toBe(true)
    expect(keys(ctx)).toContain('unfreezeNode')
  })

  it('meta 存在但没有 adopted 时不算「有已采用产出」', () => {
    const ctx = menuContextFrom({ meta: { status: 'succeeded' } })
    expect(ctx.hasAdopted).toBe(false)
    expect(keys(ctx)).not.toContain('adoptFrozen')
  })

  it('candidateCount 为 0 与缺省等价，都不算有候选', () => {
    expect(menuContextFrom({ meta: { candidateCount: 0 } }).hasCandidates).toBe(false)
    expect(menuContextFrom({ meta: {} }).hasCandidates).toBe(false)
  })

  it('缺 retryable 时组装出的上下文让重试项置灰', () => {
    const ctx = menuContextFrom({ meta: { status: 'failed' } })
    expect(item(ctx, 'retryNode')?.disabled).toBe(true)
  })

  it('组装结果直接喂给 buildNodeMenu 不会缺项', () => {
    const ctx = menuContextFrom({
      meta: { status: 'succeeded', candidateCount: 2 },
      adopted: { frozen: true },
    })
    const k = keys(ctx)
    expect(k).toContain('unfreezeNode')
    expect(k).toContain('openCandidates')
    expect(k).toContain('viewRunHistory')
  })
})

describe('菜单长度约束', () => {
  // 菜单是快捷入口不是功能大全。5–8 项是硬约束（设计文档 §6.1）。
  const combos: MenuContext[] = []
  for (const status of [...ALL_STATUSES, undefined]) {
    for (const hasAdopted of [true, false]) {
      for (const frozen of [true, false]) {
        for (const hasCandidates of [true, false]) {
          for (const retryable of [true, false]) {
            combos.push({
              ...(status !== undefined ? { status } : {}),
              hasAdopted,
              frozen,
              hasCandidates,
              candidateCount: 4,
              retryable,
            })
          }
        }
      }
    }
  }

  it('穷举了全部状态组合（含 status 缺省）', () => {
    // 状态数（含 undefined）× 四个布尔开关
    expect(combos.length).toBe((ALL_STATUSES.length + 1) * 2 ** 4)
  })

  it('任何组合下都不少于 5 项、不多于 8 项', () => {
    for (const ctx of combos) {
      const n = flatten(ctx).length
      expect(n, `${JSON.stringify(ctx)} 只有 ${n} 项`).toBeGreaterThanOrEqual(5)
      expect(n, `${JSON.stringify(ctx)} 有 ${n} 项`).toBeLessThanOrEqual(8)
    }
  })

  it('任何组合下都有恰好两段（运行 / 编辑）', () => {
    for (const ctx of combos) {
      expect(buildNodeMenu(ctx)).toHaveLength(2)
    }
  })

  it('每一段都非空 —— 空段会渲染出一条孤零零的分隔线', () => {
    for (const ctx of combos) {
      for (const section of buildNodeMenu(ctx)) {
        expect(section.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('任何组合下 key 都不重复', () => {
    for (const ctx of combos) {
      const k = keys(ctx)
      expect(new Set(k).size, `${JSON.stringify(ctx)} 有重复 key`).toBe(k.length)
    }
  })
})
