<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Route, Layers, LocateFixed } from 'lucide-vue-next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  validPoint,
  type GarbageCity,
  type GarbageStop,
  type Point,
  type TruckPosition,
} from '@/src/utils/garbage'
import { groupRoutes, routeSegments } from '@/src/utils/garbage-routes'
import { stopStatus } from '@/src/utils/garbage-status'
const props = defineProps<{
  timestamp?: number
  scheduleDate?: string
  city?: GarbageCity
  stops: GarbageStop[]
  routeStops?: GarbageStop[]
  radius: number
  center: Point | null
  manual: boolean
  vehicles: TruckPosition[]
  focus: GarbageStop | null
}>()
const emit = defineEmits<{ pick: [point: Point]; select: [stop: GarbageStop] }>()
const container = ref<HTMLDivElement>()
const error = ref(''),
  ready = ref(false),
  aerial = ref(false),
  routesOpen = ref(false),
  routeId = ref('')
const routeVisible = ref(true)
function closeRoutes() {
  routesOpen.value = false
  routeId.value = ''
  routeVisible.value = true
  syncRoute()
}
const routes = computed(() => groupRoutes(props.routeStops ?? props.stops))
const routeSearch = ref('')
const matchingRoutes = computed(() => {
  const query = routeSearch.value.trim().replaceAll('台', '臺').toLocaleLowerCase()
  return routes.value.filter((route) =>
    (route.label + ' ' + route.stops.map((stop) => stop.address).join(' '))
      .replaceAll('台', '臺')
      .toLocaleLowerCase()
      .includes(query),
  )
})
const drawer = ref<HTMLElement>()
const drawerPosition = ref<{ x: number; y: number } | null>(null)
let drag: { id: number; x: number; y: number; left: number; top: number } | null = null
function moveDrawer(x: number, y: number) {
  const element = drawer.value
  const parent = element?.parentElement
  if (!element || !parent) return
  drawerPosition.value = {
    x: Math.max(0, Math.min(x, parent.clientWidth - element.offsetWidth)),
    y: Math.max(0, Math.min(y, parent.clientHeight - element.offsetHeight)),
  }
}
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
  const element = drawer.value!
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: element.offsetLeft,
    top: element.offsetTop,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}
