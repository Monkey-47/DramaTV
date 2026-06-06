import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from '@xyflow/react';
import type { SceneNode, TextNode, ImageNode, TransitionEdge, SceneData, TextNodeData, ImageNodeData, SceneType, TransitionType } from '../types';
import { initialNodes, initialEdges } from '../data/mockData';

interface HistoryState {
  nodes: (SceneNode | TextNode | ImageNode)[];
  edges: TransitionEdge[];
}

interface DramaState {
  nodes: (SceneNode | TextNode | ImageNode)[];
  edges: TransitionEdge[];
  selectedNodeId: string | null;

  // 历史记录用于撤销/重做
  history: HistoryState[];
  historyIndex: number;
  maxHistorySize: number;

  // 撤销/重做状态
  canUndo: boolean;
  canRedo: boolean;

  // React Flow 事件处理
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // 节点操作
  selectNode: (id: string | null) => void;
  addSceneNode: (position?: { x: number; y: number }, sceneType?: SceneType) => void;
  addTextNode: (position?: { x: number; y: number }) => void;
  addImageNode: (position?: { x: number; y: number }, imageUrl?: string, title?: string) => string;
  updateSceneData: (nodeId: string, data: Partial<SceneData>) => void;
  updateTextNodeData: (nodeId: string, data: Partial<TextNodeData>) => void;
  updateImageNodeData: (nodeId: string, data: Partial<ImageNodeData>) => void;
  deleteNode: (nodeId: string) => void;

  // 边操作
  updateEdgeTransition: (edgeId: string, transitionType: TransitionType) => void;

  // AI 生成 mock
  triggerAiGenerate: (nodeId: string) => void;

  // 布局
  autoLayout: () => void;

  // 撤销/重做
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
}

let nodeIdCounter = 100;

const MAX_HISTORY_SIZE = 50;

