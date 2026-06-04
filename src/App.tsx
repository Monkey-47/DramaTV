import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DramaCanvas } from './components/Canvas/DramaCanvas';
import { PreviewModal } from './components/Preview/PreviewModal';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { BottomToolbar } from './components/Toolbar/BottomToolbar';

/**
 * App 负责拼装三块核心体验：顶部命令区、无限画布、右侧属性面板。
 * ReactFlowProvider 放在这里，是为了让 Toolbar 也能调用 useReactFlow 控制缩放和适应视图。
 */
function App() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <ReactFlowProvider>
      <main className="relative flex h-screen w-screen overflow-hidden bg-[#f5f5f7] text-slate-950">
        {/* 常见的大面积柔和背景，给编辑器一个更“产品展示”的第一眼。 */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(147,197,253,0.42),transparent_30%),radial-gradient(circle_at_70%_0%,rgba(216,180,254,0.32),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5f5f7_42%,#eef2ff_100%)]" />

        <section className="relative min-w-0 flex-1">
          <Toolbar onOpenPreview={() => setPreviewOpen(true)} />
          <DramaCanvas />
        </section>

        <Sidebar />
        <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />

        {/* 底部悬浮工具栏 */}
        <BottomToolbar />
      </main>
    </ReactFlowProvider>
  );
}

export default App;
