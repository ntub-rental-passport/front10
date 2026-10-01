/**
 * 公開首頁、租客與房東端讀的公告與輪播（/api/content/public）。
 *
 * 後端只給生效中的（草稿、排程中、已結束的不送出來），公告已經照開始時間新到舊排好。
 * 一分鐘內重複呼叫只打一次後端；後台改完內容會強制重讀（見 useAdminContent）。
 * 讀不到後端時沿用上一次的內容（一開始是空的，輪播區塊就不顯示）。
 */
import { computed, ref } from 'vue'
import { fetchPublicContent } from '@/src/services/contentApi'
import { isAnnouncementVisibleToTenant, matchesAudience } from '@/src/utils/announcement'
import type { Announcement, Banner } from '@/src/mocks/admin/content'

const MAX_AGE_MS = 60_000

const banners = ref<Banner[]>([])
const announcements = ref<Announcement[]>([])
const loading = ref(false)
const loadError = ref('')
let loadedAt = 0
let inflight: Promise<void> | null = null

export function refreshPublicContent(options: { force?: boolean } = {}): Promise<void> {
  if (inflight) {
    return options.force ? inflight.then(() => refreshPublicContent(options)) : inflight
  }
  if (!options.force && loadedAt !== 0 && Date.now() - loadedAt < MAX_AGE_MS)
    return Promise.resolve()

  loading.value = true
  loadError.value = ''
  inflight = (async () => {
    const result = await fetchPublicContent()
    if (result) {
      banners.value = result.banners
      announcements.value = result.announcements
    }
    if (result) loadedAt = Date.now()
    else loadError.value = '讀不到公告，請重新讀取。'
  })().finally(() => {
    loading.value = false
    inflight = null
  })
  return inflight
}

export function usePublicContent() {
  void refreshPublicContent()

  // 公告有受眾：租客端（首頁、通知中心）只看跟自己身分有關的
  const tenantAnnouncements = computed(() =>
    announcements.value.filter(isAnnouncementVisibleToTenant),
  )

  return {
    banners: computed(() => banners.value),
    announcements: computed(() => announcements.value),
    tenantAnnouncements,
    landlordAnnouncements: computed(() =>
      announcements.value.filter((item) => matchesAudience(item.audience, 'landlord')),
    ),
    loading,
    loadError,
  }
}
