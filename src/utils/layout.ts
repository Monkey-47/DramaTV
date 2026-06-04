import type { SceneNode, TransitionEdge } from '../types';

/**
 * 根据连线关系推导一个适合短剧剧情流的播放顺序。
 * Demo 中不强制用户搭建严格 DAG，因此这里会兜底处理分叉和孤立节点。
 */
export function getPreviewSequence(nodes: SceneNode[], edges: TransitionEdge[]): SceneNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => outgoing.set(node.id, []));

  edges.forEach((edge) => {
    outgoing.get(edge.source)?.push(edge.target);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
  });

  // 优先从没有入边的起点开始；若用户画了环，则按 x 坐标最左节点作为起点。
  const startNodes = nodes
    .filter((node) => (incomingCount.get(node.id) || 0) === 0)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  const ordered: SceneNode[] = [];
  const visited = new Set<string>();
  const queue = startNodes.length ? startNodes.map((node) => node.id) : [nodes[0]?.id].filter(Boolean);

  while (queue.length) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;

    const node = nodeMap.get(currentId);
    if (!node) continue;

    visited.add(currentId);
    ordered.push(node);

    const nextIds = (outgoing.get(currentId) || []).sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      return (nodeA?.position.y || 0) - (nodeB?.position.y || 0);
    });

    queue.push(...nextIds);
  }

  // 把没有被连线覆盖到的孤立节点也补进预览，避免用户新增节点后“消失”。
  const rest = nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  return [...ordered, ...rest];
}
