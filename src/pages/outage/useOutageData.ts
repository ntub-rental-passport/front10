import { computed, ref } from 'vue'
import type { Component } from 'vue'
import {
  BellRing,
  Building2,
  Clock,
  Droplets,
  FileText,
  House,
  Info,
  RefreshCw,
  Users,
  Wrench,
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
  timeNote?: string
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

const rentalAddress = ref('台北市大安區和平東路二段')
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

const events: UtilityEvent[] = [
  {
    id: 'power-scheduled',
    utilityType: 'power',
    status: 'scheduled',
    statusLabel: '預告',
    title: '台電停電通知',
    dateLabel: '115年04月11日（六）',
    timeRange: '13:00 - 16:00',
    workLabel: '工作內容',
    workContent: '維護工程',
    referenceLabel: '請求號數',
    referenceValue: 'H16206',
    sourceName: '台灣電力公司',
    sourceUpdatedAt: '今天 10:42',
    officialUrl: powerOfficialUrl,
    hint: '停電前建議先完成手機充電、門禁確認與冷藏設備檢查。',
  },
  {
    id: 'water-scheduled',
    utilityType: 'water',
    status: 'scheduled',
    statusLabel: '預告',
    title: '停水通知',
    dateLabel: '尚未有預定停水公告',
    timeRange: '—',
    workLabel: '工作內容',
    workContent: '—',
    referenceLabel: '公告編號',
    referenceValue: '—',
    sourceName: '台灣自來水公司',
    sourceUpdatedAt: '今天 10:35',
    officialUrl: waterOfficialUrl,
    hint: '停水前建議先儲水，並錯開洗衣、洗澡與清潔等大量用水時段。',
  },
  {
    id: 'water-resolved',
    utilityType: 'water',
    status: 'resolved',
    statusLabel: '已恢復',
    title: '低壓供水事件已恢復',
    dateLabel: '04/07（一）',
    timeRange: '23:10 已恢復',
    workLabel: '工作內容',
    workContent: '凌晨維修完成',
    referenceLabel: '公告編號',
    referenceValue: 'W240407',
    sourceName: '台灣自來水公司',
    sourceUpdatedAt: '昨天 23:18',
    officialUrl: waterOfficialUrl,
    hint: '若恢復初期水色略混濁，可先短暫放流後再使用。',
  },
]

const powerPreparationItems: PreparationItem[] = [
  {
    id: 'lighting',
    title: '備用照明',
    body: '準備手電筒與露營燈，停電時能安全移動與照明。',
    image: powerLightingImage,
    imageAlt: '手電筒與露營燈插畫',
    icon: Zap,
  },
  {
    id: 'charging',
    title: '備用電力',
    body: '備妥可用電池，也記得事前將手機與行動電源充飽。',
    image: powerBatteryImage,
    imageAlt: '備用電池插畫',
    icon: BellRing,
  },
  {
    id: 'official',
    title: '確認公告',
    body: '核對停電日期、時間與請求號數，掌握影響範圍。',
    image: powerNoticeImage,
    imageAlt: '台電停電通知單插畫',
    icon: FileText,
  },
  {
    id: 'elevator',
    title: '門禁與電梯',
    body: '確認電子門禁、電梯與停車設備在停電期間的使用方式。',
    image: powerAccessImage,
    imageAlt: '電子門禁與電梯插畫',
    icon: Building2,
  },
  {
    id: 'food',
    title: '冷藏整理',
    body: '停電期間減少開啟冰箱，優先處理容易腐敗的食材。',
    image: powerFridgeImage,
    imageAlt: '冰箱插畫',
    icon: Info,
  },
  {
    id: 'schedule',
    title: '提前用電',
    body: '洗衣、煮飯與充電等事項，盡量於停電前完成。',
    image: powerScheduleImage,
    imageAlt: '時鐘與待辦清單插畫',
    icon: Clock,
  },
  {
    id: 'backup-water',
    title: '基本用水',
    body: '高樓層或抽水設備可能受影響時，可預先保留少量用水。',
    image: waterBottleImage,
    imageAlt: '飲用水插畫',
    icon: Droplets,
  },
  {
    id: 'refresh',
    title: '掌握復電資訊',
    body: '留意官方公告或廣播資訊，確認供電恢復與異動情形。',
    image: powerRadioImage,
    imageAlt: '收音機插畫',
    icon: RefreshCw,
  },
  {
    id: 'roommate',
    title: '同步室友',
    body: '將公告分享給同住者，一起分配照明、充電與備援事項。',
    image: contactImage,
    imageAlt: '手機聯絡親友插畫',
    icon: Users,
  },
]

const waterPreparationItems: PreparationItem[] = [
  {
    id: 'water-storage',
    title: '儲水容器',
    body: '使用乾淨儲水桶先保存生活用水，並保持加蓋密封。',
    image: waterContainerImage,
    imageAlt: '儲水容器插畫',
    icon: Droplets,
  },
  {
    id: 'drink',
    title: '飲用水',
    body: '依居住人數備妥飲用水，供飲用與簡易料理使用。',
    image: waterBottleImage,
    imageAlt: '飲用水插畫',
    icon: Droplets,
  },
  {
    id: 'official-water',
    title: '確認公告',
    body: '查看停水時段、範圍與預計恢復供水的最新資訊。',
    image: waterNoticeImage,
    imageAlt: '公告地圖插畫',
    icon: FileText,
  },
  {
    id: 'wash',
    title: '清潔備援',
    body: '準備乾洗手與濕紙巾，停水期間維持基本手部清潔。',
    image: waterCleanImage,
    imageAlt: '乾洗手與濕紙巾插畫',
    icon: Wrench,
  },
  {
    id: 'filter',
    title: '濾水工具',
    body: '備妥簡易濾水工具，必要時協助處理備援水源。',
    image: waterFilterImage,
    imageAlt: '濾水設備插畫',
    icon: Droplets,
  },
  {
    id: 'sanitation',
    title: '如廁備援',
    body: '預留沖洗用水與水桶，維持租屋處基本衛生需求。',
    image: waterToiletImage,
    imageAlt: '馬桶與水桶插畫',
    icon: Info,
  },
  {
    id: 'cooking',
    title: '餐食準備',
    body: '預先準備簡便餐食，降低停水期間清洗與料理需求。',
    image: waterFoodImage,
    imageAlt: '乾糧與罐頭插畫',
    icon: House,
  },
  {
    id: 'backup-bag',
    title: '緊急備用品',
    body: '將飲水、藥品與日用品集中收納，方便臨時取用。',
    image: waterBackpackImage,
    imageAlt: '緊急背包插畫',
    icon: Building2,
  },
  {
    id: 'share-water',
    title: '同步室友',
    body: '將公告分享給室友或親友，共同安排飲水與清潔需求。',
    image: contactImage,
    imageAlt: '手機聯絡親友插畫',
    icon: Users,
  },
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

const nextPowerNotice = computed(() =>
  events.find(event => event.utilityType === 'power' && event.status === 'scheduled'),
)

const nextWaterNotice = computed(() =>
  events.find(event => event.utilityType === 'water' && event.status === 'scheduled'),
)

const featuredSourceUpdatedAt = computed(() => nextPowerNotice.value?.sourceUpdatedAt ?? '今天 10:42')

function getOfficialCardClass(utilityType: UtilityType): string {
  return utilityType === 'power'
    ? 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,1),rgba(255,255,255,1))]'
    : 'border-sky-200 bg-[linear-gradient(135deg,rgba(243,249,255,1),rgba(255,255,255,1))]'
}

export function useOutageData() {
  return {
    activePrepGuide,
    activePreparationDescription,
    activePreparationItems,
    activePreparationTitle,
    changeNotif,
    events,
    featuredSourceUpdatedAt,
    getOfficialCardClass,
    nextPowerNotice,
    nextWaterNotice,
    pageTabs,
    powerNotif,
    powerOfficialUrl,
    reminderLeadTime,
    rentalAddress,
    syncRoommates,
    waterNotif,
    waterOfficialUrl,
  }
}
