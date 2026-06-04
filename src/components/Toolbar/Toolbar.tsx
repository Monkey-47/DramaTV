import backIconUrl from '@/assets/back.svg';
import reactIconUrl from '@/assets/react.svg';
import { Play, Save } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
// import { useReactFlow } from '@xyflow/react';

// import { useDramaStore } from '../../store/useDramaStore';

interface ToolbarProps {
  onOpenPreview: () => void;
}

/**
 * 让功能按钮保持清晰，同时不过度抢占画布注意力。
 */
export function Toolbar({ onOpenPreview }: ToolbarProps) {
  // const addSceneNode = useDramaStore((s) => s.addSceneNode);
  // const autoLayout = useDramaStore((s) => s.autoLayout);
  // const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <header className="pointer-events-none absolute left-1/2 top-5 z-20 w-[calc(100%-80px)] -translate-x-1/2">
      <div className="pointer-events-auto flex h-[64px] items-center justify-between rounded-2xl border border-white/40 bg-gradient-to-b from-white/40 to-white/15 px-[25px] shadow-[0_20px_60px_-10px_rgba(15,23,42,0.25),inset_0_1px_0_0_rgba(255,255,255,0.6),inset_0_-1px_0_0_rgba(255,255,255,0.15)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-white shadow-lg">
            ✦
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-950">SceneFlow AI</h1>
            <p className="text-xs text-slate-500">无限画布 · 短剧分镜 · AI 生成工作流</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ActionButton variant="normal" icon={<Save size={16} color="#16181D" />}>
            保存
          </ActionButton>
          <ActionButton variant="primary" icon={<Play size={16} color="#FFFFFF" />}>
            预览
          </ActionButton>
          <span className='text-[#DEE1E680] mx-[12px]'>|</span>
          <img className='w-8 h-8 rounded-full object-cover border-[#DEE1E680] border' src={reactIconUrl} alt="" />

          {/* <button
            onClick={() => addSceneNode()}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            + 添加场景
          </button> */}
          {/* <button
            onClick={autoLayout}
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            自动布局
          </button>
          <button
            onClick={() => fitView({ padding: 0.2, duration: 500 })}
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            适应画布
          </button> */}
          {/* <div className="mx-1 h-6 w-px bg-slate-200" /> */}
          {/* <button
            onClick={() => zoomOut({ duration: 250 })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white"
            aria-label="缩小"
          >
            −
          </button>
          <button
            onClick={() => zoomIn({ duration: 250 })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white"
            aria-label="放大"
          >
            +
          </button> */}
          {/* <button
            onClick={onOpenPreview}
            className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(79,70,229,0.35)] transition hover:scale-[1.02]"
          >
            播放预览
          </button> */}
        </div>

      </div>
    </header>
  );
}
