export interface StatTileVisual {
  containerClass: string
  mutedTextClass: string
  showArrow: boolean
}

/**
 * 主角卡（hero）用 bg-primary 實心底，同排其他卡維持 bg-card——見規格
 * 一、設計語彙。hero 的底色是飽和的 primary，預設的 text-muted-foreground
 * 在上面對比不夠，所以 hero 時的輔助文字（label/sublabel/sparkline）
 * 要換成半透明的 primary-foreground，而不是原樣照搬。
 *
 * 鑽取箭頭只在真的可以點進去（有 to）時顯示——見規格一、設計語彙。
 */
export function resolveStatTileVisual(
  hero: boolean | undefined,
  to: string | undefined,
): StatTileVisual {
  const isHero = Boolean(hero)

  return {
    containerClass: isHero ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
    // 主角卡的輔助文字在深色模式不能再降透明度：--primary 深色是 0.6（比淺色的
    // 0.45 亮），白字踩上去本來就吃緊。實測 /75 只有 2.89，拿掉透明度是 3.85。
    //
    // ⚠️ 3.85 對 12px 的 sublabel 仍未達 AA 4.5，而且這是這組 token 的天花板
    // （完全不透明也只有 3.85）。要真正達標得調暗深色的 --primary，那是 token
    // 層級的改動。先修到天花板，不假裝已經解決。
    mutedTextClass: isHero
      ? 'text-primary-foreground/75 dark:text-primary-foreground'
      : 'text-muted-foreground',
    showArrow: Boolean(to),
  }
}