export const useDramaStore = create<DramaState>()(
  immer((set, get) => {
    /**
     * 保存历史快照。⚠️ 必须在状态变更（set 之后）调用，
     * 语义是"把当前最新状态入栈"，用于 redo 时能回到这个状态。
     */
    const saveHistory = () => {
      const { nodes, edges, history, historyIndex, maxHistorySize } = get();

      // 删除当前位置之后的历史（执行新操作时丢弃 redo 队列）
      const newHistory = history.slice(0, historyIndex + 1);

      // 推入"当前最新状态"
      newHistory.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });

      // 限制历史记录大小
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      }

      const newIndex = newHistory.length - 1;

      set((state) => {
        state.history = newHistory;
        state.historyIndex = newIndex;
        state.canUndo = true;        // 每次有新的历史快照，undo 一定可用
        state.canRedo = false;       // 新操作后丢弃 redo 队列
      });
    };

    return {
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null,

      history: [{ nodes: initialNodes, edges: initialEdges }],
      historyIndex: 0,
      maxHistorySize: MAX_HISTORY_SIZE,

      canUndo: false,
      canRedo: false,

      onNodesChange: (changes) => {
        const prevNodes = get().nodes;
        const newNodes = applyNodeChanges(changes, prevNodes) as SceneNode[];

        // 判断是否有实质性变化
        const hasPositionChange = changes.some(
          (c) => c.type === 'position' && c.dragging === false
        );
        const hasRemoveChange = changes.some((c) => c.type === 'remove');
        const hasAddChange = changes.some((c) => c.type === 'add');

        const shouldSave = hasPositionChange || hasRemoveChange || hasAddChange;

        // 先更新状态
        set((state) => {
          state.nodes = newNodes;
        });

        // 再保存历史快照
        if (shouldSave) {
          saveHistory();
        }
      },

      onEdgesChange: (changes) => {
        const hasRemoveChange = changes.some((c) => c.type === 'remove');
        const hasAddChange = changes.some((c) => c.type === 'add');

        set((state) => {
          state.edges = applyEdgeChanges(changes, get().edges) as TransitionEdge[];
        });

        if (hasRemoveChange || hasAddChange) {
          saveHistory();
        }
      },

      onConnect: (connection: Connection) => {
        const newEdge: TransitionEdge = {
          ...connection,
          id: `e-${connection.source}-${connection.target}`,
          type: 'transition',
          data: { transitionType: 'fade' as TransitionType },
        };

        set((state) => {
          state.edges = addEdge(newEdge, get().edges) as TransitionEdge[];
        });

        saveHistory();
      },

      selectNode: (id) =>
        set((state) => {
          state.selectedNodeId = id;
        }),

      addSceneNode: (position, sceneType = 'normal') => {
        nodeIdCounter++;

        const typeLabels: Record<SceneType, string> = {
          opening: '故事',
          normal: '剧本',
          climax: '素材',
          ending: '结局',
        };

        const newNode: SceneNode = {
          id: `scene-${nodeIdCounter}`,
          type: 'scene',
          position: position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
          data: {
            title: `${typeLabels[sceneType]} ${nodeIdCounter}`,
            description: '新场景描述...',
            sceneType: sceneType,
            aiPrompt: '',
            dialogue: '',
            characters: [],
            duration: 5,
          },
        };

        // 先 push
        set((state) => {
          state.nodes.push(newNode);
        });

        // 再保存"已包含新节点"的状态
        saveHistory();
      },

      addTextNode: (position) => {
        nodeIdCounter++;

        const newNode: TextNode = {
          id: `text-${nodeIdCounter}`,
          type: 'text',
          position: position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
          data: {
            title: `文本节点 ${nodeIdCounter}`,
            content: '',
          },
        };

        // 先 push
        set((state) => {
          state.nodes.push(newNode);
        });

        // 再保存"已包含新节点"的状态到历史堆栈
        saveHistory();
      },

      addImageNode: (position, imageUrl, title) => {
        nodeIdCounter++;
        const newId = `image-${nodeIdCounter}`;

        const newNode: ImageNode = {
          id: newId,
          type: 'image',
          position: position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
          data: {
            title: title || `图片节点 ${nodeIdCounter}`,
            imageUrl,
          },
        };

        set((state) => {
          state.nodes.push(newNode);
        });

        saveHistory();
        return newId;
      },

      updateSceneData: (nodeId, data) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (node && node.type === 'scene') {
            Object.assign(node.data, data);
          }
        }),

      updateTextNodeData: (nodeId, data) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (node && node.type === 'text') {
            Object.assign(node.data, data);
          }
        }),

      updateImageNodeData: (nodeId, data) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (node && node.type === 'image') {
            Object.assign(node.data, data);
          }
        }),

      deleteNode: (nodeId) => {
        set((state) => {
          state.nodes = state.nodes.filter((n) => n.id !== nodeId);
          state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
          if (state.selectedNodeId === nodeId) {
            state.selectedNodeId = null;
          }
        });

        saveHistory();
      },

      updateEdgeTransition: (edgeId, transitionType) =>
        set((state) => {
          const edge = state.edges.find((e) => e.id === edgeId);
          if (edge?.data) {
            edge.data.transitionType = transitionType;
          }
        }),

      triggerAiGenerate: (nodeId) => {
        get().updateSceneData(nodeId, { isGenerating: true });

        setTimeout(() => {
          const scene = get().nodes.find((n) => n.id === nodeId);
          const sceneType = scene?.type === 'scene' ? scene.data.sceneType : 'normal';
          const colors: Record<string, string> = {
            opening: '3b82f6',
            normal: '6b7280',
            climax: 'ef4444',
            ending: '10b981',
          };
          const color = colors[sceneType] || '6b7280';
          get().updateSceneData(nodeId, {
            isGenerating: false,
            thumbnailUrl: `https://placehold.co/320x180/${color}/ffffff?text=AI+Generated+Scene`,
          });
        }, 2000);
      },

      autoLayout: () => {
        const { nodes, edges } = get();

        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        nodes.forEach((n) => {
          adj.set(n.id, []);
          inDegree.set(n.id, 0);
        });

        edges.forEach((e) => {
          adj.get(e.source)?.push(e.target);
          inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        });

        const queue: string[] = [];
        const level = new Map<string, number>();

        nodes.forEach((n) => {
          if ((inDegree.get(n.id) || 0) === 0) {
            queue.push(n.id);
            level.set(n.id, 0);
          }
        });

        let head = 0;
        while (head < queue.length) {
          const curr = queue[head++];
          const currLevel = level.get(curr) || 0;
          const neighbors = adj.get(curr) || [];

          neighbors.forEach((next) => {
            const newLevel = currLevel + 1;
            if (!level.has(next) || level.get(next)! < newLevel) {
              level.set(next, newLevel);
            }
            inDegree.set(next, (inDegree.get(next) || 0) - 1);
            if (inDegree.get(next) === 0) {
              queue.push(next);
            }
          });
        }

        const maxLevel = Math.max(...Array.from(level.values()), 0);
        nodes.forEach((n) => {
          if (!level.has(n.id)) {
            level.set(n.id, maxLevel + 1);
          }
        });

        const groups = new Map<number, string[]>();
        level.forEach((lvl, id) => {
          if (!groups.has(lvl)) groups.set(lvl, []);
          groups.get(lvl)!.push(id);
        });

        const NODE_WIDTH = 320;
        const NODE_HEIGHT = 220;
        const H_GAP = 100;
        const V_GAP = 40;

        const layoutNodes = nodes.map((node) => {
          const lvl = level.get(node.id) || 0;
          const group = groups.get(lvl) || [];
          const indexInGroup = group.indexOf(node.id);
          const groupHeight = group.length * (NODE_HEIGHT + V_GAP) - V_GAP;
          const startY = -groupHeight / 2;

          return {
            ...node,
            position: {
              x: lvl * (NODE_WIDTH + H_GAP),
              y: startY + indexInGroup * (NODE_HEIGHT + V_GAP),
            },
          };
        });

        set((state) => {
          state.nodes = layoutNodes;
        });

        saveHistory();
      },

      saveHistory,

      undo: () => {
        const { history, historyIndex } = get();
        // 边界：historyIndex === 0 表示当前就在初始状态，不能再 undo
        if (historyIndex <= 0) return;

        const newIndex = historyIndex - 1;
        const snapshot = history[newIndex];

        set((state) => {
          state.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
          state.edges = JSON.parse(JSON.stringify(snapshot.edges));
          state.historyIndex = newIndex;
          state.canUndo = newIndex > 0;
          state.canRedo = true;
        });
      },

      redo: () => {
        const { history, historyIndex } = get();
        // 边界：已经在最新状态，不能再 redo
        if (historyIndex >= history.length - 1) return;

        const newIndex = historyIndex + 1;
        const snapshot = history[newIndex];

        set((state) => {
          state.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
          state.edges = JSON.parse(JSON.stringify(snapshot.edges));
          state.historyIndex = newIndex;
          state.canUndo = true;
          state.canRedo = newIndex < history.length - 1;
        });
      },
    };
  })
);
