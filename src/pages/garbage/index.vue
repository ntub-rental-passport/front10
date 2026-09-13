<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
<<<<<<< HEAD
import {
  Bell,
  BookOpen,
  Crosshair,
  List,
=======
import type { Component } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  Crosshair,
  Footprints,
  List,
  Loader2,
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  Map,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Star,
  Truck,
  X,
} from 'lucide-vue-next'
<<<<<<< HEAD
import GarbageMap from '@/src/components/garbage/GarbageMap.vue'
import GarbageGuide from '@/src/components/garbage/GarbageGuide.vue'
import GarbageReport from '@/src/components/garbage/GarbageReport.vue'
import GarbageFilters from '@/src/components/garbage/GarbageFilters.vue'
import CollectionCountdown from '@/src/components/garbage/CollectionCountdown.vue'
import WeeklySchedule from '@/src/components/garbage/WeeklySchedule.vue'
import { matchesStatus, stopStatus, type StatusFilter } from '@/src/utils/garbage-status'
import {
  operatesOn,
  collectionSchedules,
  nextCollection,
  nextTimeLabel,
} from '@/src/utils/garbage-countdown'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog/index'
import { getAuthSession } from '@/src/composables/useAuth'
import {
  garbageRequest,
  loadGarbageStops,
  loadTrucks,
  type GarbageReminder,
} from '@/src/services/garbageApi'
import {
  distanceMeters,
  freshTrucks,
  isCollectionDay,
  overlaps,
  scheduleStatus,
  taipeiDate,
  validPoint,
  type GarbageStop,
  type GarbageCity,
  type Point,
  type TruckPosition,
} from '@/src/utils/garbage'
import './garbage.css'

const filtersOpen = ref(false)
const city = ref<GarbageCity>('臺北市')
const sourceUrl = computed(() =>
  city.value === '臺北市'
    ? 'https://data.gov.tw/dataset/136515'
    : 'https://data.ntpc.gov.tw/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8',
)
const reportOpen = ref(false)
const dataCheckedAt = ref('尚無更新紀錄')
const tabs = [
=======
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type StationStatus = 'arriving' | 'on-duty' | 'off-duty'
type StationType = 'route' | 'mobile' | 'fixed'
type TabId = 'map' | 'list' | 'nearby' | 'manual' | 'favorites' | 'reminder' | 'guide'

interface Station {
  id: string
  name: string
  district: string
  address: string
  timeRange: string
  day: number[]
  type: StationType
  distance: number
  walkMinutes: number
  lat: number
  lng: number
  plate: string
  items: string[]
  status: StationStatus
  etaMinutes: number | null
  etaTime: string | null
}

interface Reminder {
  id: string
  stationId: string
  stationName: string
  days: number[]
  minutesBefore: number
  active: boolean
}

interface ReminderFormState {
  stationId: string
  days: number[]
  minutesBefore: number
  notifyPush: boolean
  notifyBrowser: boolean
  notifyEmail: boolean
}

interface NominatimAddress {
  city_district?: string
  suburb?: string
  town?: string
  county?: string
  city?: string
}

type NotifyKey = 'notifyPush' | 'notifyBrowser' | 'notifyEmail'

const DISTRICTS = [
  { value: 'banqiao', label: '新北市板橋區' },
  { value: 'sanchong', label: '新北市三重區' },
  { value: 'zhonghe', label: '新北市中和區' },
  { value: 'yonghe', label: '新北市永和區' },
  { value: 'xinzhuang', label: '新北市新莊區' },
]

const CITIES = ['新北市', '台北市', '桃園市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '嘉義市']

const DISTRICT_SUGGESTIONS: Record<string, string[]> = {
  '新北市': ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '樹林區', '汐止區'],
  '台北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  '桃園市': ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區'],
}

const VILLAGE_SUGGESTIONS: Record<string, string[]> = {
  '板橋區': ['文化里', '光埔里', '新埔里', '中山里', '後埔里', '南雅里', '民生里', '漢生里', '府中里'],
  '三重區': ['三和里', '自強里', '新興里', '光榮里'],
  '中和區': ['中和里', '南勢里', '錦和里', '員山里'],
  '永和區': ['永和里', '秀朗里', '福和里', '竹林里'],
  '新莊區': ['新莊里', '中港里', '化成里', '文德里'],
}

const TIME_RANGES = [
  { label: '全天', value: '' },
  { label: '上午 06:00 – 12:00', value: '06:00-12:00' },
  { label: '下午 12:00 – 18:00', value: '12:00-18:00' },
  { label: '傍晚 17:00 – 20:00', value: '17:00-20:00' },
  { label: '晚間 18:00 – 22:00', value: '18:00-22:00' },
]

const DAYS = ['日', '一', '二', '三', '四', '五', '六']

