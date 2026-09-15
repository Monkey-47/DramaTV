import type { PortType } from './graph.types'

/**
 * 判断源端口能否连到目标端口。
 *
 * `any` 在任一端都视为通配，这是逃生舱口 —— 它让用户能绕过类型系统，
 * 所以应尽量少用（设计文档 §3.2 原则③）。
 */
export function isPortTypeCompatible(source: PortType, target: PortType): boolean {
  if (source === 'any' || target === 'any') {
    return true
  }
  return source === target
}
