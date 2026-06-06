import { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { ImageNode as ImageNodeType } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';
import { useEditableTitle } from '../../hooks/useEditableTitle';
import { NodeOptimizeDialog } from './NodeOptimizeDialog';

/** 图生图时，新节点相对当前节点向左偏移的距离 */
const IMAGE_TO_IMAGE_OFFSET_X = 380;

function ImageNodeComponent({ id, data, selected }: NodeProps<ImageNodeType>) {
  const [fileSelectMode, setFileSelectMode] = useState<'upscale' | 'imageToImage'>('upscale');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateImageNodeData = useDramaStore((s) => s.updateImageNodeData);
  const addImageNode = useDramaStore((s) => s.addImageNode);
  const onConnect = useDramaStore((s) => s.onConnect);
  const { getNode } = useReactFlow();

  const hasImage = !!data.imageUrl;

  const {
    isEditing: isEditingTitle,
    startEditing,
    title,
    setTitle,
    inputRef: titleInputRef,
    submit: handleTitleSubmit,
    handleKeyDown: handleTitleKeyDown,
  } = useEditableTitle(data.title, '图片节点', (next) =>
    updateImageNodeData(id, { title: next }),
  );

  // 处理文件选择（根据 mode 决定行为）
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;

        if (fileSelectMode === 'imageToImage') {
          // 图生图：在当前位置左侧创建新图片节点并连接
          const currentNode = getNode(id);
          if (!currentNode) return;

          const newNodePosition = {
            x: currentNode.position.x - IMAGE_TO_IMAGE_OFFSET_X,
            y: currentNode.position.y,
          };

          const newNodeId = addImageNode(newNodePosition, url, '图生图');
          onConnect({ source: newNodeId, target: id, sourceHandle: null, targetHandle: null });
        } else {
          // 图片高清：直接填充当前节点
          updateImageNodeData(id, { imageUrl: url });
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [id, fileSelectMode, getNode, addImageNode, onConnect, updateImageNodeData],
  );

  // 图生图：设置模式并打开文件选择器
  const handleImageToImage = useCallback(() => {
    setFileSelectMode('imageToImage');
    fileInputRef.current?.click();
  }, []);

  // 图片高清：设置模式并打开文件选择器
  const handleImageUpscale = useCallback(() => {
    setFileSelectMode('upscale');
    fileInputRef.current?.click();
  }, []);

  const handleOptimize = useCallback((prompt: string) => {
    // TODO: 调用 AI 优化接口
    console.log('AI 优化图片:', prompt);
  }, []);

  return (
    <div
      className={`image-node w-72 rounded-xl border-2 shadow-lg bg-white transition-shadow duration-200 ${selected ? 'shadow-xl border-indigo-500' : 'shadow-md hover:shadow-lg border-gray-200'
        }`}
    >
      {/* 入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />

      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 头部：节点类型图标 + 标题 */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
        <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        {/* 标题 - 可双击编辑 */}
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleTitleKeyDown}
            className="nodrag nowheel flex-1 text-sm font-medium text-gray-800 bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none"
            maxLength={20}
          />
        ) : (
          <div
            onDoubleClick={startEditing}
            className="flex-1 text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-indigo-600 transition-colors"
            title={title}
          >
            {title}
          </div>
        )}
        {/* 重新上传图片 */}
        {hasImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleImageUpscale();
            }}
            className="nodrag flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-indigo-600 hover:bg-gray-100 transition-colors"
            title="重新上传图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </button>
        )}
      </div>
      {/* 主体：图片预览或空态 */}
      <div className="p-3">
        {hasImage ? (
          <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video">
            <img src={data.imageUrl} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[160px] gap-4">
            <svg className="w-12 h-12 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>

            <div className="w-full flex flex-col gap-2">
              <div className="text-xs text-gray-500 mb-1">尝试:</div>
              <button
                onClick={handleImageToImage}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                图生图
              </button>
              <button
                onClick={handleImageUpscale}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm transition-colors"
              >
                <span className="flex items-center justify-center w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600">HD</span>
                图片高清
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部描述（如果有） */}
      {data.description && (
        <div className="px-3 pb-2">
          <span className="text-xs text-gray-500 truncate">{data.description}</span>
        </div>
      )}

      {/* 出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />

      {/* AI 优化弹窗：选中节点时自动展示 */}
      <NodeOptimizeDialog
        visible={selected}
        placeholder="描述你想要的图片风格、构图或氛围。例如：赛博朋克风格，霓虹灯光，雨夜街道。"
        onSubmit={handleOptimize}
      />
    </div>
  );
}

export const ImageNode = memo(ImageNodeComponent);