const ITEM_CONFIG: Record<string, { dot: string; badge: string }> = {
  '一般垃圾': { dot: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  '資源回收': { dot: 'bg-blue-500', badge: 'border-blue-200 bg-blue-50 text-blue-700' },
  '廚餘': { dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
}

const FAVORITES_STORAGE_KEY = 'rentmate-garbage-favorites'
const REMINDERS_STORAGE_KEY = 'rentmate-garbage-reminders'
const NOTIFY_OPTIONS: { key: NotifyKey; label: string }[] = [
  { key: 'notifyPush', label: '推播通知' },
  { key: 'notifyBrowser', label: '瀏覽器通知' },
  { key: 'notifyEmail', label: 'Email 通知' },
]
const ITEM_LABELS = {
  general: '一般垃圾',
  recycle: '資源回收',
  food: '廚餘',
} as const
const ITEM_FILTER_OPTIONS = [
  { key: 'general', label: ITEM_LABELS.general },
  { key: 'recycle', label: ITEM_LABELS.recycle },
  { key: 'food', label: ITEM_LABELS.food },
] as const

const MOCK_STATIONS: Station[] = [
  { id: 's1', name: '漢生東路／仁化路口', district: '新北市板橋區', address: '新北市板橋區漢生東路與仁化路口', timeRange: '18:40 - 18:55', day: [1, 3, 5, 6], type: 'route', distance: 230, walkMinutes: 2, lat: 25.0162, lng: 121.4615, plate: 'DEF-5678', items: ['資源回收', '廚餘'], status: 'arriving', etaMinutes: 3, etaTime: '18:43' },
  { id: 's2', name: '新埔路二段（板橋衛生所）', district: '新北市板橋區', address: '新北市板橋區新埔路二段10號附近', timeRange: '18:20 - 18:40', day: [1, 3, 5, 6], type: 'fixed', distance: 380, walkMinutes: 3, lat: 25.0128, lng: 121.458, plate: 'GHI-9012', items: ['一般垃圾', '資源回收', '廚餘'], status: 'on-duty', etaMinutes: 8, etaTime: '18:35' },
  { id: 's3', name: '中山路一段／新生路口', district: '新北市板橋區', address: '新北市板橋區中山路一段50號附近', timeRange: '19:10 - 19:30', day: [1, 2, 3, 4, 5, 6], type: 'mobile', distance: 450, walkMinutes: 4, lat: 25.011, lng: 121.456, plate: 'JKL-3456', items: ['一般垃圾', '資源回收'], status: 'off-duty', etaMinutes: null, etaTime: null },
  { id: 's4', name: '光華路一段／新興路口', district: '新北市板橋區', address: '新北市板橋區光華路一段120號附近', timeRange: '18:30 - 18:50', day: [1, 3, 5], type: 'route', distance: 120, walkMinutes: 1, lat: 25.0145, lng: 121.4592, plate: 'ABC-1234', items: ['一般垃圾', '資源回收'], status: 'arriving', etaMinutes: 5, etaTime: '18:40' },
  { id: 's5', name: '府中路／信義路口', district: '新北市板橋區', address: '新北市板橋區府中路30號附近', timeRange: '17:30 - 17:50', day: [1, 3, 5], type: 'route', distance: 550, walkMinutes: 5, lat: 25.0175, lng: 121.463, plate: 'MNO-7890', items: ['一般垃圾'], status: 'off-duty', etaMinutes: null, etaTime: null },
  { id: 's6', name: '三新路二段／自強路口', district: '新北市三重區', address: '新北市三重區三新路二段88號附近', timeRange: '18:00 - 18:20', day: [2, 4, 6], type: 'fixed', distance: 520, walkMinutes: 5, lat: 25.062, lng: 121.487, plate: 'PQR-1122', items: ['一般垃圾', '資源回收', '廚餘'], status: 'on-duty', etaMinutes: 12, etaTime: '18:36' },
  { id: 's7', name: '文化一段／民生路口', district: '新北市板橋區', address: '新北市板橋區文化路一段120號附近', timeRange: '19:00 - 19:20', day: [1, 3, 5, 6], type: 'route', distance: 740, walkMinutes: 7, lat: 25.0145, lng: 121.4592, plate: 'STU-3344', items: ['一般垃圾', '資源回收'], status: 'off-duty', etaMinutes: null, etaTime: null },
  { id: 's8', name: '南雅南路二段（板橋國小旁）', district: '新北市板橋區', address: '新北市板橋區南雅南路二段10號附近', timeRange: '19:30 - 19:50', day: [2, 4, 6], type: 'fixed', distance: 680, walkMinutes: 6, lat: 25.0128, lng: 121.458, plate: 'VWX-5566', items: ['資源回收', '廚餘'], status: 'off-duty', etaMinutes: null, etaTime: null },
]

const STATUS_CONFIG: Record<StationStatus, { label: string; badgeClass: string; dotClass: string; pulse: boolean; markerColor: string }> = {
  arriving: { label: '即將抵達', badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700', dotClass: 'bg-emerald-500', pulse: true, markerColor: '#10b981' },
  'on-duty': { label: '執勤中', badgeClass: 'border-blue-200 bg-blue-50 text-blue-700', dotClass: 'bg-blue-500', pulse: true, markerColor: '#3b82f6' },
  'off-duty': { label: '未執勤', badgeClass: 'border-slate-200 bg-slate-50 text-slate-500', dotClass: 'bg-slate-400', pulse: false, markerColor: '#94a3b8' },
}

const GUIDE_SECTIONS = [
  { title: '1. 地圖查詢', desc: '在地圖查詢頁面中，您可以透過地址搜尋或直接在地圖上瀏覽，快速找到在家 500 公尺內的清運站點。地圖上的標記以不同顏色表示各垃圾車的即時狀態（執勤中、即將抵達、未執勤）。點擊任一標記即可查看該站點的詳細資訊，包含車牌、表定時間、回收項目等。' },
  { title: '2. 列表查詢', desc: '列表查詢提供多條件篩選功能，您可以依行政區、時間、星期、時段、站點種類和關鍵字進行搜尋。查詢結果以表格呈現，方便快速比較各站點的清運時間與狀態。' },
  { title: '3. 附近查詢', desc: '點擊「附近查詢」後，系統將自動透過 GPS 定位您的當前位置，並搜尋在 500 公尺內的所有清運站點。結果依距離由近到遠排序，幫您快速找到最近的清運點。' },
  { title: '4. 手動定位查詢', desc: '若您想查詢特定地點的清運資訊，可以在地圖上長按標記至目標位置。系統將以該點為中心，自動搜尋附近的清運站點，適合事先規劃特定地點的清運時間。' },
  { title: '5. 收藏功能', desc: '對於常用的清運站點，您可以點擊「加入收藏」快速加入我的收藏清單。收藏頁面以卡片形式呈現各站點資訊，並提供「提醒」與「導航」快捷操作，方便日常使用。' },
  { title: '6. 提醒設定', desc: '您可以為收藏的站點設定清運提醒、選擇提醒日期、提前通知時間（10/15/30 分鐘）與通知方式（推播/瀏覽器/Email），系統將在清運前自動通知您，別再錯過垃圾車。' },
]

const TABS: { id: TabId; label: string; icon: Component }[] = [
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  { id: 'map', label: '地圖查詢', icon: Map },
  { id: 'list', label: '列表查詢', icon: List },
  { id: 'nearby', label: '附近查詢', icon: Crosshair },
  { id: 'manual', label: '手動定位', icon: MapPin },
  { id: 'favorites', label: '我的收藏', icon: Star },
  { id: 'reminder', label: '提醒設定', icon: Bell },
  { id: 'guide', label: '操作指引', icon: BookOpen },
<<<<<<< HEAD
] as const
type Tab = (typeof tabs)[number]['id']
const tab = ref<Tab>('map'),
  stops = ref<GarbageStop[]>([]),
  loading = ref(true),
  dataError = ref('')
const district = ref(''),
  village = ref(''),
  road = ref(''),
  timeStart = ref(''),
  timeEnd = ref('')
const queryDate = ref(taipeiDate()),
  now = ref(new Date()),
  page = ref(1)
const location = ref<Point | null>(null),
  manualPoint = ref<Point | null>(null)
const locationMessage = ref('尚未定位'),
  tracking = ref(false)
let watchId: number | undefined
const selected = ref<GarbageStop | null>(null),
  toast = ref('')
const garbageMap = ref<InstanceType<typeof GarbageMap> | null>(null)
async function showRoute(stop: GarbageStop) {
  if (!mapVisible.value) tab.value = 'map'
  selected.value = null
  await nextTick()
  garbageMap.value?.openRoute(stop)
  document
    .querySelector('.map-query-stage')
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
const vehicles = ref<TruckPosition[]>([]),
  refreshing = ref(false)
const caps = ref({ email: false, push: false, publicKey: '' }),
  backendMessage = ref('')
const reminders = ref<GarbageReminder[]>([]),
  saving = ref(false)
const stationSearch = ref(''),
  reminderStop = ref(''),
  reminderDate = ref(taipeiDate())
const minutesBefore = ref(15),
  notifyPush = ref(false),
  notifyEmail = ref(false)
const email = getAuthSession()?.email || ''
const favoritesKey =
  'rentmate-taipei-garbage-favorites:' + (getAuthSession()?.userId || email || 'guest')
const favorites = ref<string[]>([])
const cityFavoriteCount = computed(
  () => stops.value.filter((s) => favorites.value.includes(s.id)).length,
)
try {
  const value = JSON.parse(localStorage.getItem(favoritesKey) || '[]')
  if (Array.isArray(value)) favorites.value = value.filter((v) => typeof v === 'string')
} catch {
  /* Storage unavailable. */
}
watch(
  favorites,
  (value) => {
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(value))
    } catch {
      toast.value = '瀏覽器無法保存收藏，離開頁面後可能遺失。'
    }
  },
  { deep: true },
)
// Group timetables at the same physical address once, not on each clock tick.
function physicalKey(stop: GarbageStop) {
  return [
    stop.city,
    stop.district,
    stop.address.trim(),
    ...(stop.city === '新北市' ? [stop.lat, stop.lng] : []),
  ].join('|')
}
const stopGroups = computed(() => {
  const groups = new globalThis.Map<string, GarbageStop[]>()
  for (const stop of stops.value) {
    const key = physicalKey(stop)
    const group = groups.get(key) || []
    group.push(stop)
    groups.set(key, group)
  }
  return groups
})
function schedulesAt(stop: GarbageStop) {
  return stopGroups.value.get(physicalKey(stop)) || [stop]
}
function submitFilters() {
  statusFilter.value = 'all'
  filtersOpen.value = false
  selected.value = results.value[0] || null
}
const villages = computed(() =>
  [
    ...new Set(
      stops.value
        .filter((s) => !district.value || s.district === district.value)
        .map((s) => s.village),
    ),
  ].sort(),
)
const roads = computed(() =>
  [
    ...new Set(
      stops.value
        .filter(
          (s) =>
            (!district.value || s.district === district.value) &&
            (!village.value || s.village === village.value),
        )
        .map((s) => s.road),
    ),
  ].sort(),
)
const normalized = (s: string) => s.trim().replaceAll('台', '臺')
const statusFilter = ref<StatusFilter>('all')
function setStatusFilter(value: StatusFilter) {
  statusFilter.value = value
  queryDate.value = taipeiDate(now.value)
  timeStart.value = ''
  timeEnd.value = ''
}
const statusClock = computed(() => Math.floor(now.value.getTime() / 10000) * 10000)
const selectedStatus = computed(() =>
  selected.value
    ? stopStatus(
        selected.value,
        statusClock.value,
        statusFilter.value === 'all' ? queryDate.value : taipeiDate(now.value),
      )
    : null,
)
const stopStateLabels = {
  upcoming: '即將抵達',
  pending: '尚未抵達',
  active: '營運中',
  ended: '已結束',
  unknown: '當日無班表',
}
const selectedArrivalCountdown = computed(() => {
  const stop = selected.value
  if (!stop) return ''
  const schedules = (['garbage', 'recycling', 'food'] as const)
    .flatMap((kind) => collectionSchedules([stop], kind))
    .filter((schedule) => schedule.arrival === stop.arrival)
  const next = nextCollection(schedules, now.value)
  if (!next) return '尚無可用班次'
  if (next.active) return '表定收運中'
  const minutes = Math.ceil((next.arrivalAt - now.value.getTime()) / 60000)
  const hours = Math.floor(minutes / 60)
  const duration = `${hours ? `${hours} 小時 ` : ''}${minutes % 60} 分鐘後`
  return next.serviceDate === taipeiDate(now.value) ? duration : `下一班：${duration}`
})
const statusOptions = [
  { id: 'all', label: '全部站點' },
  { id: 'now', label: '現在' },
  { id: '10', label: '10分內抵達' },
  { id: '30', label: '30分內抵達' },
  { id: '60', label: '1小時內抵達' },
] as const
const filtered = computed(() =>
  stops.value.filter(
    (s) =>
      (!district.value || s.district === district.value) &&
      (!village.value || s.village === village.value) &&
      (!road.value || normalized(s.address).includes(normalized(road.value))) &&
      overlaps(s, timeStart.value, timeEnd.value) &&
      (statusFilter.value !== 'all' || operatesOn(s, queryDate.value)),
  ),
)
const center = computed(() => (tab.value === 'manual' ? manualPoint.value : location.value))
const nearbyRadius = ref(500)
const searchRadius = computed(() =>
  tab.value === 'manual' ? 200 : tab.value === 'nearby' ? nearbyRadius.value : 500,
)
const nearby = (point: Point | null) =>
  point
    ? stops.value
        .filter(validPoint)
        .map((s) => ({ ...s, distance: distanceMeters(point, s) }))
        .filter((s) => s.distance <= searchRadius.value)
        .sort((a, b) => a.distance - b.distance)
    : []
const nearbyStops = computed(() => nearby(center.value))
const results = computed(() => {
  const base =
    tab.value === 'nearby' || tab.value === 'manual'
      ? nearbyStops.value
      : tab.value === 'favorites'
        ? stops.value.filter((s) => favorites.value.includes(s.id))
        : filtered.value
  return statusFilter.value === 'all'
    ? base
    : base.filter((s) => matchesStatus(s, statusFilter.value, statusClock.value))
})
const pages = computed(() => Math.max(1, Math.ceil(results.value.length / 20)))
const visible = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20))
const dashboardCandidates = computed(() => {
  const seen = new Set<string>()
  return nearby(center.value)
    .filter(
      (s) =>
        statusFilter.value === 'all' ||
        schedulesAt(s).some((schedule) =>
          matchesStatus(schedule, statusFilter.value, statusClock.value),
        ),
    )
    .filter((s) => {
      const key = physicalKey(s)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
})
const dashboardStops = computed(() =>
  dashboardCandidates.value.map((s) => {
    const schedules = schedulesAt(s)
    const next = nextCollection(
      ['garbage', 'recycling', 'food'].flatMap((kind) =>
        collectionSchedules(schedules, kind as 'garbage' | 'recycling' | 'food'),
      ),
      now.value,
    )
    const minutes = next
      ? Math.max(0, Math.ceil((next.arrivalAt - now.value.getTime()) / 60000))
      : null
    const today = taipeiDate(now.value)
    const weekday = new Date(`${today}T12:00:00+08:00`).getUTCDay()
    const todayTimes = [
      ...new Set(
        ['garbage', 'recycling', 'food']
          .flatMap((kind) =>
            collectionSchedules(schedules, kind as 'garbage' | 'recycling' | 'food'),
          )
          .filter((s) => s.days.includes(weekday))
          .map((s) => s.arrival),
      ),
    ].sort()
    return {
      ...s,
      todayLabel: todayTimes.length ? `今日表定 ${todayTimes.join('、')}` : '今日未安排表定收運',
      scheduleNote:
        next && next.serviceDate > today && todayTimes.length
          ? '今日表定時間已過；實際是否離站待確認'
          : '依每週班表計算，非即時車輛預測',
      estimate: !next
        ? '待提供班表'
        : next.active
          ? '表定收運中'
          : minutes! < 60
            ? `${minutes} 分`
            : minutes! < 1440
              ? `${Math.floor(minutes! / 60)} 小時 ${minutes! % 60} 分`
              : `${Math.floor(minutes! / 1440)} 天 ${Math.floor((minutes! % 1440) / 60)} 小時`,
      nextLabel: next ? nextTimeLabel(next) : '尚無可用班次',
      arrivalClock: next
        ? new Intl.DateTimeFormat('zh-TW', {
            timeZone: 'Asia/Taipei',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(next.arrivalAt)
        : '—',
      arrivalDate: next ? taipeiDate(new Date(next.arrivalAt)) : '',
    }
  }),
)
const weeklyStop = ref<GarbageStop | null>(null)
async function showWeekly(s: GarbageStop) {
  tab.value = 'list'
  resetFilters()
  weeklyStop.value = s
  await nextTick()
  const panel = document.querySelector<HTMLElement>('.weekly-schedule')
  panel?.focus({ preventScroll: true })
  panel?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
const freshVehicles = computed<TruckPosition[]>((previous) => {
  const next = freshTrucks(vehicles.value, now.value)
  return previous && next.length === previous.length && next.every((v, i) => v === previous[i])
    ? previous
    : next
})
const mapVisible = computed(() => ['map', 'manual', 'nearby'].includes(tab.value))
const reminderOptions = computed(() => {
  const matches = stops.value
    .filter((s) => normalized(s.address + ' ' + s.route).includes(normalized(stationSearch.value)))
    .slice(0, 100)
  const current = stops.value.find((s) => s.id === reminderStop.value)
  return current && !matches.some((s) => s.id === current.id) ? [current, ...matches] : matches
})
watch(district, () => {
  village.value = ''
  road.value = ''
})
watch(city, () => {
  weeklyStop.value = null
  resetFilters()
  selected.value = null
  manualPoint.value = null
  reminderStop.value = ''
  stationSearch.value = ''
  vehicles.value = []
  void loadData()
  void refreshGPS()
})
watch(village, () => {
  road.value = ''
})
watch(results, () => {
  page.value = 1
})
watch(tab, (value) => {
  page.value = 1
  selected.value = null
  if (value === 'nearby' && !tracking.value) locate()
})
function resetFilters() {
  statusFilter.value = 'all'
  district.value = ''
  village.value = ''
  road.value = ''
  timeStart.value = ''
  timeEnd.value = ''
  queryDate.value = taipeiDate()
}
function toggleFavorite(s: GarbageStop) {
  favorites.value = favorites.value.includes(s.id)
    ? favorites.value.filter((id) => id !== s.id)
    : [...favorites.value, s.id]
}
function distanceLabel(s: GarbageStop) {
  return !validPoint(s)
    ? '原始座標待確認'
    : center.value
      ? Math.round(distanceMeters(center.value, s)) + ' m 直線距離'
      : '定位後顯示距離'
}
function navigationUrl(s: GarbageStop) {
  return (
    'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(validPoint(s) ? s.lat + ',' + s.lng : s.address) +
    '&travelmode=walking'
  )
}
function openReminder(s: GarbageStop) {
  reminderStop.value = s.id
  stationSearch.value = s.address
  tab.value = 'reminder'
}
function locate() {
  if (!navigator.geolocation) {
    locationMessage.value = '此瀏覽器不支援定位，請使用手動定位。'
    return
  }
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  tracking.value = true
  locationMessage.value = '正在取得 GPS 位置…'
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      location.value = { lat: p.coords.latitude, lng: p.coords.longitude }
      locationMessage.value = 'GPS 追蹤中 · 精確度約 ' + Math.round(p.coords.accuracy) + ' m'
    },
    (e) => {
      locationMessage.value =
        e.code === 1
          ? '定位權限遭拒，請允許定位或使用手動定位。'
          : '暫時無法取得位置，請重試或使用手動定位。'
      location.value = null
      tracking.value = false
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      watchId = undefined
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  )
}
function stopTracking() {
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  watchId = undefined
  tracking.value = false
  locationMessage.value = '已停止追蹤，顯示最後定位位置'
}
async function loadData() {
  const requestedCity = city.value
  loading.value = true
  dataError.value = ''
  stops.value = []
  dataCheckedAt.value = '尚無更新紀錄'
  try {
    const loaded = await loadGarbageStops(requestedCity)
    if (requestedCity !== city.value) return
    stops.value = loaded
    const file =
      requestedCity === '臺北市' ? 'taipei-garbage-source.json' : 'new-taipei-garbage-source.json'
    const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`, {
      signal: AbortSignal.timeout(10000),
    })
    const meta = response.ok ? await response.json() : null
    if (requestedCity === city.value && meta)
      dataCheckedAt.value = String(meta.lastCheckedAt || meta.importedAt || '尚無更新紀錄')
  } catch (e) {
    if (requestedCity === city.value) dataError.value = (e as Error).message
  } finally {
    if (requestedCity === city.value) loading.value = false
  }
}
async function refreshGPS() {
  if (city.value === '新北市') {
    vehicles.value = []
    return
  }
  if (refreshing.value) return
  refreshing.value = true
  try {
    const data = await loadTrucks()
    if (city.value !== '臺北市') return
    vehicles.value = data.vehicles
  } catch {
    vehicles.value = []
  } finally {
    refreshing.value = false
  }
}
async function loadReminders() {
  if (!getAuthSession()?.accessToken) {
    backendMessage.value = '請以正式租客帳號登入，才能保存及接收提醒。'
    return
  }
  try {
    reminders.value = await garbageRequest<GarbageReminder[]>('/reminders')
    backendMessage.value = ''
  } catch (e) {
    backendMessage.value = (e as Error).message
  }
}
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw new Error('此瀏覽器不支援系統推播，請選擇 Gmail。')
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('請允許通知權限，或選擇 Gmail。')
  const registration = await navigator.serviceWorker.register('/garbage-sw.js')
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing.toJSON()
  const key = caps.value.publicKey.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(key.padEnd(Math.ceil(key.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  )
  return (
    await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
  ).toJSON()
}
async function saveReminder() {
  if (!reminderStop.value || !reminderDate.value) {
    toast.value = '請選擇清運站點及日期。'
    return
  }
  if (!notifyPush.value && !notifyEmail.value) {
    toast.value = '請至少選擇一種通知方式。'
    return
  }
  const station = stops.value.find((s) => s.id === reminderStop.value)
  if (!station || !operatesOn(station, reminderDate.value)) {
    toast.value = '此站點在所選日期沒有表定收運，請改選其他日期。'
    return
  }
  saving.value = true
  try {
    const subscription = notifyPush.value ? await subscribePush() : undefined
    await garbageRequest('/reminders', {
      method: 'POST',
      body: JSON.stringify({
        stationId: reminderStop.value,
        date: reminderDate.value,
        minutesBefore: minutesBefore.value,
        notifyPush: notifyPush.value,
        notifyEmail: notifyEmail.value,
        subscription,
      }),
    })
    await loadReminders()
    toast.value = '提醒已保存，將依表定抵達時間提前通知。'
  } catch (e) {
    toast.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
async function editReminder(r: GarbageReminder, remove = false) {
  try {
    await garbageRequest('/reminders/' + r.id, {
      method: remove ? 'DELETE' : 'PATCH',
      ...(remove ? {} : { body: JSON.stringify({ active: !r.active }) }),
    })
    await loadReminders()
  } catch (e) {
    toast.value = (e as Error).message
  }
}
const statusLabels: Record<string, string> = {
  pending: '待發送',
  sending: '發送中／待確認',
  sent: '已發送',
  failed: '發送失敗',
  missed: '已逾時',
  disabled: '未啟用',
}
let ticker: ReturnType<typeof setInterval>, poller: ReturnType<typeof setInterval>
onMounted(() => {
  void loadData()
  void refreshGPS()
  void loadReminders()
  void garbageRequest<typeof caps.value>('/capabilities')
    .then((value) => {
      caps.value = value
    })
    .catch(() => {
      backendMessage.value = '提醒服務未連線，請確認後端已啟動。'
    })
  ticker = setInterval(() => {
    now.value = new Date()
  }, 1000)
  poller = setInterval(() => {
    void refreshGPS()
    if (tab.value === 'reminder') void loadReminders()
  }, 30000)
})
onUnmounted(() => {
  clearInterval(ticker)
  clearInterval(poller)
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
})
</script>

<template>
  <div class="garbage-page garbage-page--wide" :class="{ 'garbage-page--map': tab === 'map' }">
    <div class="garbage-sticky-header">
      <header class="garbage-header">
        <div>
          <p class="eyebrow">TAIPEI & NEW TAIPEI · RENTMATE</p>
          <h1>{{ city }}垃圾車時間查詢</h1>
        </div>
      </header>
      <nav class="garbage-tabs" aria-label="垃圾清運功能">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          :aria-current="tab === item.id ? 'page' : undefined"
          @click="tab = item.id"
        >
          <component :is="item.icon" :size="17" />{{ item.label
          }}<span v-if="item.id === 'favorites' && cityFavoriteCount" class="count">{{
            cityFavoriteCount
          }}</span>
        </button>
      </nav>
      <div class="coverage">
        <select v-model="city" aria-label="清運縣市">
          <option>臺北市</option>
          <option>新北市</option>
        </select>
      </div>
    </div>
    <div v-if="toast" role="status" class="garbage-toast">
      <span>{{ toast }}</span
      ><button aria-label="關閉訊息" @click="toast = ''"><X :size="18" /></button>
    </div>
    <div v-if="dataError" class="notice error" role="alert">
      {{ dataError }} <button @click="loadData">重新載入</button>
    </div>
    <div v-if="loading" class="notice" role="status">正在載入{{ city }}清運站點…</div>
    <template v-if="!['reminder', 'guide'].includes(tab)">
      <section
        class="query-layout"
        :class="{ 'no-sidebar': tab !== 'list', 'map-query-layout': tab === 'map' }"
      >
        <GarbageFilters
          v-if="tab === 'list'"
          v-model:city="city"
          v-model:district="district"
          v-model:village="village"
          v-model:road="road"
          v-model:date="queryDate"
          v-model:start="timeStart"
          v-model:end="timeEnd"
          :villages="villages"
          :roads="roads"
          :count="results.length"
          @reset="resetFilters"
          @submit="submitFilters"
          show-city
        />
        <div class="results-column">
          <WeeklySchedule
            v-if="tab === 'list' && weeklyStop"
            :stops="schedulesAt(weeklyStop)"
            @close="weeklyStop = null"
          />
          <div v-if="tab === 'nearby'" class="nearby-controls">
            <label
              >查詢半徑
              <select v-model.number="nearbyRadius" aria-label="附近查詢半徑">
                <option v-for="radius in [100, 200, 300, 400, 500]" :key="radius" :value="radius">
                  {{ radius }} 公尺
                </option>
              </select>
            </label>
            <span class="helper">{{ locationMessage }} · 以 GPS 位置為中心，依直線距離查詢</span>
            <button class="soft-button" @click="tracking ? stopTracking() : locate()">
              <Navigation :size="16" />{{ tracking ? '停止 GPS 追蹤' : '啟用 GPS 定位' }}
            </button>
          </div>
          <section
            v-if="['map', 'manual', 'favorites'].includes(tab)"
            class="live-section"
            aria-labelledby="live-title"
          >
            <div class="section-heading">
              <div>
                <h2 id="live-title">附近清運地點 <span>即時動態看板</span></h2>
                <p>
                  {{
                    tab === 'manual'
                      ? manualPoint
                        ? '以手動選點為中心 · 半徑 200 公尺'
                        : '請點擊地圖選擇查詢中心 · 半徑 200 公尺'
                      : locationMessage
                  }}
                </p>
              </div>
              <div v-if="tab !== 'manual'" class="toolbar">
                <button class="soft-button" @click="tracking ? stopTracking() : locate()">
                  <Crosshair :size="16" />{{ tracking ? '停止 GPS 追蹤' : '啟用 GPS 定位' }}</button
                ><button
                  class="icon-button"
                  aria-label="更新車輛定位"
                  :disabled="refreshing"
                  @click="refreshGPS"
                >
                  <RefreshCw :size="17" :class="{ spinning: refreshing }" />
                </button>
              </div>
            </div>
            <p v-if="freshVehicles.length" class="gps-status">
              <span class="green-dot" />GPS 即時定位 · {{ freshVehicles.length }} 輛車（30 秒更新）
            </p>
            <div v-if="dashboardStops.length" class="tracker-grid">
              <article v-for="(s, i) in dashboardStops" :key="s.id" class="tracker-card">
                <p class="tracker-status">{{ s.todayLabel }}</p>
                <div class="tracker-top">
                  <span class="number">{{ i + 1 }}</span
                  ><button class="station-title" @click="selected = s">{{ s.address }}</button
                  ><button
                    class="favorite-button"
                    :class="{ saved: favorites.includes(s.id) }"
                    :aria-label="favorites.includes(s.id) ? '取消收藏' : '收藏站點'"
                    :aria-pressed="favorites.includes(s.id)"
                    @click="toggleFavorite(s)"
                  >
                    <Star :size="19" />
                  </button>
                </div>
                <div class="tracker-time">
                  <div class="truck-icon"><Truck :size="23" /></div>
                  <div>
                    <small>距下一班 · 表定估算</small>
                    <strong>{{ s.estimate }}</strong>
                    <p>{{ s.scheduleNote }}</p>
                  </div>
                  <div class="tracker-arrival">
                    <small>下一班時刻 · 表定</small>
                    <strong>{{ s.arrivalClock }}</strong>
                    <p>{{ s.arrivalDate }}</p>
                  </div>
                </div>
                <CollectionCountdown :stops="schedulesAt(s)" :now="now" compact />
                <footer>
                  <span><MapPin :size="13" />{{ Math.round(s.distance) }} m 直線距離</span
                  ><button class="text-button" @click="showWeekly(s)">查看更多班次 →</button>
                </footer>
                <p
                  v-if="
                    freshVehicles.some(
                      (v) => v.plate.replaceAll('-', '') === s.plate.replaceAll('-', ''),
                    )
                  "
                  class="vehicle-linked"
                >
                  此車有最新 GPS，可於地圖查看位置
                </p>
              </article>
            </div>
            <div v-else-if="!['map', 'manual'].includes(tab)" class="nearby-empty">
              <Crosshair :size="26" />
              <div>
                <strong>{{
                  location
                    ? `目前位置 500 公尺內沒有${city}清運站點`
                    : '從你的位置，找到最近的清運站點'
                }}</strong>
                <p>
                  {{
                    location
                      ? `可使用地圖瀏覽${city}，或切換手動定位選擇其他位置。`
                      : '啟用定位後顯示附近站點、實際直線距離與表定倒數。'
                  }}
                </p>
              </div>
              <button class="text-button" @click="tab = 'manual'">手動選點 →</button>
            </div>
          </section>
          <div
            v-if="!['reminder', 'guide'].includes(tab)"
            class="status-filters"
            aria-label="表定收運狀態"
          >
            <button
              v-for="option in statusOptions"
              :key="option.id"
              :aria-pressed="statusFilter === option.id"
              @click="setStatusFilter(option.id)"
            >
              {{ option.label }}
            </button>
          </div>
          <div v-if="mapVisible" class="map-query-stage wide-map">
            <button v-if="tab === 'map'" class="map-query-button" @click="filtersOpen = true">
              <Search :size="20" />查詢條件
            </button>
            <GarbageMap
              v-if="mapVisible"
              ref="garbageMap"
              :key="city"
              :city="city"
              :stops="results"
              :route-stops="stops"
              :timestamp="statusClock"
              :schedule-date="statusFilter === 'all' ? queryDate : taipeiDate(now)"
              :center="center"
              :radius="searchRadius"
              :manual="tab === 'manual'"
              :vehicles="freshVehicles"
              :focus="selected"
              @pick="manualPoint = $event"
              @select="selected = $event"
            />
          </div>
          <div v-if="tab !== 'map'" class="section-heading results-heading">
            <h2>
              {{ tab === 'favorites' ? '我的收藏' : '清運站點' }}
              <span class="result-count">{{ results.length }}</span>
            </h2>
            <span class="helper">{{
              tab === 'nearby' || tab === 'manual' ? '依距離由近至遠' : '官方站點與表定時間'
            }}</span>
          </div>
          <div v-if="!results.length && !loading" class="panel empty-state">
            <MapPin :size="30" />
            <h3>{{ tab === 'favorites' ? '尚未收藏清運站點' : '目前沒有符合的站點' }}</h3>
            <p>
              {{
                city === '臺北市' && ['map', 'list'].includes(tab) && !isCollectionDay(queryDate)
                  ? '選擇日期為週三或週日例行停收日，請選擇其他日期。'
                  : tab === 'manual' && !manualPoint
                    ? '請先點擊地圖選擇位置。'
                    : tab === 'nearby' && !location
                      ? '請先啟用 GPS 定位。'
                      : '可調整查詢條件、變更位置，或在站點按下星號收藏。'
              }}
            </p>
          </div>
          <div v-else-if="tab !== 'map'" class="panel table-scroll">
            <table class="station-table">
              <thead>
                <tr>
                  <th>清運地點</th>
                  <th>表定時間／下一班倒數</th>
                  <th>路線／車號</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in visible" :key="s.id">
                  <td>
                    <button class="station-title" @click="selected = s">{{ s.address }}</button
                    ><small>{{ s.district }} · {{ s.village }} · {{ distanceLabel(s) }}</small>
                  </td>
                  <td class="time-cell">
                    {{ s.arrival }}{{ s.city === '臺北市' ? '–' + s.departure : ''
                    }}<small>{{
                      ['nearby', 'manual', 'favorites'].includes(tab)
                        ? scheduleStatus(s, now)
                        : queryDate
                    }}</small>
                    <CollectionCountdown :stops="schedulesAt(s)" :now="now" compact />
                  </td>
                  <td>
                    {{ s.route }}<small>{{ s.plate }} · {{ s.trip }}</small>
                  </td>
                  <td>
                    <div class="toolbar">
                      <button
                        class="favorite-button"
                        :class="{ saved: favorites.includes(s.id) }"
                        :aria-pressed="favorites.includes(s.id)"
                        :aria-label="favorites.includes(s.id) ? '取消收藏' : '收藏站點'"
                        @click="toggleFavorite(s)"
                      >
                        <Star :size="18" /></button
                      ><button
                        class="icon-button"
                        aria-label="設定此站提醒"
                        @click="openReminder(s)"
                      >
                        <Bell :size="18" /></button
                      ><a
                        class="icon-button"
                        :href="navigationUrl(s)"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="開啟步行導航"
                        ><Navigation :size="18"
                      /></a>
                    </div>
                  </td>
=======
]

const activeTab = ref<TabId>('map')
const selectedStation = ref<Station | null>(null)
const favorites = ref<string[]>(readJson(FAVORITES_STORAGE_KEY, ['s1', 's3']))
const selectedCity = ref('新北市')
const selectedDistrict = ref('板橋區')
const selectedVillage = ref('')
const selectedDay = ref(new Date().getDay())
const guideActiveIndex = ref(0)
const lastUpdated = ref('')
const queryTimeRange = ref('18:00-22:00')
const queryAddress = ref('')

const userLocation = ref<{ lat: number; lng: number } | null>(null)
const locationLabel = ref('定位中...')
const locationLoading = ref(true)
const locationError = ref('')

async function fetchUserLocation() {
  locationLoading.value = true
  locationError.value = ''

  if (!navigator.geolocation) {
    locationError.value = '此瀏覽器不支援定位功能'
    locationLoading.value = false
    locationLabel.value = '無法定位'
    return
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      })
    })

    const { latitude, longitude } = position.coords
    userLocation.value = { lat: latitude, lng: longitude }

    // Nominatim is used instead of Google Maps Geocoding to avoid requiring an API key
    const geocodeUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=zh-TW`

    const response = await fetch(geocodeUrl, {
      headers: { 'User-Agent': 'RentMate/1.0' }, // Nominatim requires a User-Agent header
    })

    if (!response.ok) throw new Error('反向地理編碼請求失敗')

    const data: { address?: NominatimAddress } = await response.json()
    const addr = data.address
    const district = addr?.city_district ?? addr?.suburb ?? addr?.town ?? addr?.county ?? ''
    const city = addr?.city ?? addr?.county ?? ''

    if (district || city) {
      locationLabel.value = `${city}${district}`

      // 嘗試自動匹配 DISTRICTS 下拉選單
      const matched = DISTRICTS.find(d => d.label.includes(district) || d.label.includes(city))
      if (matched) {
        selectedCity.value = city
        selectedDistrict.value = district
      }
    } else {
      locationLabel.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    }

    updateTimestamp()
  } catch (err: any) {
    // 處理定位錯誤
    if (err instanceof GeolocationPositionError) {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          locationError.value = '使用者拒絕了定位權限'
          locationLabel.value = '定位遭拒'
          break
        case err.POSITION_UNAVAILABLE:
          locationError.value = '無法取得位置資訊'
          locationLabel.value = '定位失敗'
          break
        case err.TIMEOUT:
          locationError.value = '定位逾時，請稍後再試'
          locationLabel.value = '定位逾時'
          break
      }
    } else {
      locationError.value = err.message ?? '定位失敗'
      locationLabel.value = '定位失敗'
    }
  } finally {
    locationLoading.value = false
  }
}

// 頁面載入時自動執行定位，並初始化地圖 tab 的地圖
onMounted(() => {
  fetchUserLocation()
  startMap('main')
  updateTimestamp()
})

const selectedItems = ref({
  general: true,
  recycle: true,
  food: true,
})

const reminderForm = ref<ReminderFormState>({
  stationId: '',
  days: [1, 3, 5],
  minutesBefore: 15,
  notifyPush: true,
  notifyBrowser: true,
  notifyEmail: false,
})

const reminders = ref<Reminder[]>(readJson(REMINDERS_STORAGE_KEY, [
  { id: 'r1', stationId: 's1', stationName: '漢生東路／仁化路口', days: [1, 3, 5], minutesBefore: 15, active: true },
]))

// ─── 計算屬性 ─────────────────────────────────────────────────────────────────
const districtSuggestions = computed(() => DISTRICT_SUGGESTIONS[selectedCity.value] ?? [])
const villageSuggestions = computed(() => VILLAGE_SUGGESTIONS[selectedDistrict.value] ?? [])
const normalizedQueryAddress = computed(() => queryAddress.value.trim().toLowerCase())
const activeItemLabels = computed(() =>
  Object.entries(selectedItems.value)
    .filter(([, enabled]) => enabled)
    .map(([key]) => ITEM_LABELS[key as keyof typeof ITEM_LABELS]),
)

const filteredStations = computed(() =>
  MOCK_STATIONS.filter((station) => {
    if (selectedCity.value && !station.district.includes(selectedCity.value)) return false
    if (selectedDistrict.value && !station.district.includes(selectedDistrict.value)) return false
    if (selectedVillage.value && !station.address.includes(selectedVillage.value)) return false
    if (!station.day.includes(selectedDay.value)) return false
    if (queryTimeRange.value && !timeRangeOverlaps(station.timeRange, queryTimeRange.value)) return false
    if (normalizedQueryAddress.value) {
      const searchableText = `${station.name} ${station.address}`.toLowerCase()
      if (!searchableText.includes(normalizedQueryAddress.value)) return false
    }
    if (activeItemLabels.value.length > 0 && !activeItemLabels.value.some((item) => station.items.includes(item))) return false
    return true
  }),
)

/** 即時動態看板：依狀態優先（arriving > on-duty > off-duty）+ 距離排序，取前 3 */
const liveTrackerStations = computed(() => {
  const sorted = [...filteredStations.value].sort((a, b) => {
    const order: Record<StationStatus, number> = { arriving: 0, 'on-duty': 1, 'off-duty': 2 }
    const diff = order[a.status] - order[b.status]
    return diff !== 0 ? diff : a.distance - b.distance
  })
  return sorted.slice(0, 3)
})

const nearbyStations = computed(() => [...filteredStations.value].sort((a, b) => a.distance - b.distance))
const favoriteStations = computed(() => MOCK_STATIONS.filter(s => favorites.value.includes(s.id)))

// ─── 函式 ─────────────────────────────────────────────────────────────────────
function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.removeItem(key)
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function updateTimestamp(): void {
  lastUpdated.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

function parseTimeLabel(value: string): number | null {
  const [hour, minute] = value.split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

function timeRangeOverlaps(stationRange: string, selectedRange: string): boolean {
  if (!selectedRange) return true

  const [stationStartRaw, stationEndRaw] = stationRange.split(' - ')
  const [selectedStartRaw, selectedEndRaw] = selectedRange.split('-')
  const stationStart = parseTimeLabel(stationStartRaw)
  const stationEnd = parseTimeLabel(stationEndRaw)
  const selectedStart = parseTimeLabel(selectedStartRaw)
  const selectedEnd = parseTimeLabel(selectedEndRaw)

  if (stationStart == null || stationEnd == null || selectedStart == null || selectedEnd == null) return true
  return stationStart < selectedEnd && stationEnd > selectedStart
}

function switchTab(tab: TabId) {
  activeTab.value = tab
  selectedStation.value = null
}
function selectStation(station: Station) {
  selectedStation.value = station
}
function clearStation() {
  selectedStation.value = null
}
function openReminderTab(stationId?: string) {
  if (stationId) reminderForm.value.stationId = stationId
  activeTab.value = 'reminder'
  selectedStation.value = null
}
function toggleArrayItem<T>(arr: T[], item: T): void {
  const idx = arr.indexOf(item)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(item)
}
function toggleFavorite(stationId: string) {
  toggleArrayItem(favorites.value, stationId)
}
function isFavorited(id: string): boolean {
  return favorites.value.includes(id)
}
function toggleReminderDay(day: number) {
  toggleArrayItem(reminderForm.value.days, day)
}
function toggleReminderActive(id: string) {
  const r = reminders.value.find(x => x.id === id)
  if (r) r.active = !r.active
}
function removeReminder(id: string) {
  reminders.value = reminders.value.filter(x => x.id !== id)
}

function resetReminderForm() {
  reminderForm.value = {
    stationId: '',
    days: [1, 3, 5],
    minutesBefore: 15,
    notifyPush: true,
    notifyBrowser: true,
    notifyEmail: false,
  }
}

function addReminder() {
  const station = MOCK_STATIONS.find(item => item.id === reminderForm.value.stationId)
  if (!station) return

  const uniqueDays = [...new Set(reminderForm.value.days)].sort((a, b) => a - b)
  if (uniqueDays.length === 0) return

  const existingReminder = reminders.value.find(item => item.stationId === station.id)
  const nextReminder: Reminder = {
    id: existingReminder?.id ?? `r-${Date.now()}`,
    stationId: station.id,
    stationName: station.name,
    days: uniqueDays,
    minutesBefore: reminderForm.value.minutesBefore,
    active: true,
  }

  if (existingReminder) {
    reminders.value = reminders.value.map(item => item.id === existingReminder.id ? nextReminder : item)
  } else {
    reminders.value = [nextReminder, ...reminders.value]
  }

  resetReminderForm()
}

function focusFirstFilteredStation() {
  selectedStation.value = filteredStations.value[0] ?? null
  updateTimestamp()

  if (selectedStation.value && mainMap?.loaded()) {
    mainMap.flyTo({
      center: [selectedStation.value.lng, selectedStation.value.lat],
      zoom: 15.5,
    })
  }
}

function openNavigation(station: Station) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`, '_blank')
}

function restartMainMap() {
  mapError.value = null
  mainMap?.remove()
  mainMap = null
  nextTick(() => startMap('main'))
}

function scrollToSection(i: number) {
  guideActiveIndex.value = i
  nextTick(() => {
    const el = document.getElementById(`guide-section-${i}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function centerMainMapOnUser() {
  if (!mainMap || !userLocation.value) return
  mainMap.flyTo({ center: [userLocation.value.lng, userLocation.value.lat], zoom: 15, duration: 800 })
}

// ─── MapLibre GL 地圖 ────────────────────────────────────────────────────────
const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'
const DEFAULT_CENTER_LNGLAT: [number, number] = [121.46, 25.014] // MapLibre 座標順序：[lng, lat]

// Template refs — 地圖容器 DOM 元素
const mapContainerRef = ref<HTMLDivElement | null>(null)
const nearbyMapContainerRef = ref<HTMLDivElement | null>(null)
const manualMapContainerRef = ref<HTMLDivElement | null>(null)
const manualPin = ref<[number, number] | null>(null) // [lat, lng]

// GL 實體不放進 Vue reactive（避免 Proxy 干擾 WebGL context）
let mainMap: maplibregl.Map | null = null
let nearbyMap: maplibregl.Map | null = null
let manualMap: maplibregl.Map | null = null
let mainUserMarker: maplibregl.Marker | null = null
let nearbyUserMarker: maplibregl.Marker | null = null
let manualUserMarker: maplibregl.Marker | null = null
let manualPinMarker: maplibregl.Marker | null = null
const mainStationMarkers: maplibregl.Marker[] = []
const nearbyStationMarkers: maplibregl.Marker[] = []
const manualStationMarkers: maplibregl.Marker[] = []

// 地圖載入錯誤狀態
const mapError = ref<string | null>(null)

// ── 工具函式 ────────────────────────────────────────────────────────────────

function circleGeoJSON(lng: number, lat: number, radiusM: number) {
  const n = 64
  const coords: [number, number][] = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI
    return [
      lng + (radiusM * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180)),
      lat + (radiusM * Math.cos(a)) / 111320,
    ]
  })
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }],
  }
}

