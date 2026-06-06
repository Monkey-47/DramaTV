import {
  Image,
  Undo2,
  Redo2,
  Plus,
  Type,
  Video,
  Scissors,
  Layers,
  Music,
  Film,
  Upload,
  History,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useDramaStore } from '../../store/useDramaStore';

// 颜色定义
const COLOR_BASE = '#565D6DFF';
const COLOR_HOVER = '#16181DFF';

function Divider() {
  return <div className="mx-1 h-6 w-px bg-[#E0E2E6]" />;
}

interface IconBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

function IconBtn({ onClick, disabled, title, className = '', children }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150 active:opacity-50 ${disabled ? 'cursor-not-allowed opacity-30' : ''
        } ${className}`}
      style={{ color: COLOR_BASE }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.color = COLOR_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = COLOR_BASE;
      }}
    >
      {children}
    </button>
  );
}

/**
 * 底部悬浮工具栏（与顶部 Toolbar 视觉对齐：64px 高 + 玻璃 + 阴影）
 * 左侧：故事、剧本、素材按钮
 * 右侧：撤销、重做
 */
export function BottomToolbar() {
  const addTextNode = useDramaStore((s) => s.addTextNode);
  const addImageNode = useDramaStore((s) => s.addImageNode);
  const undo = useDramaStore((s) => s.undo);
  const redo = useDramaStore((s) => s.redo);
  const canUndo = useDramaStore((s) => s.canUndo);
  const canRedo = useDramaStore((s) => s.canRedo);

  const { screenToFlowPosition } = useReactFlow();

  const getCenterPosition = () => {
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  };

  const handleAddText = () => addTextNode(getCenterPosition());
  const handleAddImage = () => addImageNode(getCenterPosition());
  const handleAddScript = () => addTextNode(getCenterPosition());

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className="pointer-events-auto flex h-[64px] items-center rounded-2xl border border-white/40 px-3 backdrop-blur-2xl backdrop-saturate-150"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
          boxShadow:
            '0 20px 60px -10px rgba(15,23,42,0.25), inset 0 1px 0 0 rgba(255,255,255,0.6), inset 0 -1px 0 0 rgba(255,255,255,0.15)',
        }}
      >
        {/* 左侧：添加节点下拉菜单 */}
        <div className="dropdown dropdown-top dropdown-start flex h-full items-center">
          <div
            tabIndex={0}
            role="button"
            className="group flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 px-4 transition-colors duration-150 active:opacity-50"
            style={{ color: COLOR_BASE }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLOR_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLOR_BASE)}
          >
            <div className="flex h-6 w-6 items-center justify-center">
              <Plus size={18} strokeWidth={1.5} />
            </div>
            <span className="text-[11px] font-medium leading-none">添加</span>
          </div>

          {/* 下拉菜单内容 — 亮色玻璃态，与工具栏主题统一 */}
          <ul
            tabIndex={0}
            className="menu dropdown-content z-[99] mt-2 w-72 rounded-2xl border border-[#E0E2E6]/80 bg-white/95 p-2 text-sm text-[#374151] shadow-[0_20px_60px_-12px_rgba(15,23,42,0.18),inset_0_1px_0_0_rgba(255,255,255,0.7)] backdrop-blur-xl"
          >
            {/* 添加节点分组 */}
            <li className="mb-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">添加节点</li>
            <li>
              <a
                onClick={() => {
                  handleAddText();
                  // 关闭 dropdown
                  (document.activeElement as HTMLElement)?.blur();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]"
              >
                <Type size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <div className="flex flex-col items-start">
                  <span className="font-medium text-[#1F2937]">文本</span>
                  <span className="text-xs text-[#9CA3AF]">剧本、广告词、品牌文案</span>
                </div>
              </a>
            </li>
            <li>
              <a
                onClick={() => {
                  handleAddImage();
                  (document.activeElement as HTMLElement)?.blur();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]"
              >
                <Image size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <span className="font-medium text-[#1F2937]">图片</span>
              </a>
            </li>
            <li>
              <a
                onClick={() => {
                  handleAddScript();
                  (document.activeElement as HTMLElement)?.blur();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]"
              >
                <Video size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <span className="font-medium text-[#1F2937]">视频</span>
              </a>
            </li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <Scissors size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1F2937]">视频合成</span>
                  <span className="rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">Beta</span>
                </div>
              </a>
            </li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <Layers size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1F2937]">导演台</span>
                  <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600">NEW</span>
                </div>
              </a>
            </li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <Music size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <span className="font-medium text-[#1F2937]">音频</span>
              </a>
            </li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <Film size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1F2937]">脚本</span>
                  <span className="rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">Beta</span>
                </div>
              </a>
            </li>

            {/* 添加资源分组 */}
            <li className="mt-2 mb-1 border-t border-[#E0E2E6] px-3 pt-3 text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">添加资源</li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <Upload size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <span className="font-medium text-[#1F2937]">上传</span>
              </a>
            </li>
            <li>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[#F3F4F6]">
                <History size={18} strokeWidth={1.5} className="shrink-0 text-[#6B7280]" />
                <span className="font-medium text-[#1F2937]">从生成历史选择</span>
              </a>
            </li>
          </ul>
        </div>

        {/* 分割线 */}
        <Divider />

        {/* 右侧：撤销、重做 */}
        <div className="flex h-full items-center px-2">
          <IconBtn onClick={undo} disabled={!canUndo} title="撤销">
            <Undo2 size={18} strokeWidth={1.5} />
          </IconBtn>
          <IconBtn onClick={redo} disabled={!canRedo} title="重做" className="ml-1">
            <Redo2 size={18} strokeWidth={1.5} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}
