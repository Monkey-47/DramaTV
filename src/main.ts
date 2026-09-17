import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
// 字号 / 圆角令牌。放在 uno 之后，确保 :root 变量不被 reset 覆盖
import './styles/tokens.css'

/**
 * 启动顺序：dev 下先把 MSW worker 起起来，再挂载应用。
 *
 * 必须在挂载前 await —— worker 需要注册 service worker 才开始拦截请求，
 * 早于它就发出的请求会漏到真实网络（比如 SSE 连接）。
 *
 * 动态 import 让 MSW 及其依赖不进生产包：`import.meta.env.DEV` 在生产构建里
 * 是静态 false，整个分支会被摇掉。
 */
async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const { startMockWorker } = await import('./shared/mocks/browser')
    await startMockWorker()
  }

  createApp(App)
    .use(createPinia())
    .mount('#app')
}

void bootstrap()
