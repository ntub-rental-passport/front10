import { computed, ref, onMounted } from 'vue'
import type { Component } from 'vue'
import {
  BellRing,
  Building2,
  House,
  Users,
  Zap,
} from 'lucide-vue-next'

import powerLightingImage from '@/src/assets/outage/01 .png'
import powerBatteryImage from '@/src/assets/outage/08.png'
import powerNoticeImage from '@/src/assets/outage/16.png'
import powerAccessImage from '@/src/assets/outage/23.png'
import powerFridgeImage from '@/src/assets/outage/18.png'
import powerScheduleImage from '@/src/assets/outage/24.png'
import waterBottleImage from '@/src/assets/outage/05.png'
import powerRadioImage from '@/src/assets/outage/03.png'
import contactImage from '@/src/assets/outage/13.png'
import waterContainerImage from '@/src/assets/outage/12.png'
import waterNoticeImage from '@/src/assets/outage/15.png'
import waterCleanImage from '@/src/assets/outage/10.png'
import waterFilterImage from '@/src/assets/outage/11.png'
import waterToiletImage from '@/src/assets/outage/17.png'
import waterFoodImage from '@/src/assets/outage/06.png'
import waterBackpackImage from '@/src/assets/outage/14.png'

export type UtilityType = 'power' | 'water'
export type EventStatus = 'scheduled' | 'resolved'
export type ReminderLeadTime = '3_hours' | '1_day'

export interface UtilityEvent {
  id: string
  utilityType: UtilityType
  status: EventStatus
  statusLabel: string
  title: string
  dateLabel: string
  timeRange: string
  workLabel: string
  workContent: string
  referenceLabel: string
  referenceValue: string
  sourceName: string
  sourceUpdatedAt: string
  officialUrl: string
  hint: string
}

export interface PreparationItem {
  id: string
  title: string
  body: string
  image: string
  imageAlt: string
  icon: Component
}

export interface OutagePageTabItem {
  id: 'home' | 'actions' | 'notifications' | 'sources'
  label: string
  to: string
  icon: Component
}

// 響應式狀態
const rentalAddress = ref('台北市大安區和平東路二段')
const events = ref<UtilityEvent[]>([])
const featuredSourceUpdatedAt = ref('尚未載入')
const isLoading = ref(false)

const powerNotif = ref(true)
const waterNotif = ref(true)
const changeNotif = ref(true)
const syncRoommates = ref(true)
const reminderLeadTime = ref<ReminderLeadTime>('3_hours')
const activePrepGuide = ref<UtilityType>('power')

const powerOfficialUrl = 'https://www.taipower.com.tw/umbraco/surface/Ini/CountAndRedirectUrl?nodeId=28453'
const waterOfficialUrl = 'https://web.water.gov.tw/wateroffmap/map'

const pageTabs: OutagePageTabItem[] = [
  { id: 'home', label: '首頁', to: '/app/outage', icon: House },
  { id: 'actions', label: '行動建議', to: '/app/outage/actions', icon: Users },
  { id: 'notifications', label: '通知設定', to: '/app/outage/notifications', icon: BellRing },
  { id: 'sources', label: '官方資訊來源', to: '/app/outage/sources', icon: Building2 },
]

