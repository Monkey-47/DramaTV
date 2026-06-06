import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TextNode as TextNodeType } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';
import { useEditableTitle } from '../../hooks/useEditableTitle';
import { NodeOptimizeDialog } from './NodeOptimizeDialog';

function TextNodeComponent({ id, data, selected }: NodeProps<TextNodeType>) {
  const [content, setContent] = useState(data.content || '');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContent = useRef<string>(data.content || '');

  const updateTextNodeData = useDramaStore((s) => s.updateTextNodeData);

  const {
    isEditing: isEditingTitle,
    startEditing,
    title,
    setTitle,
    inputRef: titleInputRef,
    submit: handleTitleSubmit,
    handleKeyDown: handleTitleKeyDown,
  } = useEditableTitle(data.title, '文本节点', (next) =>
    updateTextNodeData(id, { title: next }),
  );

  // 新节点自动聚焦到内容编辑框
  useEffect(() => {
    if (contentRef.current && !data.content) {
      contentRef.current.focus();
    }
  }, [data.content]);

  // 同步外部内容变化（编辑中不打断用户输入）
  useEffect(() => {
    if (data.content !== content && document.activeElement !== contentRef.current) {
      setContent(data.content || '');
      lastSavedContent.current = data.content || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.content]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  // 内容失焦时保存到历史堆栈
  const handleContentBlur = useCallback(() => {
    if (content !== lastSavedContent.current) {
      updateTextNodeData(id, { content });
      lastSavedContent.current = content;
    }
  }, [id, content, updateTextNodeData]);

  // Ctrl/Cmd + Enter 保存
  const handleContentKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      contentRef.current?.blur();
    }
  }, []);

  const handleOptimize = useCallback(
    (prompt: string) => {
      // TODO: 调用 AI 优化接口
      console.log('优化提示:', prompt);
      console.log('当前文本:', content);

      // 模拟 AI 优化
      setTimeout(() => {
        const optimizedContent = `[已优化] ${content}`;
        setContent(optimizedContent);
        updateTextNodeData(id, { content: optimizedContent });
      }, 500);
    },
    [content, id, updateTextNodeData],
  );

  return (
    <div
      className={`text-node w-72 rounded-xl border-2 shadow-lg bg-white transition-shadow duration-200 ${selected ? 'shadow-xl border-indigo-500' : 'shadow-md hover:shadow-lg border-gray-200'
        }`}
    >
      {/* 入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />

      {/* 头部：节点类型图标 + 标题 */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
        <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
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
      </div>

      {/* 主体：内容编辑区域 */}
      <div className="p-3">
        <textarea
          ref={contentRef}
          value={content}
          onChange={handleContentChange}
          onBlur={handleContentBlur}
          onKeyDown={handleContentKeyDown}
          placeholder="在此输入文本内容"
          className="nodrag nowheel w-full h-24 resize-none border-0 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
          style={{ minHeight: '80px' }}
        />
      </div>

      {/* 出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />

      {/* AI 优化弹窗：选中节点时自动展示 */}
      <NodeOptimizeDialog
        visible={selected}
        placeholder="写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。"
        onSubmit={handleOptimize}
        forceEnabled={!!content.trim()}
      />
    </div>
  );
}

export const TextNode = memo(TextNodeComponent);
