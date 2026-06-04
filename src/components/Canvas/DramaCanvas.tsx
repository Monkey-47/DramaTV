import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SceneNode } from '../Nodes/SceneNode';
import { TransitionEdge } from '../Edges/TransitionEdge';
import { useDramaStore } from '../../store/useDramaStore';
import { SCENE_TYPE_CONFIG, type SceneType } from '../../types';

/**
 * React Flow 的主体画布。
 * 这里把“无限画布”的能力交给 React Flow：缩放、平移、拖拽、连线、小地图都由它负责。
 */
function DramaCanvasInner() {
  const nodes = useDramaStore((s) => s.nodes);
  const edges = useDramaStore((s) => s.edges);
  const onNodesChange = useDramaStore((s) => s.onNodesChange);
  const onEdgesChange = useDramaStore((s) => s.onEdgesChange);
  const onConnect = useDramaStore((s) => s.onConnect);
  const selectNode = useDramaStore((s) => s.selectNode);

  // nodeTypes / edgeTypes 要保持引用稳定，否则 React Flow 会提示重新创建类型映射。
  const nodeTypes = useMemo<NodeTypes>(() => ({ scene: SceneNode }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({ transition: TransitionEdge }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.8}
      defaultEdgeOptions={{ type: 'transition' }}
      className="bg-slate-50"
      style={{
        background: 'linear-gradient(57.99deg, #F1F5F980 0%, #FFFFFFFF 50%, #EFF6FF4D 100%)',
      }}
    >
      {/* 背景网格增强“画布工具”的空间感，面试展示时也更直观。 */}
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#cbd5e1" />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        zoomable
        pannable
        nodeColor={(node) => {
          const sceneType = node.data?.sceneType as SceneType | undefined;
          return sceneType ? SCENE_TYPE_CONFIG[sceneType].color : '#94a3b8';
        }}
      />
    </ReactFlow>
  );
}

export function DramaCanvas() {
  return <DramaCanvasInner />;
}