function dragDrawer(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  moveDrawer(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
}
function keyboardMove(event: KeyboardEvent) {
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [-20, 0],
    ArrowRight: [20, 0],
    ArrowUp: [0, -20],
    ArrowDown: [0, 20],
  }
  const step = steps[event.key]
  if (!step || event.target !== event.currentTarget || !drawer.value) return
  event.preventDefault()
  moveDrawer(drawer.value.offsetLeft + step[0], drawer.value.offsetTop + step[1])
}
function openRoute(stop: GarbageStop) {
  routeSearch.value = ''
  routeId.value = groupRoutes([stop])[0]!.id
  routesOpen.value = true
  chooseRoute()
}
defineExpose({ openRoute })
const activeRoute = computed(() => routes.value.find((r) => r.id === routeId.value))
let map: maplibregl.Map | undefined, marker: maplibregl.Marker | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame = 0
let lastMapSize = { width: 0, height: 0, ratio: 0 }
let resolutionQuery: MediaQueryList | undefined
function refreshMapSize() {
  resizeFrame = 0
  const element = container.value
  if (!map || !element || !element.clientWidth || !element.clientHeight) return
  const width = element.clientWidth
  const height = element.clientHeight
  const ratio = window.devicePixelRatio || 1
  if (width !== lastMapSize.width || height !== lastMapSize.height || ratio !== lastMapSize.ratio) {
    map.resize()
    lastMapSize = { width, height, ratio }
  }
  map.triggerRepaint()
  if (drawerPosition.value) moveDrawer(drawerPosition.value.x, drawerPosition.value.y)
}
function scheduleMapResize() {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(refreshMapSize)
}
function watchResolution() {
  resolutionQuery?.removeEventListener('change', watchResolution)
  resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  resolutionQuery.addEventListener('change', watchResolution)
  scheduleMapResize()
}
const empty = () => ({ type: 'FeatureCollection' as const, features: [] })
function sync() {
  if (!map?.getSource('stops')) return
  const source = (name: string) => map!.getSource(name) as maplibregl.GeoJSONSource
  source('stops').setData({
    type: 'FeatureCollection',
    features: props.stops.filter(validPoint).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { id: s.id, ...stopStatus(s, props.timestamp ?? Date.now(), props.scheduleDate) },
    })),
  })
  source('vehicles').setData({
    type: 'FeatureCollection',
    features: props.vehicles.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
      properties: { plate: v.plate },
    })),
  })
  marker?.remove()
  marker = undefined
  if (props.center) {
    const { lat, lng } = props.center
    const el = document.createElement('div')
    el.className = props.manual ? 'garbage-location-dot manual-location' : 'garbage-location-dot'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', props.manual ? '手動查詢中心' : '你的目前位置')
    marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
    const coordinates = Array.from({ length: 65 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 64
      return [
        lng + (props.radius * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)),
        lat + (props.radius * Math.cos(angle)) / 111320,
      ]
    })
    source('radius').setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [coordinates] },
    })
  } else source('radius').setData(empty())
  syncRoute()
}
function syncRoute() {
  if (!map?.getSource('route-order')) return
  const stops = routeVisible.value ? activeRoute.value?.stops || [] : []
  ;(map.getSource('route-order') as maplibregl.GeoJSONSource).setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: routeSegments(stops) },
  })
  ;(map.getSource('route-times') as maplibregl.GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: stops
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => validPoint(s))
      .map(({ s, i }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          ...stopStatus(s, props.timestamp ?? Date.now(), props.scheduleDate),
          label: `${i + 1}. ${s.departureEstimated ? '約 ' : ''}${s.arrival}${s.departure !== s.arrival ? '–' + s.departure : ''}`,
        },
      })),
  })
}
function chooseRoute() {
  routeVisible.value = true
  syncRoute()
  const points = activeRoute.value?.stops.filter(validPoint) || []
  if (map && points.length) {
    const bounds = new maplibregl.LngLatBounds()
    points.forEach((s) => bounds.extend([s.lng, s.lat]))
    map.fitBounds(bounds, { padding: 65, maxZoom: 16 })
  }
}
function toggleAerial() {
  aerial.value = !aerial.value
  map?.setLayoutProperty('aerial', 'visibility', aerial.value ? 'visible' : 'none')
  error.value = ''
}
function start() {
  if (!container.value) return
  error.value = ''
  ready.value = false
  marker?.remove()
  marker = undefined
  map?.remove()
  try {
    map = new maplibregl.Map({
      container: container.value,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: props.city === '新北市' ? [121.462, 25.012] : [121.535, 25.055],
      zoom: 12,
    })
    lastMapSize = { width: 0, height: 0, ratio: 0 }
    scheduleMapResize()
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('error', () => {
      error.value = '部分圖資暫時無法載入，可切回平面圖或使用下方列表。'
    })
    map.on('style.load', () => {
      if (!map) return
      error.value = ''
      map.addSource('aerial', {
        type: 'raster',
        tiles: ['https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '航照影像 © 內政部國土測繪中心',
      })
      map.addLayer({
        id: 'aerial',
        type: 'raster',
        source: 'aerial',
        layout: { visibility: aerial.value ? 'visible' : 'none' },
      })
      map.addSource('radius', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': '#3386ff', 'fill-opacity': 0.06 },
      })
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#3386ff', 'line-width': 2, 'line-dasharray': [3, 3] },
      })
      map.addSource('stops', {
        type: 'geojson',
        data: empty(),
        cluster: false,
      })
      for (const [state, color] of Object.entries({
        active: '#16a568',
        ended: '#50545b',
        upcoming: '#cf9500',
        pending: '#9499a3',
        unknown: '#9499a3',
      })) {
        const canvas = document.createElement('canvas')
        canvas.width = 48
        canvas.height = 32
        const context = canvas.getContext('2d')!
        context.shadowColor = '#00000040'
        context.shadowBlur = 3
        context.shadowOffsetY = 2
        context.fillStyle = color
        context.beginPath()
        context.roundRect(3, 3, 42, 24, 5)
        context.fill()
        map.addImage(`schedule-${state}`, context.getImageData(0, 0, 48, 32), {
          content: [9, 7, 39, 23],
          stretchX: [[10, 38]],
          stretchY: [[10, 20]],
        })
      }
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })
      map.addSource('route-order', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'stop-time-labels',
        type: 'symbol',
        source: 'stops',
        minzoom: 15,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-padding': 3,
          'icon-image': ['concat', 'schedule-', ['get', 'state']],
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [4, 7, 4, 7],
        },
        paint: { 'text-color': '#fff' },
      })
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-order',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1677ff', 'line-width': 14, 'line-blur': 7, 'line-opacity': 0.5 },
      })
      map.addLayer({
        id: 'route-order',
        type: 'line',
        source: 'route-order',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1677ff', 'line-width': 5 },
      })
      map.addLayer({
        id: 'route-core',
        type: 'line',
        source: 'route-order',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#9eeaff', 'line-width': 1.5, 'line-opacity': 0.9 },
      })
      map.addSource('route-times', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'route-times-points',
        type: 'circle',
        source: 'route-times',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })
      map.addLayer({
        id: 'route-times-labels',
        type: 'symbol',
        source: 'route-times',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
          'text-offset': [0, -1.5],
          'icon-image': ['concat', 'schedule-', ['get', 'state']],
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [4, 7, 4, 7],
        },
        paint: { 'text-color': '#fff' },
      })
      map.addSource('vehicles', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'trucks',
        type: 'circle',
        source: 'vehicles',
        paint: {
          'circle-color': '#059669',
          'circle-radius': 10,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 3,
        },
      })
      map.addLayer({
        id: 'truck-labels',
        type: 'symbol',
        source: 'vehicles',
        layout: {
          'text-field': ['get', 'plate'],
          'text-size': 12,
          'text-offset': [0, -2],
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#065f46', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      })
      map.getCanvas().style.cursor = props.manual ? 'crosshair' : ''
      ready.value = true
      sync()
      if (routeId.value && routeVisible.value) chooseRoute()
      if (props.center) map.jumpTo({ center: [props.center.lng, props.center.lat], zoom: 15 })
    })
    map.on('click', async (e) => {
      if (!map?.getSource('stops')) return
      if (props.manual) {
        emit('pick', { lat: e.lngLat.lat, lng: e.lngLat.lng })
        return
      }
      const f = map.queryRenderedFeatures(e.point, {
        layers: ['route-times-labels', 'route-times-points', 'points', 'stop-time-labels'],
      })[0]
      if (f?.properties?.id) {
        const stop = (props.routeStops ?? props.stops).find((s) => s.id === f.properties.id)
        if (stop) emit('select', stop)
      }
    })
  } catch {
    error.value = '此裝置無法啟動地圖，請使用列表查詢。'
  }
}
watch(
  () => [
    props.stops,
    props.center,
    props.radius,
    props.vehicles,
    props.timestamp,
    props.scheduleDate,
  ],
  sync,
)
watch(activeRoute, syncRoute)
watch(routeVisible, syncRoute)
watch(
  () => props.center,
  (p) => {
    if (p) map?.easeTo({ center: [p.lng, p.lat], zoom: 15 })
  },
)
watch(
  () => props.focus,
  (s) => {
    if (s && validPoint(s)) map?.flyTo({ center: [s.lng, s.lat], zoom: 17 })
  },
)
watch(
  () => props.manual,
  (v) => {
    if (map) map.getCanvas().style.cursor = v ? 'crosshair' : ''
  },
)
onMounted(() => {
  start()
  resizeObserver = new ResizeObserver(scheduleMapResize)
  if (container.value) resizeObserver.observe(container.value)
  document.addEventListener('scroll', scheduleMapResize, { capture: true, passive: true })
  window.addEventListener('resize', scheduleMapResize)
  window.visualViewport?.addEventListener('resize', scheduleMapResize)
  watchResolution()
})
onUnmounted(() => {
  cancelAnimationFrame(resizeFrame)
  document.removeEventListener('scroll', scheduleMapResize, true)
  window.removeEventListener('resize', scheduleMapResize)
  window.visualViewport?.removeEventListener('resize', scheduleMapResize)
  resolutionQuery?.removeEventListener('change', watchResolution)
  resizeObserver?.disconnect()
  marker?.remove()
  map?.remove()
  map = undefined
})
</script>
<template>
  <div class="garbage-map-shell" :data-ready="ready" :data-layer="aerial ? 'aerial' : 'street'">
    <div
      ref="container"
      class="garbage-map"
      :aria-label="manual ? '點擊地圖選擇查詢中心' : '臺北市清運站點地圖'"
    />
    <div class="map-tools">
      <button
        type="button"
        title="路線列表"
        aria-label="路線列表"
        :aria-expanded="routesOpen"
        @click="routesOpen ? closeRoutes() : (routesOpen = true)"
      >
        <Route :size="21" aria-hidden="true" />
      </button>
      <button
        type="button"
        :title="aerial ? '切回平面圖' : '切換航照影像'"
        :aria-label="aerial ? '切回平面圖' : '切換航照影像'"
        :disabled="!ready"
        :aria-pressed="aerial"
        @click="toggleAerial"
      >
        <Layers :size="21" aria-hidden="true" />
      </button>
      <button
        type="button"
        :disabled="!center"
        :title="manual ? '查詢中心' : '目前位置'"
        :aria-label="manual ? '查詢中心' : '目前位置'"
        @click="center && map?.easeTo({ center: [center.lng, center.lat], zoom: 16 })"
      >
        <LocateFixed :size="21" aria-hidden="true" />
      </button>
    </div>
    <section
      v-if="routesOpen"
      ref="drawer"
      class="route-drawer"
      aria-label="清運路線列表"
      :style="
        drawerPosition ? { left: drawerPosition.x + 'px', top: drawerPosition.y + 'px' } : undefined
      "
    >
      <header
        tabindex="0"
        aria-label="拖曳移動路線卡，或使用方向鍵移動"
        @pointerdown.stop="startDrag"
        @pointermove.stop="dragDrawer"
        @pointerup="drag = null"
        @pointercancel="drag = null"
        @lostpointercapture="drag = null"
        @keydown="keyboardMove"
      >
        <strong>清運班次路線</strong
        ><button
          type="button"
          aria-label="關閉路線列表"
          title="關閉卡片並清除地圖路線"
          @click="closeRoutes"
        >
          ×
        </button>
      </header>
      <label
        >搜尋路線、車號或站點<input
          v-model="routeSearch"
          type="search"
          placeholder="輸入路線、行政區、車號或地址"
      /></label>
      <label
        >符合的路線（{{ matchingRoutes.length }}）<select v-model="routeId" @change="chooseRoute">
          <option value="">請選擇班次</option>
          <option
            v-if="activeRoute && !matchingRoutes.some((route) => route.id === routeId)"
            :value="routeId"
          >
            {{ activeRoute.label }}（目前選取）
          </option>
          <option v-for="route in matchingRoutes" :key="route.id" :value="route.id">
            {{ route.label }}
          </option>
        </select></label
      >
      <p v-if="!matchingRoutes.length" role="status">沒有符合的路線，請換個關鍵字。</p>
      <p>
        有官方站序時依站序排列，其餘依表定時間排序；編號對應地圖上的站點。藍色實線為站點連線示意，非實際行車路徑。
      </p>
      <div v-if="routeId" class="route-actions">
        <button type="button" :aria-pressed="routeVisible" @click="routeVisible = !routeVisible">
          {{ routeVisible ? '隱藏路線' : '顯示路線' }}
        </button>
        <button type="button" @click="routeId = ''">清除路線</button>
      </div>
      <ol v-if="activeRoute">
        <li v-for="(stop, index) in activeRoute.stops" :key="stop.id">
          <span class="route-sequence">{{ index + 1 }}</span>
          <button type="button" @click="emit('select', stop)">
            <strong>{{ stop.arrival }}–{{ stop.departure }}</strong
            ><span>{{ stop.address }}</span
            ><small v-if="!validPoint(stop)">座標待確認，未繪於地圖</small>
          </button>
        </li>
      </ol>
    </section>
    <div v-if="error" class="map-message" role="alert">
      {{ error }} <button type="button" @click="start">重新載入</button>
    </div>
    <div v-else-if="!ready" class="map-message" role="status">正在載入地圖，站點列表仍可使用。</div>
    <div class="map-legend">
      <span style="background: #50545b" class="stop-dot" />表定結束
      <span style="background: #9499a3" class="stop-dot" />尚未抵達
      <span class="stop-dot" />即將抵達（15 分內）
      <span style="background: #16a568" class="stop-dot" />表定收運中 <span class="user-dot" />{{
        manual ? '手動中心' : '目前位置'
      }}
      <span class="truck-dot" />車輛 GPS<span v-if="aerial">航照非即時影像</span>
    </div>
  </div>
