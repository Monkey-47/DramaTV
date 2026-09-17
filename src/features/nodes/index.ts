/**
 * 节点类型统一注册入口。
 *
 * 每个节点类型在自己目录里调 registerNodeType，这里 import 触发副作用。
 * 新增节点类型时只改这个文件加一行 import（设计文档 §3.6）。
 */

import './types/llm-script'
import './types/text-to-image'
import './types/image-to-image'
import './types/image-to-video'
import './types/upscale'

export * from './nodes.types'
export {
  buildNodeTypeMap,
  getAllNodeTypes,
  getNodeType,
  getNodeTypesByCategory,
  hasNodeType,
  registerNodeType,
} from './registry'
