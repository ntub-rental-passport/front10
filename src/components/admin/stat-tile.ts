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
    mutedTextClass: isHero ? 'text-primary-foreground/75' : 'text-muted-foreground',
    showArrow: Boolean(to),
  }
}
