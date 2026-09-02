<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  Building2,
  Check,
  Eye,
  Home,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-vue-next'
import {
  createProperty,
  createRooms,
  fetchProperties,
  updateProperty,
  type LandlordProperty,
  type PropertyRoom,
  type PropertyRoomStatus,
} from '@/src/services/landlordPropertyApi'

const buildings = ref<LandlordProperty[]>([])
const selectedId = ref<number | null>(null)
const buildingKeyword = ref('')
const keyword = ref('')
const statusFilter = ref<'all' | PropertyRoomStatus>('all')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')
const buildingDialog = ref(false)
const roomDialog = ref(false)
const roomDetail = ref<PropertyRoom | null>(null)
const editingBuildingId = ref<number | null>(null)
const batchMode = ref(true)
const buildingForm = ref({ name: '', address: '', city: '臺北市' })
const roomForm = ref({ numbers: '', floor: '', area: '', rent: '' })

const allRooms = computed(() => buildings.value.flatMap((building) => building.rooms))
const current = computed(
  () => buildings.value.find((building) => building.id === selectedId.value) ?? null,
)
const filteredBuildings = computed(() => {
  const query = buildingKeyword.value.trim().toLowerCase()
  return query
    ? buildings.value.filter((item) => item.name.toLowerCase().includes(query))
    : buildings.value
})
const count = (rooms: PropertyRoom[], status: PropertyRoomStatus) =>
  rooms.filter((room) => room.status === status).length
const rented = computed(() => count(allRooms.value, 'rented'))
const vacant = computed(() => count(allRooms.value, 'vacant'))
const currentRented = computed(() => (current.value ? count(current.value.rooms, 'rented') : 0))
const rate = (building: LandlordProperty) =>
  building.rooms.length
    ? Math.round((count(building.rooms, 'rented') / building.rooms.length) * 100)
    : 0
const filteredRooms = computed(() => {
  if (!current.value) return []
  const query = keyword.value.trim().toLowerCase()
  return current.value.rooms.filter(
    (room) =>
      (statusFilter.value === 'all' || room.status === statusFilter.value) &&
      (!query ||
        room.number.toLowerCase().includes(query) ||
        (room.tenant ?? '').toLowerCase().includes(query)),
  )
})
const tabs = computed(() => {
  const rooms = current.value?.rooms ?? []
  return [
    { value: 'all' as const, label: `全部 ${rooms.length}` },
    { value: 'rented' as const, label: `已出租 ${count(rooms, 'rented')}` },
    { value: 'vacant' as const, label: `空房 ${count(rooms, 'vacant')}` },
    { value: 'maintenance' as const, label: `維修 ${count(rooms, 'maintenance')}` },
  ]
})
const statusMeta: Record<PropertyRoomStatus, { label: string; cls: string }> = {
  rented: { label: '已出租', cls: 'bg-[#e8f4e9] text-[#4f7958] border-[#cde2d0]' },
  vacant: { label: '空房', cls: 'bg-[#fff3df] text-[#a46d22] border-[#efd6ae]' },
  maintenance: { label: '維修中', cls: 'bg-[#fbe9e5] text-[#a65e50] border-[#eccbc4]' },
}
const money = (amount: number | null) =>
  amount === null ? '尚未設定' : `NT$${amount.toLocaleString('zh-TW')}`
const displayDate = (value: string | null) => value?.replaceAll('-', '/') ?? '—'

async function loadProperties(preferredId?: number) {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchProperties()
    buildings.value = result.items
    const nextId = preferredId ?? selectedId.value
    selectedId.value = buildings.value.some((item) => item.id === nextId)
      ? nextId
      : (buildings.value[0]?.id ?? null)
  } catch (cause) {
    buildings.value = []
    selectedId.value = null
    error.value = cause instanceof Error ? cause.message : '房務資料讀取失敗。'
  } finally {
    loading.value = false
  }
}

function selectBuilding(id: number) {
  selectedId.value = id
  keyword.value = ''
  statusFilter.value = 'all'
}

