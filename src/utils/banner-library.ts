import type { BannerImage } from '@/src/services/bannerImageApi'
import { BUILTIN_BANNER_IMAGES } from './banner-url'

export interface BannerLibraryEntry {
  key: string
  url: string
  label: string
  builtin: boolean
  usedBy: { id: string; title: string }[]
  deletable: boolean
  blockedReason?: string
}

export function buildBannerLibrary(
  uploadedImages: readonly BannerImage[],
  banners: readonly { id: string; title: string; imageUrl: string }[],
): BannerLibraryEntry[] {
  const builtins = BUILTIN_BANNER_IMAGES.map((image) => ({
    key: image.url,
    url: image.url,
    label: image.label,
    builtin: true,
    usedBy: banners
      .filter((banner) => banner.imageUrl === image.url)
      .map(({ id, title }) => ({ id, title })),
    deletable: false,
    blockedReason: '內建圖片不能刪除',
  }))
  const uploads = uploadedImages.map((image) => {
    const usedBy = image.usedBy
    const titles = usedBy.slice(0, 3).map(({ title }) => `「${title}」`).join('、')
    return {
      key: image.name,
      url: image.url,
      label: image.name,
      builtin: false,
      usedBy,
      deletable: usedBy.length === 0,
      blockedReason: usedBy.length === 0
        ? undefined
        : `還有 ${usedBy.length} 則輪播在用：${titles}${usedBy.length > 3 ? `等 ${usedBy.length} 則` : ''}`,
    }
  })
  return [...builtins, ...uploads]
}

export function isLibraryFull(count: number, limit: number): boolean {
  return count >= limit
}
