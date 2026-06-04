import type { SceneType } from '../../types';
import { SCENE_TYPE_CONFIG } from '../../types';
import { useDramaStore } from '../../store/useDramaStore';

const sceneTypeOptions = Object.entries(SCENE_TYPE_CONFIG) as Array<
  [SceneType, (typeof SCENE_TYPE_CONFIG)[SceneType]]
>;

/**
 * 选中场景后的编辑面板。
 * 面试讲解重点：画布节点只是视觉承载，业务数据集中存在 store 中，表单修改会实时同步节点显示。
 */
export function SceneDetailPanel() {
  const selectedNodeId = useDramaStore((s) => s.selectedNodeId);
  const selectedNode = useDramaStore((s) => s.nodes.find((node) => node.id === s.selectedNodeId));
  const updateSceneData = useDramaStore((s) => s.updateSceneData);
  const deleteNode = useDramaStore((s) => s.deleteNode);
  const triggerAiGenerate = useDramaStore((s) => s.triggerAiGenerate);

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center text-slate-400">
        <div className="text-5xl mb-4">🎞️</div>
        <h2 className="text-lg font-semibold text-slate-600 mb-2">选择一个场景</h2>
        <p className="text-sm leading-6">
          点击画布中的场景节点后，可以在这里编辑短剧分镜、AI 提示词和角色对白。
        </p>
      </div>
    );
  }

  const data = selectedNode.data;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-xs text-slate-400 mb-1">当前场景</p>
          <h2 className="text-xl font-bold text-slate-900">{data.title}</h2>
        </div>
        <button
          onClick={() => deleteNode(selectedNodeId)}
          className="px-3 py-1.5 rounded-lg text-sm bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
        >
          删除
        </button>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">场景标题</span>
          <input
            value={data.title}
            onChange={(e) => updateSceneData(selectedNodeId, { title: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">场景类型</span>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {sceneTypeOptions.map(([type, config]) => (
              <button
                key={type}
                onClick={() => updateSceneData(selectedNodeId, { sceneType: type })}
                className="rounded-lg border px-2 py-2 text-xs font-semibold transition-all"
                style={{
                  color: data.sceneType === type ? '#fff' : config.color,
                  borderColor: config.borderColor,
                  backgroundColor: data.sceneType === type ? config.color : config.bgColor,
                }}
              >
                {config.label}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">时长（秒）</span>
          <input
            type="number"
            min={1}
            max={60}
            value={data.duration}
            onChange={(e) => updateSceneData(selectedNodeId, { duration: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">场景描述</span>
          <textarea
            value={data.description}
            onChange={(e) => updateSceneData(selectedNodeId, { description: e.target.value })}
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">AI 画面提示词</span>
          <textarea
            value={data.aiPrompt}
            onChange={(e) => updateSceneData(selectedNodeId, { aiPrompt: e.target.value })}
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">角色对白</span>
          <textarea
            value={data.dialogue}
            onChange={(e) => updateSceneData(selectedNodeId, { dialogue: e.target.value })}
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">角色（用逗号分隔）</span>
          <input
            value={data.characters.join(', ')}
            onChange={(e) =>
              updateSceneData(selectedNodeId, {
                characters: e.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <button
          onClick={() => triggerAiGenerate(selectedNodeId)}
          disabled={data.isGenerating}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {data.isGenerating ? 'AI 生成中...' : '生成场景画面'}
        </button>
      </div>
    </div>
  );
}
