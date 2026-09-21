export type StatusDotTone = 'ok' | 'warn' | 'danger' | 'idle'

/**
 * 狀態的語意色，單一來源。
 *
 * ## 為什麼 ok 是 success 而不是 primary
 *
 * 原本 ok 對到 --primary。但 --primary 是品牌色：logo、按鈕、圖表線、選中的
 * 導覽膠囊全是它。一顆紫色的狀態燈擺在整片紫色的介面上不構成訊號 —— 使用者
 * 看到紫色不會想到「這是在跟我說系統正常」，只會覺得那是裝飾。
 *
 * 所以加了 --success（綠）當狀態色。詳見 src/index.css 的說明。
 *
 * ## 為什麼異常要整顆上色，而不是把文字染色
 *
 * accent（琥珀 oklch(0.8 0.15 80)）與 destructive（橘紅 oklch(0.7 0.18 40)）
 * 拿來當文字色時，在淺色模式踩在白卡上實測只有 **1.90 與 2.86** —— 遠低於
 * AA 的 4.5，等於看不清楚。它們太亮了，只適合當填色。
 *
 * 填色版本的對比是成立的，因為前景色是跟填色配對設計的。所以警示做成實心
 * chip：既解決對比，視覺上也比「淡淡的彩色字」強得多。
 *
 * ## 為什麼 ok 不做成實心 chip
 *
 * 一條三顆都是實心色塊的健康條，在一切正常時也很吵；吵久了就沒人看了。
 * 正常安靜、有事才跳出來，顏色才留得住注意力。
 */
export const STATUS_DOT_TONE_CLASS: Record<StatusDotTone, string> = {
  ok: 'bg-success',
  warn: 'bg-accent',
  danger: 'bg-destructive-surface',
  idle: 'bg-muted-foreground',
}

/** 實心 chip 的填色與前景。只給 warn／danger 用，見上方說明。 */
export const STATUS_CHIP_CLASS: Record<StatusDotTone, string> = {
  ok: 'bg-success/10 text-foreground',
  warn: 'bg-accent text-accent-foreground',
  danger: 'bg-destructive-surface text-destructive-surface-foreground',
  idle: 'bg-muted text-muted-foreground',
}

/**
 * 這個狀態值不值得「跳出來」。
 *
 * 只有 warn 與 danger 算數。ok 與 idle 都代表「沒事要你處理」——
 * idle 是還沒接上資料源，那不是故障，更不該搶注意力。
 */
export function shouldEmphasize(tone: StatusDotTone): boolean {
  return tone === 'warn' || tone === 'danger'
}
