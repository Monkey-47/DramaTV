import type { Node, Edge } from '@xyflow/react';

/** 场景类型 */
export type SceneType = 'opening' | 'normal' | 'climax' | 'ending';

/** 转场类型 */
export type TransitionType = 'fade' | 'cut' | 'dissolve';

/** 场景数据 */
export interface SceneData {
  title: string;
  description: string;
  sceneType: SceneType;
  aiPrompt: string;
  dialogue: string;
  characters: string[];
  duration: number; // 秒
  thumbnailUrl?: string;
  isGenerating?: boolean;
  [key: string]: unknown; // React Flow 要求 Node data 可索引
}

/** 转场边数据 */
export interface TransitionEdgeData {
  transitionType: TransitionType;
  [key: string]: unknown;
}

/** 场景节点类型 */
export type SceneNode = Node<SceneData, 'scene'>;

/** 转场边类型 */
export type TransitionEdge = Edge<TransitionEdgeData>;

/** 场景类型配置 */
export const SCENE_TYPE_CONFIG: Record<SceneType, { label: string; color: string; bgColor: string; borderColor: string }> = {
  opening: { label: '开场', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#93c5fd' },
  normal: { label: '普通', color: '#6b7280', bgColor: '#f9fafb', borderColor: '#d1d5db' },
  climax: { label: '高潮', color: '#ef4444', bgColor: '#fef2f2', borderColor: '#fca5a5' },
  ending: { label: '结局', color: '#10b981', bgColor: '#ecfdf5', borderColor: '#6ee7b7' },
};

/** 转场类型配置 */
export const TRANSITION_CONFIG: Record<TransitionType, { label: string; icon: string }> = {
  fade: { label: '淡入淡出', icon: '🌅' },
  cut: { label: '直接切换', icon: '✂️' },
  dissolve: { label: '溶解', icon: '💫' },
};
