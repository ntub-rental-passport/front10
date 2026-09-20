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
    containerClass: isHero
      ? 'bg-primary-surface text-primary-surface-foreground'
      : 'bg-card text-card-foreground',
    // 主角卡的底色是 --primary-surface 而不是 --primary：深色模式下 --primary
    // 被調亮到 0.6（它主要當文字色用），白字壓上去只有 3.85 且那是天花板。
    // --primary-surface 深色壓到 0.46，這裡的 /80 實測 5.14，過 AA。
    // 詳見 src/index.css 對 --primary-surface 的說明。
    mutedTextClass: isHero ? 'text-primary-surface-foreground/80' : 'text-muted-foreground',
    showArrow: Boolean(to),
  }
}
