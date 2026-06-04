import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SceneNode as SceneNodeType } from '../../types';
import { SCENE_TYPE_CONFIG } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';

function SceneNodeComponent({ id, data, selected }: NodeProps<SceneNodeType>) {
  const config = SCENE_TYPE_CONFIG[data.sceneType];
  const triggerAiGenerate = useDramaStore((s) => s.triggerAiGenerate);

  return (
    <div
      className={`scene-node w-80 rounded-xl border-2 shadow-lg bg-white transition-shadow duration-200 ${
        selected ? 'shadow-xl' : 'shadow-md hover:shadow-lg'
      }`}
      style={{
        borderColor: selected ? '#6366f1' : config.borderColor,
      }}
    >
      {/* 入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />

      {/* 场景类型标签 */}
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ backgroundColor: config.bgColor }}
      >
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: config.color }}
        >
          {config.label}
        </span>
        <span className="text-xs text-gray-500">⏱ {data.duration}s</span>
      </div>

      {/* 缩略图区域 */}
      <div className="relative w-full h-36 bg-gray-100 overflow-hidden">
        {data.isGenerating ? (
          <div className="w-full h-full ai-generating flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-1">🤖</div>
              <div className="text-xs text-gray-500">AI 生成中...</div>
            </div>
          </div>
        ) : data.thumbnailUrl ? (
          <img
            src={data.thumbnailUrl}
            alt={data.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-3xl mb-1">🎬</div>
              <div className="text-xs">暂无画面</div>
            </div>
          </div>
        )}

        {/* AI 生成按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!data.isGenerating) triggerAiGenerate(id);
          }}
          disabled={data.isGenerating}
          className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/80 text-white text-xs rounded-md backdrop-blur-sm transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          <span>🤖</span> AI 生成
        </button>
      </div>

      {/* 标题和描述 */}
      <div className="p-3">
        <h3 className="font-bold text-sm text-gray-800 truncate">{data.title}</h3>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
          {data.description}
        </p>
      </div>

      {/* 底部信息 */}
      <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
        {data.characters.map((char) => (
          <span
            key={char}
            className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
          >
            👤 {char}
          </span>
        ))}
      </div>

      {/* 出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />
    </div>
  );
}

export const SceneNode = memo(SceneNodeComponent);