function userDotEl(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:14px;height:14px;background:#6366f1;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(99,102,241,.5);'
  return el
}

function pinDotEl(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:20px;height:20px;background:#ef4444;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(239,68,68,.5);'
  return el
}

function truckEl(status: StationStatus, onClick: () => void): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `width:32px;height:32px;background:${STATUS_CONFIG[status].markerColor};border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;`
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>`
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
  return el
}

function syncCircle(map: maplibregl.Map, id: string, lng: number, lat: number, color: string) {
  const data = circleGeoJSON(lng, lat, 500) as any
  if (map.getSource(id)) {
    (map.getSource(id) as maplibregl.GeoJSONSource).setData(data)
  }
  else {
    map.addSource(id, { type: 'geojson', data })
    map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': color, 'fill-opacity': 0.08 } })
    map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 1.5 } })
  }
}

function syncStations(map: maplibregl.Map, stations: Station[], store: maplibregl.Marker[]) {
  store.forEach(m => m.remove())
  store.length = 0
  stations.forEach((s) => {
    store.push(
      new maplibregl.Marker({ element: truckEl(s.status, () => selectStation(s)) })
        .setLngLat([s.lng, s.lat])
        .addTo(map),
    )
  })
}

// ── 地圖初始化 ───────────────────────────────────────────────────────────────

function startMap(which: 'main' | 'nearby' | 'manual') {
  const containerEl = which === 'main' ? mapContainerRef.value
    : which === 'nearby' ? nearbyMapContainerRef.value
    : manualMapContainerRef.value
  if (!containerEl) return

  const loc = userLocation.value
  const center: [number, number] = loc ? [loc.lng, loc.lat] : DEFAULT_CENTER_LNGLAT

  let map: maplibregl.Map
  try {
    map = new maplibregl.Map({ container: containerEl, style: STYLE_URL, center, zoom: 15, attributionControl: false })
  }
  catch (err: any) {
    mapError.value = err?.message ?? '地圖初始化失敗'
    return
  }

  map.on('error', (e) => {
    mapError.value = e.error?.message ?? '地圖載入失敗（可能是網路問題或 WebGL 不支援）'
  })

  if (which === 'main') mainMap = map
  else if (which === 'nearby') nearbyMap = map
  else manualMap = map

  map.on('load', () => {
    if (which === 'main') {
      syncStations(map, filteredStations.value, mainStationMarkers)
      if (loc) {
        mainUserMarker = new maplibregl.Marker({ element: userDotEl() }).setLngLat([loc.lng, loc.lat]).addTo(map)
        syncCircle(map, 'user', loc.lng, loc.lat, '#6366f1')
      }
    }
    else if (which === 'nearby') {
      syncStations(map, nearbyStations.value, nearbyStationMarkers)
      if (loc) {
        nearbyUserMarker = new maplibregl.Marker({ element: userDotEl() }).setLngLat([loc.lng, loc.lat]).addTo(map)
        syncCircle(map, 'user', loc.lng, loc.lat, '#6366f1')
      }
    }
    else {
      if (loc) {
        manualUserMarker = new maplibregl.Marker({ element: userDotEl() }).setLngLat([loc.lng, loc.lat]).addTo(map)
      }
      map.on('click', (e) => {
        if ((e.originalEvent.target as HTMLElement).closest('.maplibregl-marker')) return
        const { lat, lng } = e.lngLat
        manualPin.value = [lat, lng]
        manualPinMarker?.remove()
        manualPinMarker = new maplibregl.Marker({ element: pinDotEl() }).setLngLat([lng, lat]).addTo(map)
        syncCircle(map, 'pin', lng, lat, '#ef4444')
        syncStations(map, manualNearbyStations.value as Station[], manualStationMarkers)
      })
    }
  })
}

// Tab 切換時懶初始化 / resize
watch(activeTab, (tab) => {
  nextTick(() => {
    if (tab === 'map') {
      if (mainMap) mainMap.resize()
      else startMap('main')
    } else if (tab === 'nearby') {
      if (nearbyMap) nearbyMap.resize()
      else startMap('nearby')
    } else if (tab === 'manual') {
      if (manualMap) manualMap.resize()
      else startMap('manual')
    }
  })
})

watch(filteredStations, (stations) => {
  if (selectedStation.value && !stations.some(station => station.id === selectedStation.value?.id)) {
    selectedStation.value = null
  }
  if (mainMap?.loaded()) syncStations(mainMap, stations, mainStationMarkers)
  if (activeTab.value === 'nearby' && nearbyMap?.loaded()) syncStations(nearbyMap, nearbyStations.value, nearbyStationMarkers)
})

// GPS 定位完成後更新各地圖
watch(userLocation, (loc) => {
  if (!loc) return
  const lnglat: [number, number] = [loc.lng, loc.lat]
  const entries: { map: maplibregl.Map | null; getM: () => maplibregl.Marker | null; setM: (m: maplibregl.Marker) => void; circleId: string | null; tab: TabId }[] = [
    { map: mainMap, getM: () => mainUserMarker, setM: (m) => { mainUserMarker = m }, circleId: 'user', tab: 'map' },
    { map: nearbyMap, getM: () => nearbyUserMarker, setM: (m) => { nearbyUserMarker = m }, circleId: 'user', tab: 'nearby' },
    { map: manualMap, getM: () => manualUserMarker, setM: (m) => { manualUserMarker = m }, circleId: null, tab: 'manual' },
  ]
  for (const { map, getM, setM, circleId, tab } of entries) {
    if (!map?.loaded()) continue
    const m = getM()
    if (m) m.setLngLat(lnglat)
    else setM(new maplibregl.Marker({ element: userDotEl() }).setLngLat(lnglat).addTo(map))
    if (circleId) syncCircle(map, circleId, loc.lng, loc.lat, '#6366f1')
    if (activeTab.value === tab) map.flyTo({ center: lnglat })
  }
})

watch(favorites, (value) => {
  writeJson(FAVORITES_STORAGE_KEY, value)
}, { deep: true })

watch(reminders, (value) => {
  writeJson(REMINDERS_STORAGE_KEY, value)
}, { deep: true })

onUnmounted(() => {
  mainMap?.remove()
  nearbyMap?.remove()
  manualMap?.remove()
})

const manualNearbyStations = computed(() => {
  if (!manualPin.value) return []
  const [lat, lng] = manualPin.value
  return MOCK_STATIONS
    .map((s) => {
      const dlat = (s.lat - lat) * 111000
      const dlng = (s.lng - lng) * 111000 * Math.cos((lat * Math.PI) / 180)
      return { ...s, manualDist: Math.round(Math.sqrt(dlat * dlat + dlng * dlng)) }
    })
    .filter(s => s.manualDist <= 500)
    .sort((a, b) => a.manualDist - b.manualDist)
})

</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-5 pb-6">
    <!-- ── 頁面標題 ──────────────────────────────────────────────────────────── -->
    <header>
      <h1 class="text-3xl font-bold tracking-tight text-slate-900">垃圾清運查詢</h1>
    </header>

    <!-- ── Tab 頁籤 + 目前位置 ────────────────────────────────────────────────── -->
    <div class="flex items-center gap-3">
      <div class="flex flex-1 items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          :class="[
            'flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200',
            activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          ]"
          @click="switchTab(tab.id)"
        >
          <component :is="tab.icon" class="h-4 w-4" />
          {{ tab.label }}
        </button>
      </div>
      <!-- 目前位置（GPS 即時定位） -->
      <button
        class="hidden shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5 lg:flex"
        :title="locationError || `${userLocation?.lat.toFixed(5)}, ${userLocation?.lng.toFixed(5)}`"
        @click="fetchUserLocation"
      >
        <Loader2 v-if="locationLoading" class="h-4 w-4 animate-spin text-primary" />
        <MapPin v-else class="h-4 w-4 text-primary" />
        <span class="font-medium text-slate-700">
          目前位置：{{ locationLabel }}
        </span>
        <RefreshCw v-if="!locationLoading" class="h-3 w-3 text-slate-400" />
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 地圖查詢                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'map'">

      <!-- ── 即時動態看板 ──────────────────────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 class="text-lg font-bold tracking-tight text-slate-900">附近清運地點　即時動態看板</h2>
          <Badge variant="outline" class="rounded-full border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
            <span class="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE
          </Badge>
          <span class="flex items-center gap-1.5 text-xs text-slate-400">
            自動更新中 <span class="h-1 w-1 rounded-full bg-emerald-400" />
          </span>
          <span class="text-xs text-slate-400">最後更新 {{ lastUpdated }}</span>
          <button type="button" class="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" @click="focusFirstFilteredStation">
            <RefreshCw class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- 即時卡片 ×3 -->
        <div class="grid gap-3 md:grid-cols-3">
          <Card
            v-for="(station, index) in liveTrackerStations"
            :key="station.id"
            :class="[
              'group relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 hover:shadow-md',
              station.status === 'arriving' ? 'border-2 border-emerald-300 shadow-sm' : '',
            ]"
            @click="selectStation(station)"
          >
            <CardContent class="p-4">
              <!-- 標題列 -->
              <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{{ index + 1 }}</span>
                  <p class="truncate text-sm font-bold text-slate-900">{{ station.name }}</p>
                  <Badge variant="outline" :class="['shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">
                    {{ STATUS_CONFIG[station.status].label }}
                  </Badge>
                </div>
                <button
                  class="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-amber-50"
                  @click.stop="toggleFavorite(station.id)"
                >
                  <Star class="h-4 w-4" :class="isFavorited(station.id) ? 'text-amber-500' : 'text-slate-300'" :fill="isFavorited(station.id) ? 'currentColor' : 'none'" />
                </button>
              </div>

              <!-- 主體：圖示 + 大數字 + 回收項目 -->
              <div class="flex items-center gap-4">
                <!-- 垃圾車圖示 -->
                <div :class="[
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl',
                  station.status === 'arriving' ? 'bg-emerald-50' : station.status === 'on-duty' ? 'bg-blue-50' : 'bg-slate-50',
                ]">
                  <Truck :class="[
                    'h-7 w-7',
                    station.status === 'arriving' ? 'text-emerald-600' : station.status === 'on-duty' ? 'text-blue-600' : 'text-slate-300',
                  ]" />
                </div>

                <!-- 大數字 ETA -->
                <div class="min-w-0">
                  <p class="text-[11px] text-slate-500">預估抵達</p>
                  <template v-if="station.etaMinutes != null">
                    <div class="flex items-baseline gap-0.5">
                      <span :class="['text-4xl font-extrabold tracking-tighter', station.status === 'arriving' ? 'text-emerald-600' : 'text-blue-600']">
                        {{ String(station.etaMinutes).padStart(2, '0') }}
                      </span>
                      <span :class="['text-sm font-semibold', station.status === 'arriving' ? 'text-emerald-500' : 'text-blue-500']">分</span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex items-baseline gap-1">
                      <span class="text-3xl font-extrabold tracking-tighter text-slate-300">— —</span>
                      <span class="text-sm font-semibold text-slate-300">分</span>
                    </div>
                  </template>
                </div>

                <!-- 回收項目圓點 -->
                <div class="ml-auto space-y-1">
                  <div v-for="item in station.items" :key="item" class="flex items-center gap-1.5">
                    <span :class="['h-2 w-2 shrink-0 rounded-full', ITEM_CONFIG[item]?.dot ?? 'bg-slate-400']" />
                    <span class="text-[11px] text-slate-600">{{ item }}</span>
                  </div>
                </div>
              </div>

              <!-- 底部：步行 + 距離 -->
              <div class="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                <span class="flex items-center gap-1"><Footprints class="h-3 w-3" /> 步行 {{ station.walkMinutes }} 分鐘</span>
                <span class="flex items-center gap-1"><MapPin class="h-3 w-3" /> 距離 {{ station.distance }} m</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- ── 主內容區：查詢條件 + 地圖 ─────────────────────────────────────────── -->
      <section class="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <!-- 左側：查詢條件 -->
        <div class="lg:sticky lg:top-4 lg:self-start">
          <Card class="rounded-2xl">
            <CardContent class="space-y-5 p-5">
              <h3 class="text-base font-bold text-slate-900">查詢條件</h3>

              <!-- 查詢位置 -->
              <div>
                <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Search class="h-3.5 w-3.5 text-primary" /> 查詢位置
                </label>
                <input
                  v-model="queryAddress"
                  type="text"
                  placeholder="請輸入地址或關鍵字（未輸入以即時定位查詢）"
                  class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
              </div>

              <!-- 抵達收運時間 -->
              <div>
                <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Calendar class="h-3.5 w-3.5 text-primary" /> 抵達收運時間
                </label>
                <div class="space-y-2">
                  <!-- 星期 -->
                  <div class="relative">
                    <select
                      v-model="selectedDay"
                      class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option v-for="(day, i) in DAYS" :key="i" :value="i">星期{{ day }}</option>
                    </select>
                    <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <!-- 時段 -->
                  <div class="relative">
                    <select
                      v-model="queryTimeRange"
                      class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option v-for="t in TIME_RANGES" :key="t.value" :value="t.value">{{ t.label }}</option>
                    </select>
                    <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>

              <div>
                <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Truck class="h-3.5 w-3.5 text-primary" /> 清運種類
                </label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="option in ITEM_FILTER_OPTIONS"
                    :key="option.key"
                    type="button"
                    :class="[
                      'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                      selectedItems[option.key]
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
                    ]"
                    @click="selectedItems[option.key] = !selectedItems[option.key]"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <!-- 查詢按鈕 -->
              <Button class="w-full gap-2 rounded-xl bg-primary text-white hover:bg-primary/90" @click="focusFirstFilteredStation">
                <Search class="h-4 w-4" /> 查詢
              </Button>
            </CardContent>
          </Card>
        </div>

        <!-- 右側：地圖 + 彈出卡片 -->
        <div class="min-w-0 space-y-4">
          <div class="relative" style="height: 420px">
            <!-- MapLibre GL 地圖容器 -->
            <div ref="mapContainerRef" class="h-full overflow-hidden rounded-2xl border border-slate-200" />

            <!-- 地圖載入錯誤提示 -->
            <div v-if="mapError" class="absolute inset-0 z-[1001] flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50">
              <MapPin class="h-8 w-8 text-red-400" />
              <p class="text-sm font-semibold text-red-700">地圖載入失敗</p>
              <p class="max-w-xs text-center text-xs text-red-500">{{ mapError }}</p>
              <button
                class="rounded-xl bg-red-100 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-200"
                @click="restartMainMap"
              >重新載入</button>
            </div>

            <!-- 回到目前位置按鈕 -->
            <button
              v-if="userLocation && !mapError"
              class="absolute bottom-3 right-3 z-[1001] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition-all hover:shadow-lg hover:scale-105 active:scale-95"
              title="回到目前位置"
              @click="centerMainMapOnUser"
            >
              <Navigation class="h-5 w-5 text-primary" />
            </button>

            <!-- 地圖上的彈出資訊卡：z-[1001] 確保高於 MapLibre 的 tile/control 層 -->
            <div v-if="selectedStation && !mapError" class="absolute right-3 top-3 z-[1001] w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <div class="mb-3 flex items-start justify-between">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="truncate text-sm font-bold text-slate-900">{{ selectedStation.name }}</h4>
                    <Badge variant="outline" :class="['shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CONFIG[selectedStation.status].badgeClass]">
                      {{ STATUS_CONFIG[selectedStation.status].label }}
                    </Badge>
                  </div>
                </div>
                <button class="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" @click="clearStation">
                  <X class="h-4 w-4" />
                </button>
              </div>

              <div class="space-y-2 text-xs">
                <div class="flex gap-2">
                  <MapPin class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span class="text-slate-600">{{ selectedStation.address }}</span>
                </div>
                <div class="flex gap-2">
                  <Clock class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div>
                    <span class="text-slate-500">表定時間</span>
                    <span class="ml-2 font-bold text-slate-900">{{ selectedStation.timeRange }}</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <span class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <span :class="['h-2 w-2 rounded-full', STATUS_CONFIG[selectedStation.status].dotClass]" />
                  </span>
                  <div>
                    <span class="text-slate-500">預估抵達</span>
                    <span v-if="selectedStation.etaTime" class="ml-2 font-bold text-primary">
                      {{ selectedStation.etaTime }}（約 {{ selectedStation.etaMinutes }} 分鐘後）
                    </span>
                    <span v-else class="ml-2 text-slate-400">—</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <Footprints class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div>
                    <span class="text-slate-500">距離</span>
                    <span class="ml-2 font-bold text-slate-900">{{ selectedStation.distance }} 公尺（步行約 {{ selectedStation.walkMinutes }} 分鐘）</span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-slate-400">
                    <Truck class="h-3.5 w-3.5" />
                  </span>
                  <span class="text-slate-500">清運種類</span>
                  <div class="flex gap-1">
                    <Badge v-for="item in selectedStation.items" :key="item" variant="outline" :class="['rounded-full px-2 py-0 text-[10px] font-semibold', ITEM_CONFIG[item]?.badge ?? 'border-slate-200 bg-slate-50 text-slate-500']">
                      {{ item }}
                    </Badge>
                  </div>
                </div>
              </div>

              <div class="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 gap-1.5 rounded-xl text-xs"
                  @click.stop="toggleFavorite(selectedStation.id)"
                >
                  <Star class="h-3.5 w-3.5" :class="isFavorited(selectedStation.id) ? 'text-amber-500' : ''" :fill="isFavorited(selectedStation.id) ? 'currentColor' : 'none'" />
                  {{ isFavorited(selectedStation.id) ? '已收藏' : '加入收藏' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 gap-1.5 rounded-xl text-xs"
                  @click.stop="openReminderTab(selectedStation.id)"
                >
                  <Bell class="h-3.5 w-3.5" /> 設定提醒
                </Button>
              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- ── 清運地點清單 ──────────────────────────────────────────────────────── -->
      <section>
        <!-- ── 手機版：垂直清單，資訊橫向排列（sm 以下顯示） ── -->
        <Card class="rounded-2xl sm:hidden">
          <CardHeader class="border-b border-slate-100 px-4 py-3">
            <CardTitle class="text-sm font-semibold text-slate-900">
              清運地點清單
              <span class="ml-1 font-normal text-slate-500">（共 {{ filteredStations.length }} 筆）</span>
            </CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <div v-if="filteredStations.length === 0" class="px-4 py-10 text-center text-sm text-slate-500">
              目前條件下沒有找到清運站點
            </div>
            <div class="divide-y divide-slate-100">
              <div v-for="(station, index) in filteredStations" :key="station.id" class="px-4 py-3">
                <!-- 第一行：編號 + 名稱 + 狀態 + 操作（橫向） -->
                <div class="flex items-center gap-2">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{{ index + 1 }}</span>
                  <p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{{ station.name }}</p>
                  <Badge variant="outline" :class="['shrink-0 rounded-full px-2 py-0 text-[10px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">
                    {{ STATUS_CONFIG[station.status].label }}
                  </Badge>
                  <div class="flex shrink-0 items-center gap-1">
                    <button class="rounded-lg p-1 hover:bg-amber-50" @click="toggleFavorite(station.id)">
                      <Star class="h-3.5 w-3.5" :class="isFavorited(station.id) ? 'text-amber-500' : 'text-slate-300'" :fill="isFavorited(station.id) ? 'currentColor' : 'none'" />
                    </button>
                    <button class="rounded-lg p-1 hover:bg-slate-100" @click="openReminderTab(station.id)">
                      <Bell class="h-3.5 w-3.5 text-slate-300" />
                    </button>
                  </div>
                </div>
                <!-- 第二行：時間、距離、ETA（橫向） -->
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px] text-slate-500">
                  <span class="flex items-center gap-1"><Clock class="h-3 w-3" /> {{ station.timeRange }}</span>
                  <span class="flex items-center gap-1"><MapPin class="h-3 w-3" /> {{ station.distance }} m</span>
                  <span v-if="station.etaTime" class="flex items-center gap-1 font-semibold text-primary">
                    <Truck class="h-3 w-3" /> 預計 {{ station.etaTime }}
                  </span>
                </div>
                <!-- 第三行：清運種類（橫向） -->
                <div class="mt-1.5 flex flex-wrap gap-1 pl-7">
                  <Badge
                    v-for="item in station.items"
                    :key="item"
                    variant="outline"
                    :class="['rounded-full px-2 py-0 text-[10px] font-semibold', ITEM_CONFIG[item]?.badge ?? 'border-slate-200 bg-slate-50 text-slate-500']"
                  >
                    {{ item }}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- ── 桌面版：原始表格（sm 以上顯示） ── -->
        <Card class="hidden rounded-2xl sm:block">
          <CardHeader class="border-b border-slate-100 px-5 py-3.5">
            <CardTitle class="text-base font-bold text-slate-900">清運地點清單<span class="ml-1.5 text-sm font-normal text-slate-500">（共 {{ filteredStations.length }} 筆）</span></CardTitle>
          </CardHeader>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-slate-100 bg-slate-50/50">
                  <th class="w-10 px-4 py-3 text-center text-xs font-semibold text-slate-500">#</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">清運地點</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">狀態</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">預估抵達</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">表定時間</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">距離</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">清運種類</th>
                  <th class="w-20 px-4 py-3 text-center text-xs font-semibold text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(station, index) in filteredStations"
                  :key="station.id"
                  class="border-b border-slate-50 transition-colors hover:bg-slate-50/60"
                >
                  <td class="px-4 py-3 text-center">
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{{ index + 1 }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <p class="text-sm font-semibold text-slate-900">{{ station.name }}</p>
                    <p class="mt-0.5 text-[11px] text-slate-500">{{ station.address }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <Badge variant="outline" :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">
                      {{ STATUS_CONFIG[station.status].label }}
                    </Badge>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <template v-if="station.etaTime">
                      <span class="font-semibold text-primary">{{ station.etaTime }}</span>
                      <span class="ml-1 text-[11px] text-slate-400">（約 {{ station.etaMinutes }} 分鐘後）</span>
                    </template>
                    <span v-else class="text-slate-400">--</span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-slate-700">{{ station.timeRange }}</td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <span class="text-slate-700">{{ station.distance }} m</span>
                    <span class="ml-1 text-[11px] text-slate-400">（步行 {{ station.walkMinutes }} 分鐘）</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      <Badge v-for="item in station.items" :key="item" variant="outline" :class="['rounded-full px-2 py-0 text-[10px] font-semibold', ITEM_CONFIG[item]?.badge ?? 'border-slate-200 text-slate-500']">
                        {{ item }}
                      </Badge>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-center gap-1">
                      <button
                        class="rounded-lg p-1.5 transition-colors hover:bg-amber-50"
                        @click="toggleFavorite(station.id)"
                      >
                        <Star class="h-4 w-4" :class="isFavorited(station.id) ? 'text-amber-500' : 'text-slate-300'" :fill="isFavorited(station.id) ? 'currentColor' : 'none'" />
                      </button>
                      <button class="rounded-lg p-1.5 transition-colors hover:bg-slate-100" @click="openReminderTab(station.id)">
                        <Bell class="h-4 w-4 text-slate-300" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredStations.length === 0">
                  <td colspan="8" class="px-4 py-12 text-center text-sm text-slate-500">目前條件下沒有找到清運站點</td>
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
                </tr>
              </tbody>
            </table>
          </div>
<<<<<<< HEAD
          <div v-if="tab !== 'map' && results.length > 20" class="pagination">
            <button :disabled="page <= 1" @click="page--">上一頁</button
            ><span>{{ page }} / {{ pages }} 頁</span
            ><button :disabled="page >= pages" @click="page++">下一頁</button>
          </div>
        </div>
      </section>
    </template>
    <section v-if="tab === 'reminder'" class="reminder-layout">
      <form class="panel reminder-form" @submit.prevent="saveReminder">
        <p class="eyebrow">NEVER MISS YOUR TRUCK</p>
        <h2>讓我們提醒你出門</h2>
        <p class="helper">選擇站點與日期，在表定抵達前收到通知。</p>
        <p v-if="backendMessage" class="notice error" role="alert">{{ backendMessage }}</p>
        <label
          >搜尋清運站點<input v-model="stationSearch" placeholder="輸入地址或路線（顯示前 100 筆）"
        /></label>
        <label
          >選擇清運站點<select v-model="reminderStop" required>
            <option value="">請選擇站點（可先搜尋縮小範圍）</option>
            <option v-for="s in reminderOptions" :key="s.id" :value="s.id">
              {{ s.arrival }} {{ s.address }} · {{ s.route }}
            </option>
          </select></label
        >
        <label
          >選擇日期<input v-model="reminderDate" type="date" :min="taipeiDate(now)" required
        /></label>
        <label
          >提前幾分鐘通知<select v-model.number="minutesBefore">
            <option v-for="m in [5, 10, 15, 20, 30, 60]" :key="m" :value="m">
              提前 {{ m }} 分鐘
            </option>
          </select></label
        >
        <fieldset>
          <legend>通知方式</legend>
          <label class="channel"
            ><input v-model="notifyPush" type="checkbox" :disabled="!caps.push" /><Bell
              :size="20"
            /><span
              >系統推播<small>{{
                caps.push ? '允許通知後，可在關閉頁面時接收（依裝置支援）' : '推播服務尚未啟用'
              }}</small></span
            ></label
          ><label class="channel"
            ><input v-model="notifyEmail" type="checkbox" :disabled="!caps.email" /><span
              class="gmail-icon"
              >M</span
            ><span
              >Gmail 郵件通知<small>{{
                caps.email ? '寄至帳號信箱：' + email : 'Gmail 寄信服務尚未啟用'
              }}</small></span
            ></label
          >
        </fieldset>
        <p class="helper">
          24:xx 表示所選班表日期的隔日凌晨。通知依表定時間排程；臨時調整請再確認官方公告。
        </p>
        <button
          class="primary-button"
          :disabled="saving || !!backendMessage || (!caps.email && !caps.push)"
        >
          <Bell :size="17" />{{ saving ? '正在保存…' : '新增清運提醒' }}
        </button>
      </form>
      <div class="panel reminder-list">
        <div class="section-heading">
          <h2>
            我的提醒 <span class="result-count">{{ reminders.length }}</span>
          </h2>
          <button class="icon-button" aria-label="更新提醒紀錄" @click="loadReminders">
            <RefreshCw :size="17" />
          </button>
        </div>
        <p v-if="!reminders.length" class="empty-state">
          尚未設定提醒。可從地圖、列表或收藏站點的鈴鐺開始。
        </p>
        <article v-for="r in reminders" :key="r.id" class="reminder-item">
          <h3>{{ r.stationName }}</h3>
          <p>{{ r.date }} · {{ r.arrival }} · 提前 {{ r.minutesBefore }} 分鐘</p>
          <p v-if="r.notifyPush">系統推播：{{ statusLabels[r.pushStatus] || r.pushStatus }}</p>
          <p v-if="r.notifyEmail">Gmail：{{ statusLabels[r.emailStatus] || r.emailStatus }}</p>
          <div class="toolbar">
            <button
              class="soft-button"
              :disabled="Date.parse(r.dueAt) <= now.getTime()"
              @click="editReminder(r)"
            >
              {{ r.active ? '暫停提醒' : '恢復提醒' }}</button
            ><button class="text-button" @click="editReminder(r, true)">刪除</button>
          </div>
        </article>
      </div>
    </section>
    <GarbageGuide v-if="tab === 'guide'" @navigate="tab = $event" />
    <section
      v-if="selected && !['reminder', 'guide'].includes(tab)"
      class="station-detail panel"
      aria-label="選取站點詳細資訊"
    >
      <button class="detail-close icon-button" aria-label="關閉站點詳情" @click="selected = null">
        <X :size="20" />
      </button>
      <div class="detail-heading">
        <p class="eyebrow">STOP DETAILS</p>
        <span
          v-if="selectedStatus"
          class="stop-state-badge"
          :class="'stop-state-badge--' + selectedStatus.state"
          role="status"
          >{{ stopStateLabels[selectedStatus.state] }}</span
        >
      </div>
      <h2>{{ selected.address }}</h2>
      <p>{{ selected.district }} · {{ selected.village }} · {{ selected.team }}</p>
      <strong class="detail-time"
        >{{ selected.arrival
        }}{{ selected.city === '臺北市' ? '–' + selected.departure : '' }}</strong
      >
      <dl class="detail-schedule">
        <div>
          <dt>表定抵達</dt>
          <dd>
            <span>{{ selected.arrival }}</span
            ><span class="detail-countdown">（{{ selectedArrivalCountdown }}）</span>
          </dd>
        </div>
        <div>
          <dt>{{ selected.departureEstimated ? '估計離站' : '表定離站' }}</dt>
          <dd>{{ selected.departure }}</dd>
        </div>
        <div>
          <dt>路線名稱</dt>
          <dd>
            <button class="text-button detail-route-link" @click="showRoute(selected)">
              {{ selected.route }}
            </button>
          </dd>
        </div>
      </dl>
      <CollectionCountdown :stops="schedulesAt(selected)" :now="now" />
      <button class="text-button" @click="reportOpen = true">回報此站點資料問題</button>
      <div class="toolbar">
        <button class="soft-button" @click="toggleFavorite(selected)">
          <Star :size="17" />{{ favorites.includes(selected.id) ? '取消收藏' : '加入收藏' }}</button
        ><button class="primary-button" @click="openReminder(selected)">
          <Bell :size="17" />設定提醒
        </button>
      </div>
    </section>
    <Dialog v-model:open="filtersOpen">
      <DialogContent class="garbage-page garbage-filter-dialog">
        <DialogTitle class="sr-only">地圖查詢條件</DialogTitle>
        <DialogDescription class="sr-only"
          >依行政區、里別、道路及時間篩選清運站點。按查詢後返回滿版地圖。</DialogDescription
        >
        <GarbageFilters
          v-model:city="city"
          show-city
          v-model:district="district"
          v-model:village="village"
          v-model:road="road"
          v-model:date="queryDate"
          v-model:start="timeStart"
          v-model:end="timeEnd"
          :villages="villages"
          :roads="roads"
          :count="results.length"
          @reset="resetFilters"
          @submit="submitFilters"
        />
      </DialogContent>
    </Dialog>
    <GarbageReport v-model:open="reportOpen" :stop="selected" />
    <footer class="garbage-footer">
      <button class="text-button" @click="reportOpen = true">回報問題</button>
      <p>本站資料檢查／匯入時間：{{ dataCheckedAt }}（不代表車輛 GPS 更新時間）</p>
      <p>
        資料來源：<a :href="sourceUrl" target="_blank" rel="noopener noreferrer"
          >{{ city }}政府環境保護局 · 清運路線資訊</a
        >｜本站資料：官方班表快照，共 {{ stops.length.toLocaleString() }} 筆有效停靠班次。
      </p>
      <p>
        橘色為清運站點、藍點為目前位置；綠色為兩分鐘內更新的車輛
        GPS。藍色實線為站序示意，時間為表定時間。24:xx 為隔日凌晨；{{
          stops.filter((s) => !validPoint(s)).length
        }}
        筆原始座標待確認，僅列入列表，不納入地圖與附近查詢。
      </p>
    </footer>
=======
        </Card>
      </section>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 列表查詢（複用上面表格，但有額外篩選列）                               -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'list'" class="space-y-4">
      <!-- 篩選條件（所有裝置皆顯示） -->
      <Card class="rounded-2xl">
        <CardContent class="space-y-4 p-5">
          <h3 class="text-sm font-semibold text-slate-900">篩選條件</h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <!-- 縣市 -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">縣市</label>
              <div class="relative">
                <select
                  v-model="selectedCity"
                  class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  @change="selectedDistrict = ''; selectedVillage = ''"
                >
                  <option value="">全部縣市</option>
                  <option v-for="c in CITIES" :key="c" :value="c">{{ c }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <!-- 行政區 -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">行政區</label>
              <div class="relative">
                <select
                  v-model="selectedDistrict"
                  class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  @change="selectedVillage = ''"
                >
                  <option value="">全部行政區</option>
                  <option v-for="d in districtSuggestions" :key="d" :value="d">{{ d }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <!-- 里 -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">里</label>
              <div class="relative">
                <select
                  v-model="selectedVillage"
                  class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">全部里別</option>
                  <option v-for="v in villageSuggestions" :key="v" :value="v">{{ v }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <!-- 清運時間 -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">清運時間</label>
              <div class="relative">
                <select
                  v-model="queryTimeRange"
                  class="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option v-for="t in TIME_RANGES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- ── 手機版：垂直清單，資訊橫向排列（sm 以下顯示） ── -->
      <Card class="rounded-2xl sm:hidden">
        <CardHeader class="border-b border-slate-100 px-4 py-3">
          <CardTitle class="text-sm font-semibold text-slate-900">
            搜尋結果
            <span class="ml-1 font-normal text-slate-500">（共 {{ filteredStations.length }} 筆）</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="filteredStations.length === 0" class="px-4 py-10 text-center text-sm text-slate-500">
            目前條件下沒有找到清運站點
          </div>
          <div class="divide-y divide-slate-100">
            <div v-for="(station, index) in filteredStations" :key="station.id" class="px-4 py-3">
              <!-- 第一行：編號 + 名稱 + 狀態 + 操作按鈕（橫向） -->
              <div class="flex items-center gap-2">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{{ index + 1 }}</span>
                <p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{{ station.name }}</p>
                <Badge variant="outline" :class="['shrink-0 rounded-full px-2 py-0 text-[10px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">
                  {{ STATUS_CONFIG[station.status].label }}
                </Badge>
                <div class="flex shrink-0 items-center gap-1">
                  <button class="rounded-lg p-1 hover:bg-amber-50" @click="toggleFavorite(station.id)">
                    <Star class="h-3.5 w-3.5" :class="isFavorited(station.id) ? 'text-amber-500' : 'text-slate-300'" :fill="isFavorited(station.id) ? 'currentColor' : 'none'" />
                  </button>
                  <button class="rounded-lg p-1 hover:bg-slate-100" @click="openReminderTab(station.id)">
                    <Bell class="h-3.5 w-3.5 text-slate-300" />
                  </button>
                </div>
              </div>
              <!-- 第二行：時間、距離、預估 ETA（橫向排列） -->
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px] text-slate-500">
                <span class="flex items-center gap-1"><Clock class="h-3 w-3" /> {{ station.timeRange }}</span>
                <span class="flex items-center gap-1"><MapPin class="h-3 w-3" /> {{ station.distance }} m</span>
                <span v-if="station.etaTime" class="flex items-center gap-1 font-semibold text-primary">
                  <Truck class="h-3 w-3" /> 預計 {{ station.etaTime }}
                </span>
              </div>
              <!-- 第三行：清運種類（橫向排列） -->
              <div class="mt-1.5 flex flex-wrap gap-1 pl-7">
                <Badge
                  v-for="item in station.items"
                  :key="item"
                  variant="outline"
                  :class="['rounded-full px-2 py-0 text-[10px] font-semibold', ITEM_CONFIG[item]?.badge ?? 'border-slate-200 bg-slate-50 text-slate-500']"
                >
                  {{ item }}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- ── 桌面版：原始表格（sm 以上顯示） ── -->
      <Card class="hidden rounded-2xl sm:block">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 bg-slate-50/50">
                <th class="w-10 px-4 py-3 text-center text-xs font-semibold text-slate-500">#</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">清運地點</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">狀態</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">預估抵達</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">表定時間</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">距離</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">清運種類</th>
                <th class="w-20 px-4 py-3 text-center text-xs font-semibold text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(station, index) in filteredStations" :key="station.id" class="border-b border-slate-50 transition-colors hover:bg-slate-50/60">
                <td class="px-4 py-3 text-center"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{{ index + 1 }}</span></td>
                <td class="px-4 py-3"><p class="text-sm font-semibold text-slate-900">{{ station.name }}</p></td>
                <td class="px-4 py-3"><Badge variant="outline" :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">{{ STATUS_CONFIG[station.status].label }}</Badge></td>
                <td class="whitespace-nowrap px-4 py-3"><span v-if="station.etaTime" class="font-semibold text-primary">{{ station.etaTime }}</span><span v-else class="text-slate-400">--</span></td>
                <td class="whitespace-nowrap px-4 py-3 text-slate-700">{{ station.timeRange }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-slate-700">{{ station.distance }} m</td>
                <td class="px-4 py-3"><div class="flex flex-wrap gap-1"><Badge v-for="item in station.items" :key="item" variant="outline" :class="['rounded-full px-2 py-0 text-[10px] font-semibold', ITEM_CONFIG[item]?.badge ?? '']">{{ item }}</Badge></div></td>
                <td class="px-4 py-3"><div class="flex items-center justify-center gap-1"><button class="rounded-lg p-1.5 hover:bg-amber-50" @click="toggleFavorite(station.id)"><Star class="h-4 w-4" :class="isFavorited(station.id) ? 'text-amber-500' : 'text-slate-300'" :fill="isFavorited(station.id) ? 'currentColor' : 'none'" /></button><button class="rounded-lg p-1.5 hover:bg-slate-100" @click="openReminderTab(station.id)"><Bell class="h-4 w-4 text-slate-300" /></button></div></td>
              </tr>
              <tr v-if="filteredStations.length === 0">
                <td colspan="8" class="px-4 py-12 text-center text-sm text-slate-500">目前條件下沒有找到清運站點</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 附近查詢                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'nearby'" class="space-y-4">
      <div ref="nearbyMapContainerRef" class="overflow-hidden rounded-2xl border border-slate-200" style="height: 350px" />
      <Card class="rounded-2xl">
        <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
          <CardTitle class="text-sm font-semibold">鄰近站點（依距離排序）</CardTitle>
          <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 text-primary">{{ nearbyStations.length }} 個站點</Badge>
        </CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-slate-100">
            <button v-for="station in nearbyStations" :key="station.id" class="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/60" @click="selectStation(station)">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-white">{{ station.distance }}m</div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-900">{{ station.name }}</p>
                <p class="mt-0.5 text-xs text-slate-500">{{ station.items.join(' · ') }} · {{ station.timeRange }}</p>
              </div>
              <Badge variant="outline" :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">{{ STATUS_CONFIG[station.status].label }}</Badge>
            </button>
          </div>
        </CardContent>
      </Card>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 手動定位                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'manual'" class="space-y-4">
      <Card class="rounded-2xl border-primary/20 bg-primary/[0.03]">
        <CardContent class="flex items-center gap-3 p-4">
          <div class="rounded-xl bg-primary/10 p-2"><MapPin class="h-4 w-4 text-primary" /></div>
          <div>
            <p class="text-sm font-semibold text-slate-900">點擊地圖上的位置進行查詢</p>
            <p class="text-xs text-slate-500">系統將以點擊位置為中心，查詢附近 500 公尺內的清運站點資訊</p>
          </div>
        </CardContent>
      </Card>
      <div ref="manualMapContainerRef" class="overflow-hidden rounded-2xl border border-slate-200" style="height: 380px" />

      <!-- 點擊後的查詢結果 -->
      <Card v-if="manualPin && manualNearbyStations.length > 0" class="rounded-2xl">
        <CardHeader class="border-b border-slate-100 px-5 py-3.5">
          <CardTitle class="text-base font-bold text-slate-900">
            點選位置附近 500m 清運站點
            <span class="ml-1.5 text-sm font-normal text-slate-500">（共 {{ manualNearbyStations.length }} 筆）</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-slate-100">
            <button
              v-for="station in manualNearbyStations"
              :key="station.id"
              class="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/60"
              @click="selectStation(station)"
            >
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-white">{{ station.manualDist }}m</div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-900">{{ station.name }}</p>
                <p class="mt-0.5 text-xs text-slate-500">{{ station.items.join(' · ') }} · {{ station.timeRange }}</p>
              </div>
              <Badge variant="outline" :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">{{ STATUS_CONFIG[station.status].label }}</Badge>
            </button>
          </div>
        </CardContent>
      </Card>
      <div v-else-if="manualPin && manualNearbyStations.length === 0" class="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center">
        <MapPin class="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p class="text-sm text-slate-500">點選位置附近 500m 內無清運站點</p>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 我的收藏                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'favorites'" class="space-y-4">
      <div v-if="favoriteStations.length === 0" class="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-20">
        <Star class="h-9 w-9 text-slate-300" />
        <p class="text-sm text-slate-500">目前無收藏站點，前往查詢頁新增吧！</p>
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <Card v-for="station in favoriteStations" :key="station.id" class="overflow-hidden rounded-2xl transition-shadow hover:shadow-md">
          <CardContent class="space-y-3 p-5">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-bold text-slate-900">{{ station.name }}</h3>
                  <Badge variant="outline" :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CONFIG[station.status].badgeClass]">{{ STATUS_CONFIG[station.status].label }}</Badge>
                </div>
                <p class="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin class="h-3 w-3" /> {{ station.address }}</p>
              </div>
              <button class="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50" @click="toggleFavorite(station.id)"><Star class="h-4 w-4" fill="currentColor" /></button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-xl bg-slate-50 p-2.5 text-center"><p class="text-[10px] text-slate-500">清運時間</p><p class="text-sm font-bold text-slate-900">{{ station.timeRange.split(' - ')[0] }}</p></div>
              <div class="rounded-xl bg-slate-50 p-2.5 text-center"><p class="text-[10px] text-slate-500">距離</p><p class="text-sm font-bold text-slate-900">{{ station.distance }}m</p></div>
              <div class="rounded-xl bg-slate-50 p-2.5 text-center"><p class="text-[10px] text-slate-500">預估抵達</p><p :class="['text-sm font-bold', station.etaTime ? 'text-primary' : 'text-slate-400']">{{ station.etaTime ?? '—' }}</p></div>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" class="flex-1 gap-1.5 rounded-xl" @click="openReminderTab(station.id)"><Bell class="h-3.5 w-3.5" /> 提醒</Button>
              <Button class="flex-1 gap-1.5 rounded-xl bg-primary text-white hover:bg-primary/90" @click="openNavigation(station)"><Navigation class="h-3.5 w-3.5" /> 導航</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 提醒設定                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'reminder'" class="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card class="rounded-2xl">
        <CardContent class="space-y-4 p-5">
          <h3 class="text-base font-bold text-slate-900">新增提醒</h3>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">選擇清運站點</label>
            <select v-model="reminderForm.stationId" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
              <option value="">請選擇...</option>
              <option v-for="s in favoriteStations" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">提醒日期</label>
            <div class="flex gap-1.5">
              <button v-for="(day, i) in DAYS" :key="i" type="button" :class="['flex-1 rounded-lg py-2 text-xs font-semibold transition-all', reminderForm.days.includes(i) ? 'bg-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100']" @click="toggleReminderDay(i)">{{ day }}</button>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">提前通知時間</label>
            <div class="flex gap-2">
              <button v-for="m in [10, 15, 30]" :key="m" type="button" :class="['flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all', reminderForm.minutesBefore === m ? 'border-primary bg-primary/[0.06] text-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300']" @click="reminderForm.minutesBefore = m">{{ m }} 分鐘前</button>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">通知方式</label>
            <div class="space-y-2">
              <label v-for="opt in NOTIFY_OPTIONS" :key="opt.key" class="flex cursor-pointer items-center gap-2">
                <div :class="['flex h-4 w-4 items-center justify-center rounded border transition-colors', reminderForm[opt.key] ? 'border-primary bg-primary' : 'border-slate-300 bg-white']" @click="reminderForm[opt.key] = !reminderForm[opt.key]">
                  <svg v-if="reminderForm[opt.key]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <span class="text-sm text-slate-900">{{ opt.label }}</span>
              </label>
            </div>
          </div>
          <Button class="w-full rounded-xl bg-primary text-white hover:bg-primary/90" @click="addReminder">儲存提醒設定</Button>
        </CardContent>
      </Card>
      <Card class="rounded-2xl">
        <CardHeader class="border-b border-slate-100 px-5 py-4"><CardTitle class="text-base font-bold">已設定的提醒</CardTitle></CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-slate-100">
            <div v-for="reminder in reminders" :key="reminder.id" class="flex items-center gap-4 px-5 py-4">
              <div :class="['shrink-0 rounded-xl p-2.5', reminder.active ? 'bg-primary/10' : 'bg-slate-50']"><Bell :class="['h-4 w-4', reminder.active ? 'text-primary' : 'text-slate-400']" /></div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900">{{ reminder.stationName }}</p>
                <p class="mt-0.5 text-xs text-slate-500">週{{ reminder.days.map(d => DAYS[d]).join('、') }} · 提前 {{ reminder.minutesBefore }} 分鐘</p>
              </div>
              <div class="flex items-center gap-2">
                <button :class="['relative h-5 w-10 rounded-full transition-colors', reminder.active ? 'bg-primary' : 'bg-slate-200']" @click="toggleReminderActive(reminder.id)">
                  <span :class="['absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', reminder.active ? 'translate-x-[22px]' : 'translate-x-0.5']" />
                </button>
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" @click="removeReminder(reminder.id)"><X class="h-4 w-4" /></button>
              </div>
            </div>
          </div>
          <div v-if="reminders.length === 0" class="px-5 py-12 text-center"><Bell class="mx-auto mb-2 h-8 w-8 text-slate-300" /><p class="text-sm text-slate-500">尚未設定任何提醒</p></div>
        </CardContent>
      </Card>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: 操作指引                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <section v-else-if="activeTab === 'guide'" class="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card class="h-fit rounded-2xl lg:sticky lg:top-6">
        <CardContent class="space-y-1 p-4">
          <p class="mb-2 text-xs font-semibold text-slate-500">目錄</p>
          <button v-for="(section, i) in GUIDE_SECTIONS" :key="i" :class="['w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors', guideActiveIndex === i ? 'bg-primary/[0.06] text-primary' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700']" @click="scrollToSection(i)">{{ section.title }}</button>
        </CardContent>
      </Card>
      <div class="space-y-6">
        <Card v-for="(section, i) in GUIDE_SECTIONS" :key="i" :id="`guide-section-${i}`" class="rounded-2xl scroll-mt-4">
          <CardContent class="p-6">
            <h3 class="mb-3 text-lg font-bold text-slate-900">{{ section.title }}</h3>
            <p class="text-sm leading-7 text-slate-600">{{ section.desc }}</p>
          </CardContent>
        </Card>
      </div>
    </section>
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  </div>
</template>
