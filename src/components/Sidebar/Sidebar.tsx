import { SceneDetailPanel } from './SceneDetailPanel';

/** 右侧业务面板容器，后续可扩展成素材库 / 场景属性 / 项目设置等 tab。 */
export function Sidebar() {
  return (
    <aside className="w-[380px] shrink-0 border-l border-slate-200 bg-white shadow-xl z-10">
      <SceneDetailPanel />
    </aside>
  );
}
