<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { validPoint, type GarbageStop, type Point, type TruckPosition } from '@/src/utils/garbage'
const props = defineProps<{
  stops: GarbageStop[]
  center: Point | null
  manual: boolean
  vehicles: TruckPosition[]
  focus: GarbageStop | null
}>()
const emit = defineEmits<{ pick: [point: Point]; select: [stop: GarbageStop] }>()
const container = ref<HTMLDivElement>()
const error = ref('')
const ready = ref(false)
let map: maplibregl.Map | undefined
let marker: maplibregl.Marker | undefined
let resizeObserver: ResizeObserver | undefined
const empty = () => ({ type: 'FeatureCollection' as const, features: [] })
function sync() {
  if (!map?.getSource('stops')) return
  const source = (name: string) => map!.getSource(name) as maplibregl.GeoJSONSource
  source('stops').setData({
    type: 'FeatureCollection',
    features: props.stops
      .filter(validPoint)
      .map((s) => ({
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
  if (props.center) {
    const { lat, lng } = props.center
    marker = new maplibregl.Marker({ color: props.manual ? '#e87942' : '#4f46ad' })
      .setLngLat([lng, lat])
      .addTo(map)
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
}
function start() {
  if (!container.value) return
  error.value = ''
  ready.value = false
  map?.remove()
  try {
    map = new maplibregl.Map({
      container: container.value,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [121.535, 25.055],
      zoom: 12,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('error', () => {
      error.value = '地圖圖資暫時無法載入，仍可使用下方站點列表。'
    })
    map.on('style.load', () => {
      if (!map) return
      error.value = ''
      map.addSource('radius', { type: 'geojson', data: empty() })
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': '#6155bd', 'fill-opacity': 0.09 },
      })
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#6155bd', 'line-width': 2, 'line-dasharray': [3, 3] },
      })
      map.addSource('stops', {
        type: 'geojson',
        data: empty(),
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 40,
      })
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stops',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#5146aa',
          'circle-radius': 19,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stops',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#fff' },
      })
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'stops',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#6155bd',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
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
        layout: { 'text-field': ['get', 'plate'], 'text-size': 12, 'text-offset': [0, -2], 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#065f46', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      })
      map.on('click', async (e) => {
        if (!map) return
        if (props.manual) {
          emit('pick', { lat: e.lngLat.lat, lng: e.lngLat.lng })
          return
        }
        const features = map.queryRenderedFeatures(e.point, { layers: ['points', 'clusters'] })
        const f = features[0]
        if (f?.properties?.cluster_id) {
          const zoom = await (
            map.getSource('stops') as maplibregl.GeoJSONSource
          ).getClusterExpansionZoom(f.properties.cluster_id)
          if (f.geometry.type === 'Point')
            map.easeTo({ center: f.geometry.coordinates as [number, number], zoom })
        } else if (f?.properties?.id) {
          const stop = props.stops.find((s) => s.id === f.properties.id)
          if (stop) emit('select', stop)
        }
      })
      map.getCanvas().style.cursor = props.manual ? 'crosshair' : ''
      ready.value = true
      sync()
      if (props.center) map.jumpTo({ center: [props.center.lng, props.center.lat], zoom: 15 })
    })
  } catch {
    error.value = '此裝置無法啟動地圖，請使用列表查詢。'
  }
}
watch(() => [props.stops, props.center, props.vehicles], sync)
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
})
</script>
<template>
  <div class="garbage-map-shell" :data-ready="ready">
    <div
      ref="container"
      class="garbage-map"
      :aria-label="manual ? '點擊地圖選擇查詢中心' : '臺北市清運站點地圖'"
    />
    <div v-if="error" class="map-message" role="alert">
      {{ error }} <button type="button" @click="start">重新載入</button>
    </div>
    <div v-else-if="!ready" class="map-message" role="status">正在載入地圖，站點列表仍可使用。</div>
    <div class="map-legend">
      <span class="stop-dot" /> 清運站點 <span class="truck-dot" /> 車輛 GPS
      <span v-if="center">虛線：500 公尺</span>
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
  background: #efeee9;
}
.map-message {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  padding: 12px;
  background: #fff5e9;
  border-radius: 12px;
  font-size: 13px;
}
.map-message button {
  text-decoration: underline;
}
.map-legend {
  position: absolute;
  bottom: 34px;
  left: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  background: #fffffff0;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 11px;
  pointer-events: none;
}
.stop-dot,
.truck-dot {
  height: 9px;
  width: 9px;
  background: #6155bd;
  border-radius: 50%;
}
.truck-dot {
  background: #059669;
}
</style>
