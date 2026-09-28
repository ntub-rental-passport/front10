/*
 * 主題啟動：在 Vue 掛載前決定要不要加 .dark，避免後台先閃一下淺色。
 *
 * 是獨立檔案、不是 index.html 裡的 inline script：正式站 nginx 的 CSP 是
 * script-src 'self'，inline script 會被擋掉 —— 以前後台的深色偏好在正式站
 * 一重新整理就不見，就是因為這段根本沒執行。
 *
 * 只有 /admin 底下會變深色；首頁、登入頁、租客端、房東端都沒有設計過深色，
 * 一律維持淺色（原因見 src/utils/theme.ts 的 themeAllowedOn）。
 *
 * ⚠️ 下面兩件事在 src/utils/theme.ts 各有一份，改一邊就要改另一邊：
 *   - 儲存的 key 'rentmate-theme'（THEME_STORAGE_KEY）
 *   - 只有 /admin 底下可以深色（themeAllowedOn）
 * theme.test.ts 會實際執行這支腳本、跟 TypeScript 那份逐一比對。
 */
(function () {
  try {
    var path = window.location.pathname;
    if (path !== '/admin' && path.indexOf('/admin/') !== 0) return;
    var stored = localStorage.getItem('rentmate-theme');
    var dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* 讀不到就維持淺色，不要因為存取被擋而整頁掛掉 */
  }
})();