</template>
<style scoped>
.garbage-map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid #e3e2ec;
}
.garbage-map {
  height: 480px;
  width: 100%;
  background: #f6f6f5;
}
.map-tools {
  position: absolute;
  left: 16px;
  top: 112px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.map-tools button,
.route-drawer {
  background: white;
  border: 1px solid #e5e5ef;
  border-radius: 12px;
  box-shadow: 0 3px 12px #00000012;
}
.map-tools button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 12px;
  text-align: left;
}
.map-tools button[aria-pressed='true'] {
  color: #1761ca;
  background: #eff6ff;
}
.route-drawer {
  position: absolute;
  top: 104px;
  left: 76px;
  width: min(340px, calc(100% - 92px));
  max-height: calc(100% - 175px);
  overflow: auto;
  padding: 16px;
  z-index: 4;
}
.route-drawer header {
  cursor: move;
  touch-action: none;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.route-drawer header button {
  font-size: 24px;
  padding: 0 8px;
}
.route-drawer label {
  display: block;
  font-size: 12px;
  margin-top: 12px;
}
.route-drawer select,
.route-drawer input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
.route-drawer p {
  font-size: 11px;
  color: #6b7280;
  margin: 10px 0 !important;
}
.route-drawer ol {
  padding: 0;
  list-style: none;
}
.route-actions {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.route-actions button {
  padding: 6px 12px;
  border: 1px solid #d8e6ff;
  border-radius: 8px;
  color: #1761ca;
  background: #eff6ff;
}
.route-drawer li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #eee;
}
.route-drawer .route-sequence {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #eeedf7;
  color: #5146a5;
  font-size: 12px;
  font-weight: 700;
}
.route-drawer li button {
  text-align: left;
  font-size: 12px;
}
.route-drawer li strong,
.route-drawer li span,
.route-drawer li small {
  display: block;
}
.route-drawer li strong {
  color: #b16c00;
}
.map-message {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 55px;
  padding: 12px;
  background: #fff5e9;
  border-radius: 12px;
  font-size: 13px;
  z-index: 5;
}
.map-message button {
  text-decoration: underline;
}
.map-legend {
  position: absolute;
  bottom: 34px;
  left: 12px;
  right: 12px;
  width: fit-content;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: #fffffff0;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 10px;
  pointer-events: none;
}
.stop-dot,
.user-dot,
.truck-dot {
  height: 8px;
  width: 8px;
  background: #efaa15;
  border-radius: 50%;
}
.user-dot {
  background: #3386ff;
}
.truck-dot {
  background: #059669;
}
:deep(.garbage-location-dot) {
  width: 20px;
  height: 20px;
  border: 3px solid white;
  border-radius: 50%;
  background: #3386ff;
  box-shadow: 0 0 0 10px #3386ff25;
}
:deep(.garbage-location-dot::after) {
  content: '';
  position: absolute;
  inset: -12px;
  border: 2px solid #3386ff60;
  border-radius: 50%;
  animation: location-pulse 2s ease-out infinite;
}
:deep(.manual-location) {
  background: #e87942;
  box-shadow: 0 0 0 10px #e8794225;
}
:deep(.manual-location::after) {
  display: none;
}
@keyframes location-pulse {
  from {
    transform: scale(0.7);
    opacity: 1;
  }
  to {
    transform: scale(1.5);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  :deep(.garbage-location-dot::after) {
    animation: none;
  }
}
@media (max-width: 600px) {
  .route-drawer {
    left: 12px;
    top: 112px;
    width: calc(100% - 24px);
    max-height: calc(100% - 185px);
  }
}
</style>
