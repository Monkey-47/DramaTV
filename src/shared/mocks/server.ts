import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * Node 端 mock server，供 vitest 使用（`setupServer` 拦截进程内的 fetch）。
 *
 * 注意：jsdom 里没有 `EventSource`，所以 SSE 那条链路不在这里测 ——
 * 事件归约逻辑由 `features/runner/__tests__/reduce.test.ts` 直接覆盖，
 * 假后端的事件生成由 `__tests__/fake-backend.test.ts` 覆盖，两者都不依赖传输层。
 */
export const server = setupServer(...handlers)
