import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
// 字号 / 圆角令牌。放在 uno 之后，确保 :root 变量不被 reset 覆盖
import './styles/tokens.css'

createApp(App)
  .use(createPinia())
  .mount('#app')