// 核心請求：向後端抓取公告資料
async function fetchOutages(addressToQuery?: string) {
  isLoading.value = true
  const queryAddr = addressToQuery || rentalAddress.value

  try {
    const res = await fetch(`${(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')}/api/outage/notices?address=${encodeURIComponent(queryAddr)}`)
    if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`)
    const data = await res.json()

    events.value = data.events
    featuredSourceUpdatedAt.value = data.updatedAt
    rentalAddress.value = data.address
  } catch (error) {
    console.error('無法取得停水停電資訊:', error)
  } finally {
    isLoading.value = false
  }
}

// 更換地址
function updateAddress(newAddress: string) {
  if (!newAddress.trim()) return
  fetchOutages(newAddress.trim())
}

const nextPowerNotice = computed(() =>
  events.value.find(event => event.utilityType === 'power'),
)

const nextWaterNotice = computed(() =>
  events.value.find(event => event.utilityType === 'water'),
)

const powerPreparationItems: PreparationItem[] = [
  { id: 'lighting', title: '備用照明', body: '準備手電筒與露營燈，停電時能安全移動與照明。', image: powerLightingImage, imageAlt: '手電筒與露營燈插畫', icon: Zap },
  { id: 'charging', title: '備用電力', body: '備妥可用電池，也記得事前將手機與行動電源充飽。', image: powerBatteryImage, imageAlt: '備用電池插畫', icon: BellRing },
  { id: 'official', title: '確認公告', body: '核對停電日期、時間與請求號數，掌握影響範圍。', image: powerNoticeImage, imageAlt: '台電停電通知單插畫', icon: Building2 },
  { id: 'elevator', title: '門禁與電梯', body: '確認電子門禁、電梯與停車設備在停電期間的使用方式。', image: powerAccessImage, imageAlt: '電子門禁與電梯插畫', icon: Building2 },
  { id: 'food', title: '冷藏整理', body: '停電期間減少開啟冰箱，優先處理容易腐敗的食材。', image: powerFridgeImage, imageAlt: '冰箱插畫', icon: Building2 },
  { id: 'schedule', title: '提前用電', body: '洗衣、煮飯與充電等事項，盡量於停電前完成。', image: powerScheduleImage, imageAlt: '時鐘插畫', icon: Building2 },
  { id: 'backup-water', title: '基本用水', body: '高樓層或抽水設備可能受影響時，可預先保留少量用水。', image: waterBottleImage, imageAlt: '飲用水插畫', icon: Building2 },
  { id: 'refresh', title: '掌握復電資訊', body: '留意官方公告或廣播資訊，確認供電恢復與異動情形。', image: powerRadioImage, imageAlt: '收音機插畫', icon: Building2 },
  { id: 'roommate', title: '同步室友', body: '將公告分享給同住者，一起分配照明、充電與備援事項。', image: contactImage, imageAlt: '聯絡親友插畫', icon: Users },
]

const waterPreparationItems: PreparationItem[] = [
  { id: 'water-storage', title: '儲水容器', body: '使用乾淨儲水桶先保存生活用水，並保持加蓋密封。', image: waterContainerImage, imageAlt: '儲水容器插畫', icon: Building2 },
  { id: 'drink', title: '飲用水', body: '依居住人數備妥飲用水，供飲用與簡易料理使用。', image: waterBottleImage, imageAlt: '飲用水插畫', icon: Building2 },
  { id: 'official-water', title: '確認公告', body: '查看停水時段、範圍與預計恢復供水的最新資訊。', image: waterNoticeImage, imageAlt: '公告地圖插畫', icon: Building2 },
  { id: 'wash', title: '清潔備援', body: '準備乾洗手與濕紙巾，停水期間維持基本手部清潔。', image: waterCleanImage, imageAlt: '乾洗手插畫', icon: Building2 },
  { id: 'filter', title: '濾水工具', body: '備妥簡易濾水工具，必要時協助處理備援水源。', image: waterFilterImage, imageAlt: '濾水設備插畫', icon: Building2 },
  { id: 'sanitation', title: '如廁備援', body: '預留沖洗用水與水桶，維持租屋處基本衛生需求。', image: waterToiletImage, imageAlt: '馬桶插畫', icon: Building2 },
  { id: 'cooking', title: '餐食準備', body: '預先準備簡便餐食，降低停水期間清洗與料理需求。', image: waterFoodImage, imageAlt: '乾糧插畫', icon: Building2 },
  { id: 'backup-bag', title: '緊急備用品', body: '將飲水、藥品與日用品集中收納，方便臨時取用。', image: waterBackpackImage, imageAlt: '緊急背包插畫', icon: Building2 },
  { id: 'share-water', title: '同步室友', body: '將公告分享給室友或親友，共同安排飲水與清潔需求。', image: contactImage, imageAlt: '聯絡親友插畫', icon: Users },
]

const activePreparationItems = computed(() =>
  activePrepGuide.value === 'power' ? powerPreparationItems : waterPreparationItems,
)

const activePreparationTitle = computed(() =>
  activePrepGuide.value === 'power' ? '停電前準備' : '停水前準備',
)

const activePreparationDescription = computed(() =>
  activePrepGuide.value === 'power'
    ? '停電公告發布後，先處理照明、充電、門禁與冷藏需求。'
    : '停水公告發布後，先備妥飲用水、清潔替代方案與如廁用水。',
)

function getOfficialCardClass(utilityType: UtilityType): string {
  return utilityType === 'power'
    ? 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,1),rgba(255,255,255,1))]'
    : 'border-sky-200 bg-[linear-gradient(135deg,rgba(243,249,255,1),rgba(255,255,255,1))]'
}

export function useOutageData() {
  onMounted(() => {
    if (events.value.length === 0) {
      fetchOutages()
    }
  })

  return {
    activePrepGuide,
    activePreparationDescription,
    activePreparationItems,
    activePreparationTitle,
    changeNotif,
    events,
    featuredSourceUpdatedAt,
    fetchOutages,
    getOfficialCardClass,
    isLoading,
    nextPowerNotice,
    nextWaterNotice,
    pageTabs,
    powerNotif,
    powerOfficialUrl,
    reminderLeadTime,
    rentalAddress,
    syncRoommates,
    updateAddress,
    waterNotif,
    waterOfficialUrl,
  }
}