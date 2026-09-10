<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Route, Layers, LocateFixed } from 'lucide-vue-next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { validPoint, type GarbageStop, type Point, type TruckPosition } from '@/src/utils/garbage'
import { groupRoutes, routeSegments } from '@/src/utils/garbage-routes'
const props = defineProps<{
  stops: GarbageStop[]
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
const routes = computed(() => groupRoutes(props.stops))
const activeRoute = computed(() => routes.value.find((r) => r.id === routeId.value))
let map: maplibregl.Map | undefined, marker: maplibregl.Marker | undefined
let resizeObserver: ResizeObserver | undefined
const empty = () => ({ type: 'FeatureCollection' as const, features: [] })
function sync() {
  if (!map?.getSource('stops')) return
  const source = (name: string) => map!.getSource(name) as maplibregl.GeoJSONSource
  source('stops').setData({
    type: 'FeatureCollection',
    features: props.stops.filter(validPoint).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { id: s.id },
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
        lng + (500 * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)),
        lat + (500 * Math.cos(angle)) / 111320,
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
  const stops = activeRoute.value?.stops || []
  ;(map.getSource('route-order') as maplibregl.GeoJSONSource).setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: routeSegments(stops) },
  })
  ;(map.getSource('route-times') as maplibregl.GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: stops.filter(validPoint).map((s, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { id: s.id, label: `${i + 1}. ${s.arrival}–${s.departure}` },
    })),
  })
}
function chooseRoute() {
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
      center: [121.535, 25.055],
      zoom: 12,
    })
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
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-color': '#efaa15',
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      })
      map.addSource('route-order', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'route-order',
        type: 'line',
        source: 'route-order',
        paint: { 'line-color': '#3182f6', 'line-width': 3, 'line-dasharray': [2, 2] },
      })
      map.addSource('route-times', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'route-times-points',
        type: 'circle',
        source: 'route-times',
        paint: {
          'circle-color': '#e39a09',
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
        },
        paint: { 'text-color': '#8f5000', 'text-halo-color': '#fff', 'text-halo-width': 3 },
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
      if (props.center) map.jumpTo({ center: [props.center.lng, props.center.lat], zoom: 15 })
    })
    map.on('click', async (e) => {
      if (!map?.getSource('stops')) return
      if (props.manual) {
        emit('pick', { lat: e.lngLat.lat, lng: e.lngLat.lng })
        return
      }
      const f = map.queryRenderedFeatures(e.point, {
        layers: ['route-times-points', 'points'],
      })[0]
      if (f?.properties?.id) {
        const stop = props.stops.find((s) => s.id === f.properties.id)
        if (stop) emit('select', stop)
      }
    })
  } catch {
    error.value = '此裝置無法啟動地圖，請使用列表查詢。'
  }
}
watch(() => [props.stops, props.center, props.vehicles], sync)
watch(activeRoute, syncRoute)
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
  resizeObserver = new ResizeObserver(() => map?.resize())
  if (container.value) resizeObserver.observe(container.value)
})
onUnmounted(() => {
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
        @click="routesOpen = !routesOpen"
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
    <section v-if="routesOpen" class="route-drawer" aria-label="清運路線列表">
      <header>
        <strong>清運班次路線</strong
        ><button type="button" aria-label="關閉路線列表" @click="routesOpen = false">×</button>
      </header>
      <label
        >篩選結果中的路線（{{ routes.length }}）<select v-model="routeId" @change="chooseRoute">
          <option value="">請選擇班次</option>
          <option v-for="route in routes" :key="route.id" :value="route.id">
            {{ route.label }}
          </option>
        </select></label
      >
      <p>
        虛線僅為依表定時間排列的站點連線示意，不是實際道路或 GPS
        軌跡。同時刻站點的先後順序未經確認。
      </p>
      <button v-if="routeId" type="button" @click="routeId = ''">清除路線</button>
      <ol v-if="activeRoute">
        <li v-for="stop in activeRoute.stops" :key="stop.id">
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
      <span class="stop-dot" />清運站點 <span class="user-dot" />{{
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
  left: 150px;
  width: min(340px, calc(100% - 170px));
  max-height: calc(100% - 175px);
  overflow: auto;
  padding: 16px;
  z-index: 4;
}
.route-drawer header {
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
.route-drawer select {
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
  padding-left: 20px;
}
.route-drawer li {
  padding: 10px 0;
  border-top: 1px solid #eee;
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
