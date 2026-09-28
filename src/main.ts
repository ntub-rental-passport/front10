import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index'
import { syncThemeToPath, watchSystemTheme } from './composables/useTheme'
import './index.css'

// 深色只在後台（/admin）套用，其他網址一律淺色。
// 第一次的 .dark 由 public/theme-boot.js 在這之前設好（避免後台閃一下淺色）；
// 這裡再依目前網址校正一次，之後每次換頁都重新判斷 ——
// 從後台點到租客頁，深色要立刻消失。
syncThemeToPath(window.location.pathname)
router.afterEach((to) => syncThemeToPath(to.path))
// 使用者沒有明確選過時，偏好跟著作業系統即時變
watchSystemTheme()

createApp(App).use(router).mount('#app')