function openCreateBuilding() {
  editingBuildingId.value = null
  buildingForm.value = { name: '', address: '', city: '臺北市' }
  error.value = ''
  buildingDialog.value = true
}

function openEditBuilding() {
  if (!current.value) return
  editingBuildingId.value = current.value.id
  buildingForm.value = {
    name: current.value.name,
    address: current.value.address,
    city: current.value.city || '臺北市',
  }
  error.value = ''
  buildingDialog.value = true
}

async function saveBuilding() {
  if (!buildingForm.value.name.trim()) return
  saving.value = true
  error.value = ''
  try {
    const payload = {
      name: buildingForm.value.name.trim(),
      address: buildingForm.value.address.trim(),
      city: buildingForm.value.city.trim(),
    }
    const saved = editingBuildingId.value
      ? await updateProperty(editingBuildingId.value, payload)
      : await createProperty(payload)
    buildingDialog.value = false
    success.value = editingBuildingId.value ? '棟別資料已更新。' : '棟別已建立。'
    await loadProperties(saved.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '棟別儲存失敗。'
  } finally {
    saving.value = false
  }
}

function openRoomDialog() {
  if (!current.value) {
    error.value = '請先建立棟別，再新增房間。'
    return
  }
  roomForm.value = { numbers: '', floor: '', area: '', rent: '' }
  error.value = ''
  roomDialog.value = true
}

async function addRooms() {
  if (!current.value) return
  const numbers = roomForm.value.numbers
    .split(/[\n,，]/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (!numbers.length) return
  saving.value = true
  error.value = ''
  try {
    const saved = await createRooms(current.value.id, {
      numbers,
      floor: roomForm.value.floor ? Number(roomForm.value.floor) : undefined,
      area: roomForm.value.area ? Number(roomForm.value.area) : undefined,
      expected_rent: roomForm.value.rent ? Number(roomForm.value.rent) : undefined,
    })
    roomDialog.value = false
    success.value = `已新增 ${numbers.length} 間房間。`
    await loadProperties(saved.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '房間建立失敗。'
  } finally {
    saving.value = false
  }
}

onMounted(() => loadProperties())
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#68846d]">
          Property workspace
        </p>
        <h1 class="text-3xl font-black tracking-tight sm:text-4xl">房務管理</h1>
        <p class="mt-2 text-sm text-[#778078]">集中管理棟別、房間、出租狀態與租客資訊。</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" @click="openCreateBuilding">
          <Building2 class="h-4 w-4" />新增棟樓
        </button>
        <button class="btn-primary" :disabled="!current" @click="openRoomDialog">
          <Plus class="h-4 w-4" />新增房間
        </button>
      </div>
    </header>

    <div v-if="error" class="notice notice-error" role="alert">
      <AlertCircle class="h-4 w-4" /><span class="flex-1">{{ error }}</span>
      <button class="font-bold" @click="loadProperties()">重新載入</button>
    </div>
    <div v-if="success" class="notice notice-success" role="status">
      <Check class="h-4 w-4" /><span class="flex-1">{{ success }}</span>
      <button aria-label="關閉訊息" @click="success = ''"><X class="h-4 w-4" /></button>
    </div>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="房務統計">
      <article class="metric border-t-[#63856a]">
        <div>
          <p>棟樓總數</p>
          <strong>{{ buildings.length }} <small>棟</small></strong
          ><span>目前管理物件</span>
        </div>
        <i class="bg-[#e6f1e8] text-[#5b8263]"><Building2 /></i>
      </article>
      <article class="metric border-t-[#9c9587]">
        <div>
          <p>房間總數</p>
          <strong>{{ allRooms.length }} <small>間</small></strong
          ><span>全部房源</span>
        </div>
        <i class="bg-[#f1eee7] text-[#81796d]"><Home /></i>
      </article>
      <article class="metric border-t-[#47809a]">
        <div>
          <p>已出租</p>
          <strong>{{ rented }} <small>間</small></strong
          ><span>目前有租客</span>
        </div>
        <i class="bg-[#e4f1f5] text-[#397a91]"><Users /></i>
      </article>
      <article class="metric border-t-[#c88a30]">
        <div>
          <p>空房數</p>
          <strong>{{ vacant }} <small>間</small></strong
          ><span>可安排出租</span>
        </div>
        <i class="bg-[#fff1dc] text-[#b67824]"><Home /></i>
      </article>
      <article class="metric border-t-[#63856a]">
        <div>
          <p>平均出租率</p>
          <strong>{{ allRooms.length ? Math.round((rented / allRooms.length) * 100) : 0 }}%</strong
          ><span>依房間數計算</span>
        </div>
        <i class="bg-[#e6f1e8] text-[#5b8263]"><Check /></i>
      </article>
    </section>

    <section class="grid min-h-[620px] gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="overflow-hidden rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm">
        <div class="border-b border-[#e8e2d6] p-5">
          <h2 class="text-lg font-black">棟樓列表</h2>
          <p class="mt-1 text-xs text-[#7a827c]">切換物件，快速掌握出租狀態。</p>
        </div>
        <div class="p-4">
          <label class="search"
            ><Search /><input
              v-model="buildingKeyword"
              class="field h-11 pl-10"
              placeholder="搜尋棟樓名稱"
          /></label>
          <div v-if="loading" class="grid min-h-52 place-items-center text-sm text-[#7a827c]">
            <RefreshCw class="h-6 w-6 animate-spin" />
          </div>
          <div v-else-if="filteredBuildings.length" class="mt-4 space-y-2.5">
            <button
              v-for="building in filteredBuildings"
              :key="building.id"
              :class="[
                'w-full rounded-2xl border p-3.5 text-left transition-all',
                selectedId === building.id
                  ? 'border-[#c8ddcc] bg-[#edf7ef] shadow-sm'
                  : 'border-[#e6dfd3] hover:bg-[#faf8f2]',
              ]"
              @click="selectBuilding(building.id)"
            >
              <div class="flex items-center gap-3">
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#5b8263] shadow-sm"
                  ><Building2 class="h-4 w-4"
                /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex justify-between gap-2">
                    <p class="truncate font-bold">{{ building.name }}</p>
                    <span class="text-xs font-bold text-[#5b8263]">{{ rate(building) }}%</span>
                  </div>
                  <p class="mt-0.5 text-xs text-[#778078]">
                    {{ building.rooms.length }} 間房 · 已出租
                    {{ count(building.rooms, 'rented') }} 間
                  </p>
                </div>
              </div>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dedacf]">
                <div
                  class="h-full rounded-full bg-[#5b8263]"
                  :style="{ width: `${rate(building)}%` }"
                />
              </div>
            </button>
          </div>
          <div v-else class="py-12 text-center text-sm text-[#7a827c]">
            <Building2 class="mx-auto h-8 w-8" />
            <p class="mt-3 font-bold">{{ buildings.length ? '找不到棟別' : '尚未建立棟別' }}</p>
            <button
              v-if="!buildings.length"
              class="mt-3 font-bold text-[#55775d]"
              @click="openCreateBuilding"
            >
              建立第一棟
            </button>
          </div>
        </div>
      </aside>

      <div v-if="current" class="min-w-0 space-y-4">
        <article class="rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 p-5 shadow-sm">
          <div class="flex flex-col gap-4 lg:flex-row lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-xl font-black">{{ current.name }}</h2>
                <span class="rounded-full bg-[#e9f4ea] px-2.5 py-1 text-xs font-bold text-[#55795d]"
                  >出租率 {{ rate(current) }}%</span
                >
              </div>
              <p class="mt-1 text-sm text-[#7a827c]">
                {{ current.city || '未設定城市' }} · {{ current.address || '尚未設定地址' }}
              </p>
            </div>
            <div class="flex gap-2">
              <button class="btn-primary !px-3.5 !py-2" @click="openRoomDialog">
                <Plus class="h-4 w-4" />新增房間</button
              ><button class="btn-secondary !px-3.5 !py-2" @click="openEditBuilding">
                <Pencil class="h-4 w-4" />編輯資訊
              </button>
            </div>
          </div>
          <div
            class="mt-5 grid grid-cols-3 gap-3 border-t border-[#ece6dc] pt-4 text-sm sm:flex sm:gap-8"
          >
            <p>
              <strong class="block text-lg">{{ current.rooms.length }}</strong
              ><span class="text-[#7a827c]">房間</span>
            </p>
            <p>
              <strong class="block text-lg text-[#527a5b]">{{ currentRented }}</strong
              ><span class="text-[#7a827c]">已出租</span>
            </p>
            <p>
              <strong class="block text-lg text-[#af7527]">{{
                count(current.rooms, 'vacant')
              }}</strong
              ><span class="text-[#7a827c]">空房</span>
            </p>
          </div>
        </article>

        <article
          class="overflow-hidden rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm"
        >
          <div
            class="flex flex-col gap-3 border-b border-[#e8e2d6] p-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="flex gap-1 overflow-x-auto rounded-xl bg-[#f2efe7] p-1">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                :class="[
                  'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold',
                  statusFilter === tab.value
                    ? 'bg-white text-[#4f7758] shadow-sm'
                    : 'text-[#7a827c]',
                ]"
                @click="statusFilter = tab.value"
              >
                {{ tab.label }}
              </button>
            </div>
            <label class="search min-w-0 flex-1 sm:w-56 sm:flex-none"
              ><Search /><input
                v-model="keyword"
                class="field h-10 pl-9"
                placeholder="搜尋房號或租客"
            /></label>
          </div>
          <div v-if="filteredRooms.length" class="overflow-x-auto">
            <table class="w-full min-w-[760px] text-left text-sm">
              <thead class="bg-[#fbfaf6] text-xs text-[#747d76]">
                <tr>
                  <th>房號</th>
                  <th>狀態</th>
                  <th>租客</th>
                  <th>月租</th>
                  <th>合約到期</th>
                  <th>坪數</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#ebe5da]">
                <tr v-for="room in filteredRooms" :key="room.id" class="hover:bg-[#fafbf7]">
                  <td class="font-black">{{ room.number }}</td>
                  <td>
                    <span
                      :class="[
                        'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                        statusMeta[room.status].cls,
                      ]"
                      >{{ statusMeta[room.status].label }}</span
                    >
                  </td>
                  <td>
                    <p class="font-semibold">{{ room.tenant ?? '—' }}</p>
                    <span class="text-xs text-[#8a918c]">{{
                      room.status === 'rented' ? '聯絡資料已建立' : '尚無租客'
                    }}</span>
                  </td>
                  <td class="font-semibold">{{ money(room.rent) }}</td>
                  <td>{{ displayDate(room.lease_end) }}</td>
                  <td>{{ room.area ? `${room.area} 坪` : '—' }}</td>
                  <td>
                    <div class="flex justify-end">
                      <button
                        class="icon-btn"
                        :aria-label="`查看 ${room.number}`"
                        @click="roomDetail = room"
                      >
                        <Eye />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="grid min-h-56 place-items-center p-8 text-center">
            <div>
              <Search class="mx-auto h-8 w-8 text-[#9ca49e]" />
              <p class="mt-3 font-bold">
                {{ current.rooms.length ? '找不到符合條件的房間' : '尚未建立房間' }}
              </p>
              <p class="mt-1 text-sm text-[#7a827c]">
                {{
                  current.rooms.length
                    ? '試著清除關鍵字或切換狀態。'
                    : '建立房間後即可在新增租客時選取。'
                }}
              </p>
              <button v-if="!current.rooms.length" class="btn-primary mt-4" @click="openRoomDialog">
                <Plus class="h-4 w-4" />新增房間
              </button>
            </div>
          </div>
        </article>
      </div>
      <div
        v-else
        class="grid min-h-[620px] place-items-center rounded-[1.5rem] border border-dashed border-[#dcd5c8] bg-white/60 p-8 text-center"
      >
        <div>
          <Building2 class="mx-auto h-10 w-10 text-[#8d9a90]" />
          <h2 class="mt-4 text-xl font-black">尚未建立棟別</h2>
          <p class="mt-2 text-sm text-[#7a827c]">
            先建立房務資料，租客管理的房間選單就會同步顯示。
          </p>
          <button class="btn-primary mt-5" @click="openCreateBuilding">
            <Building2 class="h-4 w-4" />新增棟樓
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="buildingDialog" class="backdrop" @click.self="buildingDialog = false">
        <section
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="building-dialog-title"
        >
          <header class="dialog-head">
            <h2 id="building-dialog-title">{{ editingBuildingId ? '編輯棟別' : '新增棟樓' }}</h2>
            <button class="icon-btn" aria-label="關閉" @click="buildingDialog = false">
              <X />
            </button>
          </header>
          <form class="space-y-4 p-5" @submit.prevent="saveBuilding">
            <label class="label"
              >棟別名稱<input
                v-model="buildingForm.name"
                required
                maxlength="100"
                class="field mt-2"
                placeholder="例如：松庭公寓"
            /></label>
            <label class="label"
              >地址<input
                v-model="buildingForm.address"
                class="field mt-2"
                placeholder="輸入門牌地址"
            /></label>
            <label class="label"
              >城市<input v-model="buildingForm.city" maxlength="50" class="field mt-2"
            /></label>
            <button class="btn-primary w-full" type="submit" :disabled="saving">
              {{ saving ? '儲存中…' : '儲存棟別' }}
            </button>
          </form>
        </section>
      </div>

      <div v-if="roomDialog && current" class="backdrop" @click.self="roomDialog = false">
        <section
          class="dialog max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-dialog-title"
        >
          <header class="dialog-head">
            <div>
              <h2 id="room-dialog-title">新增房間</h2>
              <p>{{ current.name }}</p>
            </div>
            <button class="icon-btn" aria-label="關閉" @click="roomDialog = false"><X /></button>
          </header>
          <form class="space-y-4 p-5" @submit.prevent="addRooms">
            <div class="grid grid-cols-2 rounded-xl bg-[#f1eee6] p-1">
              <button
                type="button"
                :class="[
                  'rounded-lg py-2 text-sm font-bold',
                  !batchMode ? 'bg-white shadow-sm' : 'text-[#7b827d]',
                ]"
                @click="batchMode = false"
              >
                單筆建立</button
              ><button
                type="button"
                :class="[
                  'rounded-lg py-2 text-sm font-bold',
                  batchMode ? 'bg-white shadow-sm' : 'text-[#7b827d]',
                ]"
                @click="batchMode = true"
              >
                批次建立
              </button>
            </div>
            <label class="label"
              >{{ batchMode ? '多間房號' : '房間名稱'
              }}<textarea
                v-if="batchMode"
                v-model="roomForm.numbers"
                required
                class="field mt-2 min-h-28 resize-y"
                placeholder="每行一間房號，例如：&#10;101&#10;102&#10;103" /><input
                v-else
                v-model="roomForm.numbers"
                required
                class="field mt-2"
                placeholder="例如：2B"
            /></label>
            <div class="grid grid-cols-2 gap-3">
              <label class="label"
                >樓層<input
                  v-model="roomForm.floor"
                  type="number"
                  class="field mt-2"
                  placeholder="例如：2" /></label
              ><label class="label"
                >坪數<input
                  v-model="roomForm.area"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="field mt-2"
                  placeholder="例如：7.8"
              /></label>
            </div>
            <label class="label"
              >預計月租<input
                v-model="roomForm.rent"
                type="number"
                min="0"
                class="field mt-2"
                placeholder="例如：12000"
            /></label>
            <button class="btn-primary w-full" type="submit" :disabled="saving">
              {{ saving ? '建立中…' : '建立房間' }}
            </button>
          </form>
        </section>
      </div>

      <div v-if="roomDetail" class="backdrop" @click.self="roomDetail = null">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="room-detail-title">
          <header class="dialog-head">
            <div>
              <h2 id="room-detail-title">房間 {{ roomDetail.number }}</h2>
              <p>{{ current?.name }}</p>
            </div>
            <button class="icon-btn" aria-label="關閉" @click="roomDetail = null"><X /></button>
          </header>
          <dl class="detail-list">
            <dt>狀態</dt>
            <dd>{{ statusMeta[roomDetail.status].label }}</dd>
            <dt>租客</dt>
            <dd>{{ roomDetail.tenant ?? '尚無租客' }}</dd>
            <dt>預計／目前月租</dt>
            <dd>{{ money(roomDetail.rent) }}</dd>
            <dt>合約到期</dt>
            <dd>{{ displayDate(roomDetail.lease_end) }}</dd>
            <dt>樓層</dt>
            <dd>{{ roomDetail.floor ?? '—' }}</dd>
            <dt>坪數</dt>
            <dd>{{ roomDetail.area ? `${roomDetail.area} 坪` : '—' }}</dd>
          </dl>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.btn-primary,
