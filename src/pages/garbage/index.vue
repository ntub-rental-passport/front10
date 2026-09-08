<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
import GarbageFilters from '@/src/components/garbage/GarbageFilters.vue'
import CollectionCountdown from '@/src/components/garbage/CollectionCountdown.vue'
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
  type Point,
  type TruckPosition,
} from '@/src/utils/garbage'
import './garbage.css'

const filtersOpen = ref(false)
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
const vehicles = ref<TruckPosition[]>([]),
  gpsMessage = ref('車輛 GPS 連線確認中…'),
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
const stopGroups = computed(() => {
  const groups = new globalThis.Map<string, GarbageStop[]>()
  for (const stop of stops.value) {
    const key = stop.district + '|' + stop.address.trim()
    const group = groups.get(key) || []
    group.push(stop)
    groups.set(key, group)
  }
  return groups
})
function schedulesAt(stop: GarbageStop) {
  return stopGroups.value.get(stop.district + '|' + stop.address.trim()) || [stop]
}
function submitFilters() {
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
const filtered = computed(() =>
  stops.value.filter(
    (s) =>
      (!district.value || s.district === district.value) &&
      (!village.value || s.village === village.value) &&
      (!road.value || normalized(s.address).includes(normalized(road.value))) &&
      overlaps(s, timeStart.value, timeEnd.value) &&
      isCollectionDay(queryDate.value),
  ),
)
const center = computed(() => (tab.value === 'manual' ? manualPoint.value : location.value))
const nearby = (point: Point | null) =>
  point
    ? stops.value
        .filter(validPoint)
        .map((s) => ({ ...s, distance: distanceMeters(point, s) }))
        .filter((s) => s.distance <= 500)
        .sort((a, b) => a.distance - b.distance)
    : []
const nearbyStops = computed(() => nearby(center.value))
const results = computed(() => {
  if (tab.value === 'nearby' || tab.value === 'manual') return nearbyStops.value
  if (tab.value === 'favorites') return stops.value.filter((s) => favorites.value.includes(s.id))
  return filtered.value
})
const pages = computed(() => Math.max(1, Math.ceil(results.value.length / 20)))
const visible = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20))
const dashboardStops = computed(() => nearby(location.value).slice(0, 3))
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
  loading.value = true
  dataError.value = ''
  try {
    stops.value = await loadGarbageStops()
  } catch (e) {
    dataError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
async function refreshGPS() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const data = await loadTrucks()
    vehicles.value = data.vehicles
    gpsMessage.value = data.message
  } catch {
    vehicles.value = []
    gpsMessage.value = '車輛 GPS 服務未連線，目前顯示表定時間。'
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
  if (!isCollectionDay(reminderDate.value)) {
    toast.value = '週三、週日例行停收，請改選其他日期。'
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
  <div class="garbage-page">
    <header class="garbage-header">
      <div>
        <p class="eyebrow">TAIPEI CITY · RENTMATE</p>
        <h1>台北市垃圾車時間查詢</h1>
        <p class="subtitle">即時定位・到達提醒 <span>讓倒垃圾，剛好順路。</span></p>
      </div>
      <div class="coverage"><span class="green-dot" /> 臺北市限定 <strong>12</strong> 行政區</div>
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
        }}<span v-if="item.id === 'favorites' && favorites.length" class="count">{{
          favorites.length
        }}</span>
      </button>
    </nav>
    <div v-if="toast" role="status" class="garbage-toast">
      <span>{{ toast }}</span
      ><button aria-label="關閉訊息" @click="toast = ''"><X :size="18" /></button>
    </div>
    <div v-if="dataError" class="notice error" role="alert">
      {{ dataError }} <button @click="loadData">重新載入</button>
    </div>
    <div v-if="loading" class="notice" role="status">正在載入臺北市清運站點…</div>
    <template v-if="!['reminder', 'guide'].includes(tab)">
      <section class="live-section" aria-labelledby="live-title">
        <div class="section-heading">
          <div>
            <h2 id="live-title">附近清運地點 <span>即時動態看板</span></h2>
            <p>{{ locationMessage }}</p>
          </div>
          <div class="toolbar">
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
        <p class="gps-status">
          <span :class="freshVehicles.length ? 'green-dot' : 'gray-dot'" />{{
            freshVehicles.length
              ? 'GPS 即時定位 · ' + freshVehicles.length + ' 輛車（30 秒更新）'
              : gpsMessage
          }}<span
            >班表時鐘
            {{ now.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) }}</span
          >
        </p>
        <div v-if="dashboardStops.length" class="tracker-grid">
          <article v-for="(s, i) in dashboardStops" :key="s.id" class="tracker-card">
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
              <div class="truck-icon"><Truck :size="28" /></div>
              <div>
                <small>官方表定抵達</small
                ><strong
                  >{{ s.arrival }}<span>– {{ s.departure }}</span></strong
                >
                <p>同站點下一班會自動更新</p>
              </div>
            </div>
            <CollectionCountdown :stops="schedulesAt(s)" :now="now" compact />
            <footer>
              <span><MapPin :size="13" />{{ Math.round(s.distance) }} m 直線距離</span
              ><span>{{ s.route }} · {{ s.plate }}</span>
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
        <div v-else class="nearby-empty">
          <Crosshair :size="26" />
          <div>
            <strong>{{
              location ? '目前位置 500 公尺內沒有臺北市清運站點' : '從你的位置，找到最近的清運站點'
            }}</strong>
            <p>
              {{
                location
                  ? '可使用地圖瀏覽臺北市，或切換手動定位選擇其他位置。'
                  : '啟用定位後顯示附近站點、實際直線距離與表定倒數。'
              }}
            </p>
          </div>
          <button class="text-button" @click="tab = 'manual'">手動選點 →</button>
        </div>
      </section>
      <section
        class="query-layout"
        :class="{ 'no-sidebar': tab !== 'list', 'map-query-layout': tab === 'map' }"
      >
        <GarbageFilters
          v-if="tab === 'list'"
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
          <div v-if="tab === 'manual'" class="notice">
            <MapPin :size="18" /><span
              >點擊地圖空白位置，以該點為中心查詢 500 公尺內站點。{{
                manualPoint
                  ? '已選：' + manualPoint.lat.toFixed(5) + ', ' + manualPoint.lng.toFixed(5)
                  : ''
              }}</span
            >
          </div>
          <div v-if="tab === 'nearby'" class="notice">
            <Navigation :size="18" /><span
              >以你的 GPS 位置查詢 500
              公尺內所有班表站點。距離為直線距離，實際步行路線可能較長。</span
            >
          </div>
          <div v-if="mapVisible" class="map-query-stage" :class="{ 'wide-map': tab === 'map' }">
            <button v-if="tab === 'map'" class="map-query-button" @click="filtersOpen = true">
              <Search :size="20" />查詢條件
            </button>
            <div v-if="tab === 'map'" class="map-filter-summary">
              {{ district || '臺北市全部行政區' }} · {{ village || '全部里別' }} · {{ queryDate
              }}<span v-if="road"> · {{ road }}</span>
            </div>
            <GarbageMap
              v-if="mapVisible"
              :stops="results"
              :center="center"
              :manual="tab === 'manual'"
              :vehicles="freshVehicles"
              :focus="selected"
              @pick="manualPoint = $event"
              @select="selected = $event"
            />
          </div>
          <div class="section-heading results-heading">
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
                ['map', 'list'].includes(tab) && !isCollectionDay(queryDate)
                  ? '選擇日期為週三或週日例行停收日，請選擇其他日期。'
                  : tab === 'manual' && !manualPoint
                    ? '請先點擊地圖選擇位置。'
                    : tab === 'nearby' && !location
                      ? '請先啟用 GPS 定位。'
                      : '可調整查詢條件、變更位置，或在站點按下星號收藏。'
              }}
            </p>
          </div>
          <div v-else class="panel table-scroll">
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
                    {{ s.arrival }}–{{ s.departure
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
          <div v-if="results.length > 20" class="pagination">
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
      <p class="eyebrow">STOP DETAILS</p>
      <h2>{{ selected.address }}</h2>
      <p>{{ selected.district }} · {{ selected.village }} · {{ selected.team }}</p>
      <strong class="detail-time">{{ selected.arrival }}–{{ selected.departure }}</strong>
      <p>表定時間 · {{ selected.route }} · {{ selected.trip }} · {{ selected.plate }}</p>
      <CollectionCountdown :stops="schedulesAt(selected)" :now="now" />
      <p>準誤點：尚無軌跡預測資料。表定倒數不代表車輛實際位置。</p>
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
    <footer class="garbage-footer">
      <p>
        資料來源：<a
          href="https://data.gov.tw/dataset/136515"
          target="_blank"
          rel="noopener noreferrer"
          >臺北市政府環境保護局 · 垃圾車點位路線資訊</a
        >｜本站資料：匯入 CSV 快照，共 {{ stops.length.toLocaleString() }} 筆有效停靠班次。
      </p>
      <p>
        紫色為清運站點；綠色為兩分鐘內更新的車輛 GPS。倒數依表定時間計算。24:xx 為隔日凌晨；{{
          stops.filter((s) => !validPoint(s)).length
        }}
        筆原始座標待確認，僅列入列表，不納入地圖與附近查詢。
      </p>
    </footer>
  </div>
</template>
