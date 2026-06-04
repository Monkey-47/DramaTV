import { BookOpen, FileText, Image, Undo2, Redo2 } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useDramaStore } from '../../store/useDramaStore';

// 颜色定义
const COLOR_BASE = '#565D6DFF';
const COLOR_HOVER = '#16181DFF';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ToolbarButton({ icon, label, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className="group flex h-full flex-col items-center justify-center gap-0.5 px-4 transition-colors duration-150 active:opacity-50"
      style={{ color: COLOR_BASE }}
      onMouseEnter={(e) => (e.currentTarget.style.color = COLOR_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.color = COLOR_BASE)}
    >
      <div className="flex h-6 w-6 items-center justify-center">{icon}</div>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>
  );
}

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
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150 active:opacity-50 ${
        disabled ? 'cursor-not-allowed opacity-30' : ''
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
  const addSceneNode = useDramaStore((s) => s.addSceneNode);
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

  const handleAddStory = () => addSceneNode(getCenterPosition(), 'opening');
  const handleAddScript = () => addSceneNode(getCenterPosition(), 'normal');
  const handleAddMaterial = () => addSceneNode(getCenterPosition(), 'climax');

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
        {/* 左侧：添加节点按钮 */}
        <div className="flex h-full items-center">
          <ToolbarButton
            icon={<BookOpen size={18} strokeWidth={1.5} />}
            label="故事"
            onClick={handleAddStory}
          />
          <ToolbarButton
            icon={<FileText size={18} strokeWidth={1.5} />}
            label="剧本"
            onClick={handleAddScript}
          />
          <ToolbarButton
            icon={<Image size={18} strokeWidth={1.5} />}
            label="素材"
            onClick={handleAddMaterial}
          />
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