.btn-secondary {
  @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50;
}
.btn-primary {
  @apply bg-[#5b8263] text-white shadow-[0_9px_22px_rgba(76,112,83,.16)] hover:bg-[#4f7557];
}
.btn-secondary {
  @apply border border-[#dfd9cc] bg-white text-[#29372f] shadow-sm hover:bg-[#f8f6ef];
}
.icon-btn {
  @apply inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e2dcd0] bg-white text-[#667068] hover:bg-[#f4f2eb];
}
.icon-btn :deep(svg) {
  @apply h-4 w-4;
}
.metric {
  @apply flex min-h-28 items-start justify-between rounded-[1.35rem] border border-[#e2ddcf] border-t-[3px] bg-white/90 p-4 shadow-sm;
}
.metric p {
  @apply text-xs font-bold text-[#737d76];
}
.metric strong {
  @apply mt-2 block text-2xl font-black;
}
.metric strong small {
  @apply text-sm;
}
.metric span {
  @apply mt-1 block text-xs text-[#858d87];
}
.metric i {
  @apply grid h-10 w-10 place-items-center rounded-full not-italic;
}
.metric i :deep(svg) {
  @apply h-5 w-5;
}
.field {
  @apply w-full rounded-xl border border-[#ded7ca] bg-[#fffefa] px-3.5 py-3 text-sm outline-none placeholder:text-[#9ba09c] focus:border-[#7a9a80] focus:ring-4 focus:ring-[#dcebdd];
}
.search {
  @apply relative block;
}
.search > svg {
  @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#879087];
}
.label {
  @apply block text-sm font-bold text-[#4d5951];
}
th,
td {
  @apply px-4 py-3.5;
}
.notice {
  @apply flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm;
}
.notice-error {
  @apply border-[#efc8bf] bg-[#fff0ed] text-[#a65347];
}
.notice-success {
  @apply border-[#c9dfcc] bg-[#edf7ef] text-[#4f7758];
}
.backdrop {
  @apply fixed inset-0 z-50 grid place-items-center bg-[#263229]/45 p-4 backdrop-blur-[2px];
}
.dialog {
  @apply w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-[#e1dbce] bg-[#fffdf8] shadow-[0_24px_80px_rgba(35,42,36,.22)];
}
.dialog-head {
  @apply flex items-center justify-between border-b border-[#e5ded2] px-5 py-4;
}
.dialog-head h2 {
  @apply text-lg font-black;
}
.dialog-head p {
  @apply text-xs text-[#7a827c];
}
.detail-list {
  @apply grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 p-5 text-sm;
}
.detail-list dt {
  @apply text-[#7a827c];
}
.detail-list dd {
  @apply font-bold;
}
</style>
