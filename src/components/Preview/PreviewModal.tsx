import { useMemo, useState } from 'react';
import { SCENE_TYPE_CONFIG } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';
import { getPreviewSequence } from '../../utils/layout';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 简易“成片预览”模式：把画布中的分镜节点按剧情顺序串起来。
 * 这不是视频播放器，而是用于面试展示产品思路：编辑态和预览态可以无缝切换。
 */
export function PreviewModal({ open, onClose }: PreviewModalProps) {
  const nodes = useDramaStore((s) => s.nodes);
  const edges = useDramaStore((s) => s.edges);
  const [currentIndex, setCurrentIndex] = useState(0);

  const sequence = useMemo(() => getPreviewSequence(nodes, edges), [nodes, edges]);
  const current = sequence[currentIndex];

  if (!open || !current) return null;

  const config = SCENE_TYPE_CONFIG[current.data.sceneType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-xl">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] bg-white shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Preview Mode</p>
            <h2 className="text-lg font-semibold text-slate-950">短剧顺序预览</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="关闭预览"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-[1.35fr_0.65fr] gap-0">
          <div className="relative min-h-[520px] bg-slate-950">
            {current.data.thumbnailUrl ? (
              <img
                key={current.id}
                src={current.data.thumbnailUrl}
                alt={current.data.title}
                className="h-full w-full animate-[fadeIn_500ms_ease] object-cover opacity-90"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl text-white/60">🎬</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-8 text-white">
              <span
                className="mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: config.color }}
              >
                {config.label} · {current.data.duration}s
              </span>
              <h3 className="text-4xl font-semibold tracking-tight">{current.data.title}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">{current.data.description}</p>
            </div>
          </div>

          <aside className="flex flex-col bg-white p-6">
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-900">对白 / 旁白</p>
              <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                {current.data.dialogue || '暂无对白'}
              </p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-900">AI Prompt</p>
              <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">
                {current.data.aiPrompt || '暂无提示词'}
              </p>
            </div>

            <div className="mt-auto">
              <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
                <span>Scene {currentIndex + 1}</span>
                <span>{sequence.length} scenes</span>
              </div>
              <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-950 transition-all"
                  style={{ width: `${((currentIndex + 1) / sequence.length) * 100}%` }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                  disabled={currentIndex === 0}
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
                >
                  上一幕
                </button>
                <button
                  onClick={() => setCurrentIndex((index) => Math.min(sequence.length - 1, index + 1))}
                  disabled={currentIndex === sequence.length - 1}
                  className="flex-1 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  下一幕
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
