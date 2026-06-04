import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { TransitionEdge as TransitionEdgeType } from '../../types';
import { TRANSITION_CONFIG, type TransitionType } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';

/**
 * 自定义“转场边”。
 * 除了普通连线之外，还在边的中点展示转场类型；点击标签可以在几种转场之间快速切换。
 */
function TransitionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected = false,
}: EdgeProps<TransitionEdgeType>) {
  const updateEdgeTransition = useDramaStore((s) => s.updateEdgeTransition);
  const transitionType = (data?.transitionType as TransitionType | undefined) || 'fade';
  const config = TRANSITION_CONFIG[transitionType];

  // React Flow 提供贝塞尔曲线计算，labelX / labelY 正好可作为转场标签锚点。
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#6366f1' : '#94a3b8',
          strokeWidth: selected ? 3 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              const types = ['fade', 'cut', 'dissolve'] as const;
              const nextIndex = (types.indexOf(transitionType) + 1) % types.length;
              updateEdgeTransition(id, types[nextIndex]);
            }}
            className={`
              rounded-full px-2 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-all
              ${selected
                ? 'border border-indigo-300 bg-indigo-100 text-indigo-700'
                : 'border border-white/70 bg-white/85 text-slate-600 hover:bg-white'
              }
            `}
          >
            {config.icon} {config.label}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const TransitionEdge = memo(TransitionEdgeComponent);
