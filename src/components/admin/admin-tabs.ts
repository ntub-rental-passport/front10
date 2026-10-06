/**
 * 後台頁籤的樣式，單一來源。
 *
 * 這串 class 原本在多個頁面各有一份（maintenance-tickets 寫死在 template，
 * content 與 notifications 各自宣告了一個區域常數 TAB_TRIGGER）。
 * 多份複本意味著改一次樣式要改多個地方，而漏掉的那一頁不會有任何錯誤，
 * 只會慢慢長得跟別頁不一樣。
 *
 * ## 未選狀態為什麼不用 text-muted-foreground
 *
 * 那是原本的寫法，但 muted-foreground 踩在 bg-muted/60 上實測只有 **4.30**，
 * 而頁籤是 14px 文字，需要 4.5。差一點點，但那是使用者每天要點的東西。
 * 改用 foreground/70：淺色與深色都有餘裕，而且視覺上仍然比選中的那顆退一階。
 */
/**
 * 容器內距加大，讓整條頁籤列的份量撐得起它的使用頻率。
 *
 * 手機上頁籤放不下時改成橫向滑動（2026-09-28 修）：原本 TabsList 是 inline-flex、
 * 按鈕多少就撐多寬，工單、通知中心、監控的頁籤列在 390px 寬會把整頁撐到
 * 500～650px。max-w-full 讓它最寬等於外框；justify-start 取代 TabsList 預設的
 * justify-center —— 置中時超出的部分會平均溢出兩側，左半邊滑不到。
 * 捲軸隱藏，觸控與觸控板照樣滑得動；放得下的時候（桌機）外觀完全不變。
 */
export const ADMIN_TAB_LIST =
  'rounded-full bg-muted/60 p-1.5 max-w-full min-w-0 justify-start overflow-x-auto ' +
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export const ADMIN_TAB_TRIGGER =
  'shrink-0 rounded-full px-5 py-2 text-sm text-foreground/70 ' +
  'data-[state=active]:bg-background data-[state=active]:text-foreground ' +
  'data-[state=active]:shadow-sm'
