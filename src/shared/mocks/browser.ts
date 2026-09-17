import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/**
 * 浏览器端 mock worker。
 *
 * 只在 dev 下启动（见 main.ts）—— 生产构建不该把 mock 打进包里。
 * service worker 文件由 `npx msw init public` 生成，路径记在 package.json 的
 * `msw.workerDirectory`。
 */
export const worker = setupWorker(...handlers)

export async function startMockWorker(): Promise<void> {
  await worker.start({
    // 未被 handler 覆盖的请求直接放行，不要刷一屏警告
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
}
