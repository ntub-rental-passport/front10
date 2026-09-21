/**
 * 後台頁籤的樣式，單一來源。
 *
 * 這串 class 原本在四個頁面各有一份（subsidy 與 maintenance-tickets 寫死在
 * template、content 與 notifications 各自宣告了一個區域常數 TAB_TRIGGER）。
 * 四份複本意味著改一次樣式要改四個地方，而漏掉的那一頁不會有任何錯誤，
 * 只會慢慢長得跟別頁不一樣。
 *
 * ## 未選狀態為什麼不用 text-muted-foreground
 *
 * 那是原本的寫法，但 muted-foreground 踩在 bg-muted/60 上實測只有 **4.30**，
 * 而頁籤是 14px 文字，需要 4.5。差一點點，但那是使用者每天要點的東西。
 * 改用 foreground/70：淺色與深色都有餘裕，而且視覺上仍然比選中的那顆退一階。
 */
export const ADMIN_TAB_LIST = 'rounded-full bg-muted/60'

export const ADMIN_TAB_TRIGGER =
  'rounded-full px-4 text-foreground/70 ' +
  'data-[state=active]:bg-background data-[state=active]:text-foreground ' +
  'data-[state=active]:shadow-sm'
