import { useState } from 'react';
import { NodeToolbar, Position } from '@xyflow/react';

interface NodeOptimizeDialogProps {
  /** 是否展示（通常绑定节点的 selected 状态） */
  visible: boolean;
  /** 输入框占位文案 */
  placeholder: string;
  /** 提交回调，参数为输入框内容 */
  onSubmit: (prompt: string) => void;
  /** 即使输入框为空也允许提交（如文本节点已有正文内容） */
  forceEnabled?: boolean;
}

/**
 * 节点底部的「AI 优化」聊天式弹窗：锚定在节点下方、脱离画布缩放。
 * TextNode / ImageNode 共用，差异（占位文案、提交逻辑、可提交条件）通过 props 注入。
 */
export function NodeOptimizeDialog({
  visible,
  placeholder,
  onSubmit,
  forceEnabled = false,
}: NodeOptimizeDialogProps) {
  const [prompt, setPrompt] = useState('');
  const canSubmit = forceEnabled || !!prompt.trim();

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(prompt);
    setPrompt('');
  };

  return (
    <NodeToolbar isVisible={visible} position={Position.Bottom} align="end" offset={8}>
      <div className="w-[420px] rounded-2xl border border-[#E0E2E6]/80 bg-white/95 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.18),inset_0_1px_0_0_rgba(255,255,255,0.7)] nodrag nowheel overflow-hidden backdrop-blur-xl">
        {/* 文本输入区域 */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="w-full min-h-[100px] max-h-[200px] resize-none bg-transparent px-4 pt-4 pb-3 text-sm leading-relaxed text-[#374151] placeholder-[#9CA3AF] outline-none"
          rows={4}
        />

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-[#E0E2E6]">
          {/* 左侧：模型选择器 */}
          <button className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span>GVLM 3.1</span>
            <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-1">
            <button
              title="翻译"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
              </svg>
            </button>
            <span className="flex items-center gap-0.5 px-1.5 text-xs text-[#9CA3AF] select-none">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.226V6.75c0-1.6-1.123-2.994-2.707-3.227A48.414 48.414 0 0012 3.75 48.5 48.5 0 003.75 3.994M4.5 19.5h15" />
              </svg>
              {prompt.length}
            </span>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3D7AF5] text-white transition-all hover:bg-[#2E68D8] disabled:opacity-30 disabled:cursor-not-allowed"
              title="发送 (Ctrl+Enter)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
}
