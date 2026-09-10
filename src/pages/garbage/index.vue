<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Bell,
  BookOpen,
  Crosshair,
  List,
  Map,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Star,
  Truck,
  X,
} from 'lucide-vue-next'
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
  { id: 'map', label: '地圖查詢', icon: Map },
  { id: 'list', label: '列表查詢', icon: List },
  { id: 'nearby', label: '附近查詢', icon: Crosshair },
  { id: 'manual', label: '手動定位', icon: MapPin },
  { id: 'favorites', label: '我的收藏', icon: Star },
  { id: 'reminder', label: '提醒設定', icon: Bell },
  { id: 'guide', label: '操作指引', icon: BookOpen },
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
                </tr>
              </tbody>
            </table>
          </div>
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
      <p v-if="selected.departureEstimated">
        表定抵達 {{ selected.arrival }}；估計離站 {{ selected.departure }}（暫估停留 10
        分鐘，非官方離站時間）。
      </p>
      <p>
        表定時間 ·
        <button class="text-button detail-route-link" @click="showRoute(selected)">
          {{ selected.route }}
        </button>
        · {{ selected.trip }} · {{ selected.plate }}
      </p>
      <CollectionCountdown :stops="schedulesAt(selected)" :now="now" />
      <p>準誤點：尚無軌跡預測資料。表定倒數不代表車輛實際位置。</p>
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
  </div>
</template>
