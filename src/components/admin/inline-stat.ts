/**
 * 標題旁那排 KPI 的純邏輯。
 *
 * 這排卡的高度只有原本 StatTile 的三分之一左右，所以每一個字都要算數：
 * 沒有 sublabel、沒有 sparkline，只有「這是什麼」與「多少」。
 */

/**
 * 數字加千分位。
 *
 * 後台的數字遲早會變成四位數以上（使用者總數、工單累計），沒有千分位的
 * 「12847」要停下來數位數才讀得出來。用 zh-TW 而不是預設 locale：預設會
 * 跟著瀏覽器語言跑，同一個畫面在不同機器上可能出現不同的分隔符號。
 *
 * 字串原樣回傳 —— 呼叫端已經格式化好的東西（例如「91.4%」）不要再動它。
 */
export function formatStatValue(value: string | number): string {
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-TW')
}

export interface InlineStatVisual {
  containerClass: string
  iconClass: string
  labelClass: string
}

/**
 * 主角卡的樣式。一排四張裡**只有第一張**填滿色。
 *
 * ## 為什麼要有主角
 *
 * 四張長得一樣的卡並排，整頁就沒有視覺落點 —— 眼睛不知道該先看哪裡。
 * 同類產品的通用解法是把一排裡最重要的那張整塊填滿品牌色，其餘留白。
 * 「今日待處理」是這一頁唯一會叫人採取行動的數字，它就是那張。
 *
 * 一排只能有一張。兩張以上就等於沒有主角，只是變成兩塊色。
 *
 * ## 深色模式為什麼不降透明度
 *
 * --primary 在深色是 0.6（比淺色的 0.45 亮），白字踩上去本來就吃緊。
 * 標籤用 /80 在淺色是可以的，深色必須拿掉透明度才勉強讀得到。
 * 這是這組 token 的天花板，不是這裡能解決的（同 StatTile 的註解）。
 */
export function resolveInlineStatVisual(hero: boolean | undefined): InlineStatVisual {
  if (!hero) {
    return {
      containerClass: '',
      iconClass: 'bg-muted text-muted-foreground',
      labelClass: 'text-foreground/70',
    }
  }
  return {
    containerClass: 'bg-primary-surface text-primary-surface-foreground',
    // 圖示底色用前景色的低透明度，而不是另一個 token：在填滿的卡上
    // 任何實色方塊都會變成第二個焦點，跟大數字搶注意力
    iconClass: 'bg-primary-surface-foreground/15 text-primary-surface-foreground',
    labelClass: 'text-primary-surface-foreground/80',
  }
}
