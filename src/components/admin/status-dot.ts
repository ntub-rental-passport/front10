export type StatusDotTone = 'ok' | 'warn' | 'danger' | 'idle'

/**
 * 狀態圓點的語意色對照表，單一來源。
 * ok/warn/danger/idle 分別對到 primary/accent/destructive/muted-foreground，
 * 全部是 src/index.css 既有的 token，沒有另外挑新顏色。
 */
export const STATUS_DOT_TONE_CLASS: Record<StatusDotTone, string> = {
  ok: 'bg-primary',
  warn: 'bg-accent',
  danger: 'bg-destructive',
  idle: 'bg-muted-foreground',
}
