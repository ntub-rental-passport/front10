import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index'
import { watchSystemTheme } from './composables/useTheme'
import './index.css'

// .dark 本身已經由 index.html 的啟動腳本在這之前設好了（避免閃一下淺色）。
// 這裡只是補上「使用者沒有明確選過時，跟著作業系統即時變」。
watchSystemTheme()

createApp(App).use(router).mount('#app')
