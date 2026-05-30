<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  MoreHorizontal,
  Plus,
  QrCode,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-vue-next'
import paperPlaneImage from '@/src/assets/notes/note-paper-plane.png'
import notesMascotImage from '@/src/assets/notes/note-mascot.png'

type PersonalTag = '租務' | '提醒' | '維護' | '採買'
type RoommateTag = '公共區域' | '清潔' | '帳務' | '採買'
type MainTab = 'personal' | 'roommate'
type PersonalFilter = 'all' | 'today' | 'pending' | 'done'
type RoommateFilter = 'all' | 'today' | 'unassigned' | 'done'
type MemberDialogMode = 'manual' | 'link' | 'qr'
type Accent = 'indigo' | 'emerald' | 'amber' | 'rose'

interface PersonalNote {
  id: string
  title: string
  content: string
  date: string
  time: string
  tag: PersonalTag
  done: boolean
}

interface RoommateMember {
  id: string
  name: string
  role: string
  accent: Accent
}

interface RoommateTask {
  id: string
  title: string
  content: string
  date: string
  time: string
  tag: RoommateTag
  done: boolean
  assigneeId: string
  creatorId: string
}

const route = useRoute()
const router = useRouter()

const browserNow = new Date()
const todayKey = toDateKey(browserNow)
const PERSONAL_STORAGE_KEY = 'rentmate-notes-personal-v3-room-rhythm'
const ROOMMATE_STORAGE_KEY = 'rentmate-notes-roommate-v3-room-rhythm'
const ROOMMATE_MEMBER_STORAGE_KEY = 'rentmate-notes-members-v3-room-rhythm'
const INVITE_TOKEN_STORAGE_KEY = 'rentmate-notes-invite-token-v3-room-rhythm'
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://rentmate.app'
const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六']
const accentRotation: Accent[] = ['indigo', 'emerald', 'amber', 'rose']

const personalFilters: { value: PersonalFilter; label: string; count: () => number }[] = [
  { value: 'all', label: '全部', count: () => personalNotes.value.length },
  { value: 'today', label: '今日', count: () => personalStats.value.today },
  { value: 'pending', label: '待辦', count: () => personalStats.value.pending },
  { value: 'done', label: '已完成', count: () => personalStats.value.done },
]

const roommateFilters: { value: RoommateFilter; label: string; count: () => number }[] = [
  { value: 'all', label: '全部', count: () => roommateTasks.value.length },
  { value: 'today', label: '今日', count: () => roommateStats.value.today },
  { value: 'unassigned', label: '待分配', count: () => roommateStats.value.unassigned },
  { value: 'done', label: '已完成', count: () => roommateStats.value.done },
]

const personalTags: PersonalTag[] = ['租務', '提醒', '維護', '採買']
const roommateTags: RoommateTag[] = ['公共區域', '清潔', '帳務', '採買']

const personalSeed: PersonalNote[] = [
  {
    id: 'p-1',
    title: '冷氣濾網清洗',
    content: '客廳冷氣濾網積塵，影響效率，記得清洗並晾乾。',
    date: todayKey,
    time: '09:30',
    tag: '維護',
    done: false,
  },
  {
    id: 'p-2',
    title: '垃圾車提醒',
    content: '社區垃圾車明天早上 08:30，記得提早拿下樓。',
    date: shiftDate(todayKey, 1),
    time: '08:30',
    tag: '提醒',
    done: false,
  },
  {
    id: 'p-3',
    title: '六月房租轉帳',
    content: '記得在 6/1 前完成房租轉帳，避免逾期。',
    date: shiftDate(todayKey, 4),
    time: '10:00',
    tag: '租務',
    done: false,
  },
  {
    id: 'p-4',
    title: '採買清潔用品',
    content: '補充洗衣精、衛生紙、垃圾袋。',
    date: shiftDate(todayKey, 4),
    time: '15:00',
    tag: '採買',
    done: false,
  },
  {
    id: 'p-5',
    title: '租約到期日確認',
    content: '已確認租約到期日為 09:30。',
    date: shiftDate(todayKey, -7),
    time: '09:30',
    tag: '租務',
    done: true,
  },
]

const roommateMemberSeed: RoommateMember[] = [
  { id: 'm-1', name: '你', role: '房務統整', accent: 'indigo' },
  { id: 'm-2', name: '小安', role: '採買與清潔', accent: 'emerald' },
  { id: 'm-3', name: '阿哲', role: '帳務分攤', accent: 'amber' },
]

const roommateTaskSeed: RoommateTask[] = [
  {
    id: 'r-1',
    title: '公共區域拖地',
    content: '客廳、廚房、玄關都要處理。',
    date: todayKey,
    time: '18:00',
    tag: '清潔',
    done: false,
    assigneeId: 'm-2',
    creatorId: 'm-1',
  },
  {
    id: 'r-2',
    title: '補牛奶與衛生紙',
    content: '牛奶 x2、衛生紙 x1，買回來放玄關櫃。',
    date: shiftDate(todayKey, 1),
    time: '19:30',
    tag: '採買',
    done: false,
    assigneeId: '',
    creatorId: 'm-1',
  },
  {
    id: 'r-3',
    title: '水電費分攤確認',
    content: '四月帳單確認與分攤。',
    date: shiftDate(todayKey, 2),
    time: '21:45',
    tag: '帳務',
    done: false,
    assigneeId: 'm-1',
    creatorId: 'm-1',
  },
  {
    id: 'r-4',
    title: '垃圾日提醒',
    content: '週一晚間記得拿到門口。',
    date: shiftDate(todayKey, -3),
    time: '20:00',
    tag: '公共區域',
    done: true,
    assigneeId: 'm-2',
    creatorId: 'm-2',
  },
]

const activeTab = computed<MainTab>(() =>
  route.path.endsWith('/roommates') ? 'roommate' : 'personal',
)
const personalFilter = ref<PersonalFilter>('all')
const roommateFilter = ref<RoommateFilter>('all')
const selectedDate = ref(todayKey)
const copyStatus = ref('')
const memberActionStatus = ref('')

const personalNotes = ref<PersonalNote[]>(readJson(PERSONAL_STORAGE_KEY, personalSeed))
const roommateMembers = ref<RoommateMember[]>(
  readJson(ROOMMATE_MEMBER_STORAGE_KEY, roommateMemberSeed),
)
const roommateTasks = ref<RoommateTask[]>(readJson(ROOMMATE_STORAGE_KEY, roommateTaskSeed))
const inviteToken = ref<string>(readJson(INVITE_TOKEN_STORAGE_KEY, createInviteToken()))

const showPersonalDialog = ref(false)
const showRoommateTaskDialog = ref(false)
const showMemberDialog = ref(false)
const memberDialogMode = ref<MemberDialogMode>('link')

const personalForm = ref({
  title: '',
  content: '',
  date: todayKey,
  time: '20:00',
  tag: '提醒' as PersonalTag,
})

const roommateTaskForm = ref({
  title: '',
  content: '',
  date: todayKey,
  time: '20:00',
  tag: '公共區域' as RoommateTag,
  assigneeId: roommateMembers.value[0]?.id ?? '',
})

const roommateMemberForm = ref({
  name: '',
  role: '新加入室友',
})

const inviteLink = computed(() => `${currentOrigin}/app/notes/roommates?invite=${inviteToken.value}`)
const qrCodeUrl = computed(
  () =>
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(inviteLink.value)}`,
)

const roommateMemberMap = computed<Record<string, RoommateMember>>(() =>
  Object.fromEntries(roommateMembers.value.map(member => [member.id, member])),
)

const personalStats = computed(() => {
  const total = personalNotes.value.length
  const done = personalNotes.value.filter(note => note.done).length
  return {
    total,
    pending: personalNotes.value.filter(note => !note.done).length,
    today: personalNotes.value.filter(note => note.date === todayKey && !note.done).length,
    done,
    completion: total ? Math.round((done / total) * 100) : 0,
  }
})

const roommateStats = computed(() => {
  const total = roommateTasks.value.length
  const done = roommateTasks.value.filter(task => task.done).length
  return {
    total,
    pending: roommateTasks.value.filter(task => !task.done).length,
    today: roommateTasks.value.filter(task => task.date === todayKey && !task.done).length,
    unassigned: roommateTasks.value.filter(task => !task.done && !task.assigneeId).length,
    done,
    members: roommateMembers.value.length,
    completion: total ? Math.round((done / total) * 100) : 0,
  }
})

const dateIndexDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const key = shiftDate(todayKey, index)
    const date = parseDateOnly(key)
    const count = activeTab.value === 'personal'
      ? personalNotes.value.filter(note => note.date === key).length
      : roommateTasks.value.filter(task => task.date === key).length
    const hasOverdue = activeTab.value === 'personal'
      ? personalNotes.value.some(note => !note.done && note.date === key && key < todayKey)
      : roommateTasks.value.some(task => !task.done && task.date === key && key < todayKey)

    return {
      key,
      dateText: `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
      weekText: key === todayKey ? '今天' : `週${daysOfWeek[date.getDay()]}`,
      count,
      hasOverdue,
      isToday: key === todayKey,
      isSelected: key === selectedDate.value,
    }
  }),
)

const filteredPersonal = computed(() => {
  const notes = personalNotes.value.filter((note) => {
    if (personalFilter.value === 'today') return note.date === todayKey
    if (personalFilter.value === 'pending') return !note.done
    if (personalFilter.value === 'done') return note.done
    return true
  })
  return sortNotes(notes)
})

const filteredRoommate = computed(() => {
  const tasks = roommateTasks.value.filter((task) => {
    if (roommateFilter.value === 'today') return task.date === todayKey
    if (roommateFilter.value === 'unassigned') return !task.done && !task.assigneeId
    if (roommateFilter.value === 'done') return task.done
    return true
  })
  return sortNotes(tasks)
})

const activeStats = computed(() => activeTab.value === 'personal' ? personalStats.value : roommateStats.value)
const activeTitle = computed(() => activeTab.value === 'personal' ? '把今天安排好。' : '一起把生活整理好。')
const activeEyebrow = computed(() => activeTab.value === 'personal' ? 'TODAY IS YOURS.' : 'LIVE TOGETHER.')
const activeSubtitle = computed(() => activeTab.value === 'personal' ? '記下生活大小事，讓租屋日常更有節奏。' : '共同分工、互相提醒，讓共居生活更輕鬆。')
const nextEvent = computed(() => {
  const source = activeTab.value === 'personal'
    ? sortNotes(personalNotes.value.filter(note => !note.done))
    : sortNotes(roommateTasks.value.filter(task => !task.done))
  return source[0]
})

watch(personalNotes, value => writeJson(PERSONAL_STORAGE_KEY, value), { deep: true })
watch(roommateTasks, value => writeJson(ROOMMATE_STORAGE_KEY, value), { deep: true })
watch(roommateMembers, value => writeJson(ROOMMATE_MEMBER_STORAGE_KEY, value), { deep: true })
watch(inviteToken, value => writeJson(INVITE_TOKEN_STORAGE_KEY, value))
watch(
  roommateMembers,
  (members) => {
    if (roommateTaskForm.value.assigneeId && !members.some(member => member.id === roommateTaskForm.value.assigneeId)) {
      roommateTaskForm.value.assigneeId = members[0]?.id ?? ''
    }
  },
  { deep: true },
)

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return cloneValue(fallback)
  const raw = window.localStorage.getItem(key)
  if (!raw) return cloneValue(fallback)
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.removeItem(key)
    return cloneValue(fallback)
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function createInviteToken(): string {
  return createId('invite').replaceAll('-', '').slice(0, 18)
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(base: string, diff: number): string {
  const next = parseDateOnly(base)
  next.setDate(next.getDate() + diff)
  return toDateKey(next)
}

function sortNotes<T extends { date: string; time: string; done?: boolean }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1
    return `${left.date}T${left.time || '23:59'}`.localeCompare(`${right.date}T${right.time || '23:59'}`)
  })
}

function formatMonthDay(date: string): string {
  const value = parseDateOnly(date)
  return `${String(value.getMonth() + 1).padStart(2, '0')}.${String(value.getDate()).padStart(2, '0')}`
}

function formatWeekday(date: string): string {
  return `週${daysOfWeek[parseDateOnly(date).getDay()]}`
}

function formatNoteDate(date: string, time: string): string {
  const label = formatMonthDay(date)
  const weekday = formatWeekday(date)
  return time ? `${label}（${weekday}） ${time}` : `${label}（${weekday}）`
}

function formatTopDate(): string {
  const date = parseDateOnly(todayKey)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year} / ${month} / ${day}（週${daysOfWeek[date.getDay()]}）`
}

function isOverdue(date: string, done: boolean): boolean {
  return !done && date < todayKey
}

function noteTagClass(tag: PersonalTag | RoommateTag, done = false): string {
  if (done) return 'border-[#d6d6d6] bg-[#e9e9e9] text-[#737789]'
  const map: Record<PersonalTag | RoommateTag, string> = {
    租務: 'border-[#e4d28c] bg-[#f2e9c8] text-[#8a6919]',
    提醒: 'border-[#cdd8ff] bg-[#eaf0ff] text-[#4e6baf]',
    維護: 'border-[#cfc7ff] bg-[#eeeafe] text-[#4845a5]',
    採買: 'border-[#cbe4c6] bg-[#e4f1df] text-[#4f7b45]',
    公共區域: 'border-[#cfc7ff] bg-[#eeeafe] text-[#4845a5]',
    清潔: 'border-[#cfc7ff] bg-[#eeeafe] text-[#4845a5]',
    帳務: 'border-[#e4d28c] bg-[#f2e9c8] text-[#8a6919]',
  }
  return map[tag]
}

function memberAccentClass(accent: Accent): string {
  const map: Record<Accent, string> = {
    indigo: 'bg-[#eeeafe] text-[#4845a5]',
    emerald: 'bg-[#e4f1df] text-[#4f7b45]',
    amber: 'bg-[#f2e9c8] text-[#8a6919]',
    rose: 'bg-[#f6dfe1] text-[#b54854]',
  }
  return map[accent]
}

function memberInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}

function selectDate(date: string): void {
  selectedDate.value = date
}

function openPersonalDialogFor(date = selectedDate.value): void {
  personalForm.value.date = date
  showPersonalDialog.value = true
}

function openRoommateDialogFor(date = selectedDate.value): void {
  roommateTaskForm.value.date = date
  showRoommateTaskDialog.value = true
}

function openMemberDialog(mode: MemberDialogMode = 'link'): void {
  memberDialogMode.value = mode
  showMemberDialog.value = true
}

function switchTab(tab: MainTab): void {
  void router.push(tab === 'roommate' ? '/app/notes/roommates' : '/app/notes')
}

function resetPersonalForm(): void {
  personalForm.value = {
    title: '',
    content: '',
    date: selectedDate.value,
    time: '20:00',
    tag: '提醒',
  }
}

function resetRoommateTaskForm(): void {
  roommateTaskForm.value = {
    title: '',
    content: '',
    date: selectedDate.value,
    time: '20:00',
    tag: '公共區域',
    assigneeId: roommateMembers.value[0]?.id ?? '',
  }
}

function resetRoommateMemberForm(): void {
  roommateMemberForm.value = {
    name: '',
    role: '新加入室友',
  }
}

function savePersonalNote(): void {
  if (!personalForm.value.title.trim()) return
  personalNotes.value.push({
    id: createId('personal'),
    title: personalForm.value.title.trim(),
    content: personalForm.value.content.trim(),
    date: personalForm.value.date,
    time: personalForm.value.time,
    tag: personalForm.value.tag,
    done: false,
  })
  selectedDate.value = personalForm.value.date
  showPersonalDialog.value = false
  resetPersonalForm()
}

function saveRoommateTask(): void {
  if (!roommateTaskForm.value.title.trim()) return
  roommateTasks.value.push({
    id: createId('roommate'),
    title: roommateTaskForm.value.title.trim(),
    content: roommateTaskForm.value.content.trim(),
    date: roommateTaskForm.value.date,
    time: roommateTaskForm.value.time,
    tag: roommateTaskForm.value.tag,
    done: false,
    assigneeId: roommateTaskForm.value.assigneeId,
    creatorId: roommateMembers.value[0]?.id ?? '',
  })
  selectedDate.value = roommateTaskForm.value.date
  showRoommateTaskDialog.value = false
  resetRoommateTaskForm()
}

function saveRoommateMember(): void {
  if (!roommateMemberForm.value.name.trim()) return
  roommateMembers.value.push({
    id: createId('member'),
    name: roommateMemberForm.value.name.trim(),
    role: roommateMemberForm.value.role.trim() || '室友',
    accent: accentRotation[roommateMembers.value.length % accentRotation.length],
  })
  memberActionStatus.value = `已新增 ${roommateMemberForm.value.name.trim()} 到協作區`
  showMemberDialog.value = false
  resetRoommateMemberForm()
}

function togglePersonalDone(id: string): void {
  const note = personalNotes.value.find(item => item.id === id)
  if (note) note.done = !note.done
}

function toggleRoommateDone(id: string): void {
  const task = roommateTasks.value.find(item => item.id === id)
  if (task) task.done = !task.done
}

function removePersonalNote(id: string): void {
  personalNotes.value = personalNotes.value.filter(note => note.id !== id)
}

function removeRoommateTask(id: string): void {
  roommateTasks.value = roommateTasks.value.filter(task => task.id !== id)
}

function removeRoommateMember(id: string): void {
  if (roommateMembers.value.length <= 1) {
    memberActionStatus.value = '至少保留一位室友成員，協作區才有可指派對象。'
    return
  }

  const fallbackMember = roommateMembers.value.find(member => member.id !== id)
  if (!fallbackMember) return

  roommateTasks.value = roommateTasks.value.map(task => ({
    ...task,
    assigneeId: task.assigneeId === id ? fallbackMember.id : task.assigneeId,
    creatorId: task.creatorId === id ? fallbackMember.id : task.creatorId,
  }))

  const removedMember = roommateMembers.value.find(member => member.id === id)
  roommateMembers.value = roommateMembers.value.filter(member => member.id !== id)
  memberActionStatus.value = removedMember
    ? `已移除 ${removedMember.name}，未完成任務已改派給 ${fallbackMember.name}`
    : '已更新協作成員'
}

function regenerateInviteToken(): void {
  inviteToken.value = createInviteToken()
  copyStatus.value = '已重新產生邀請連結與 QR Code'
}

async function copyInviteLink(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteLink.value)
      copyStatus.value = '邀請連結已複製'
      return
    }
  } catch {
    // fallback below
  }
  copyStatus.value = '目前瀏覽器不支援自動複製，請直接複製下方連結。'
}

async function shareInviteLink(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: 'RentMate 室友協作邀請',
        text: '加入我們的 RentMate 協作記事板',
        url: inviteLink.value,
      })
      copyStatus.value = '分享視窗已開啟'
      return
    }
  } catch {
    copyStatus.value = '分享已取消'
    return
  }
  await copyInviteLink()
}
</script>

<template>
  <div class="room-rhythm-page">
    <header class="topbar">
      <div class="mode-switch" aria-label="記事模式切換">
        <button
          :class="['mode-button', { active: activeTab === 'personal' }]"
          @click="switchTab('personal')"
        >
          個人記事
          <span>{{ personalStats.pending }}</span>
        </button>
        <button
          :class="['mode-button', { active: activeTab === 'roommate' }]"
          @click="switchTab('roommate')"
        >
          室友協作
          <span>{{ roommateStats.pending }}</span>
        </button>
      </div>

      <div class="topbar-meta">
        <CalendarDays class="h-4 w-4" />
        <span>{{ formatTopDate() }}</span>
        <Bell class="ml-3 h-5 w-5" />
      </div>
    </header>

    <section class="hero-panel">
      <div class="hero-copy">
        <p class="hero-eyebrow">{{ activeEyebrow }}</p>
        <h1>{{ activeTitle }}</h1>
        <p>{{ activeSubtitle }}</p>
      </div>

      <img class="paper-plane" :src="paperPlaneImage" alt="紙飛機與虛線飛行軌跡" />

      <div class="rhythm-summary" aria-label="今日節奏摘要">
        <div class="summary-item">
          <span class="summary-label">{{ activeTab === 'personal' ? '今日事項' : '共同任務' }}</span>
          <strong>{{ String(activeTab === 'personal' ? personalStats.today : roommateStats.pending).padStart(2, '0') }}</strong>
          <small>{{ activeTab === 'personal' ? 'TO DO' : 'TASKS' }}</small>
        </div>
        <div class="summary-divider" />
        <div class="summary-item completion">
          <span class="summary-label">{{ activeTab === 'personal' ? '本月完成度' : '本週完成度' }}</span>
          <div class="progress-ring" :style="{ '--progress': `${activeStats.completion}%` }">
            <span>{{ activeStats.completion }}%</span>
          </div>
          <small>{{ activeStats.done }} / {{ activeStats.total }} 則完成</small>
        </div>
      </div>
    </section>

    <main class="content-grid">
      <aside class="date-index-panel">
        <div class="panel-heading">
          <h2>DATE INDEX</h2>
          <CalendarDays class="h-5 w-5" />
        </div>

        <div class="date-list">
          <button
            v-for="day in dateIndexDays"
            :key="day.key"
            :class="['date-row', { active: day.isSelected, today: day.isToday }]"
            @click="selectDate(day.key)"
          >
            <span class="date-main">{{ day.dateText }}</span>
            <span class="date-week">{{ day.weekText }}</span>
            <span
              :class="[
                'date-dot',
                day.hasOverdue ? 'overdue' : day.count ? 'has-note' : 'empty',
                day.isToday ? 'is-today' : '',
              ]"
            />
          </button>
        </div>

        <Button variant="outline" class="calendar-button" @click="selectDate(todayKey)">
          <CalendarDays class="h-4 w-4" />
          回到今天
        </Button>
      </aside>

      <section class="notes-board">
        <div class="board-header">
          <div>
            <p class="board-kicker">{{ activeTab === 'personal' ? 'TODAY / 個人記事' : 'ROOM TASKS / 室友協作' }}</p>
            <h2>{{ activeTab === 'personal' ? '個人記事板' : '室友協作板' }}</h2>
          </div>

          <Button
            class="primary-action"
            @click="activeTab === 'personal' ? openPersonalDialogFor() : openRoommateDialogFor()"
          >
            <Plus class="h-4 w-4" />
            {{ activeTab === 'personal' ? '新增記事' : '新增任務' }}
          </Button>
        </div>

        <div class="filter-row">
          <template v-if="activeTab === 'personal'">
            <button
              v-for="option in personalFilters"
              :key="option.value"
              :class="['filter-pill', { active: personalFilter === option.value }]"
              @click="personalFilter = option.value"
            >
              {{ option.label }}
              <span>{{ option.count() }}</span>
            </button>
          </template>
          <template v-else>
            <button
              v-for="option in roommateFilters"
              :key="option.value"
              :class="['filter-pill', { active: roommateFilter === option.value }]"
              @click="roommateFilter = option.value"
            >
              {{ option.label }}
              <span>{{ option.count() }}</span>
            </button>
          </template>
        </div>

        <div class="list-heading" :class="{ roommate: activeTab === 'roommate' }">
          <span>編號</span>
          <span>類別</span>
          <span>事項</span>
          <span v-if="activeTab === 'roommate'">指派室友</span>
          <span>時間</span>
          <span />
        </div>

        <div v-if="activeTab === 'personal'" class="note-list">
          <article
            v-for="(note, index) in filteredPersonal"
            :key="note.id"
            :class="['note-row', { done: note.done, overdue: isOverdue(note.date, note.done) }]"
          >
            <div class="note-number">{{ String(index + 1).padStart(2, '0') }}</div>
            <Badge variant="outline" :class="['note-tag', noteTagClass(note.tag, note.done)]">{{ note.tag }}</Badge>
            <div class="note-main">
              <h3>{{ note.title }}</h3>
              <p>{{ note.content || '尚未填寫補充說明' }}</p>
            </div>
            <div class="note-time">
              <Clock3 class="h-4 w-4" />
              <span>{{ formatNoteDate(note.date, note.time) }}</span>
            </div>
            <div class="note-actions">
              <button :aria-label="note.done ? '標示為待辦' : '標示為完成'" @click="togglePersonalDone(note.id)">
                <CheckCircle2 class="h-5 w-5" />
              </button>
              <button aria-label="刪除記事" @click="removePersonalNote(note.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </article>

          <div v-if="filteredPersonal.length === 0" class="empty-state">
            目前沒有符合篩選條件的個人記事。
          </div>
        </div>

        <div v-else class="note-list">
          <article
            v-for="(task, index) in filteredRoommate"
            :key="task.id"
            :class="['note-row roommate-row', { done: task.done, overdue: isOverdue(task.date, task.done) }]"
          >
            <div class="note-number">{{ String(index + 1).padStart(2, '0') }}</div>
            <Badge variant="outline" :class="['note-tag', noteTagClass(task.tag, task.done)]">{{ task.tag }}</Badge>
            <div class="note-main">
              <h3>{{ task.title }}</h3>
              <p>{{ task.content || '尚未填寫補充說明' }}</p>
            </div>
            <div class="assignee-cell">
              <template v-if="roommateMemberMap[task.assigneeId]">
                <span :class="['avatar-chip', memberAccentClass(roommateMemberMap[task.assigneeId].accent)]">
                  {{ memberInitial(roommateMemberMap[task.assigneeId].name) }}
                </span>
                <span>{{ roommateMemberMap[task.assigneeId].name }}</span>
              </template>
              <template v-else>
                <span class="avatar-chip empty">?</span>
                <span class="text-[#b17910]">待分配</span>
              </template>
            </div>
            <div class="note-time">
              <Clock3 class="h-4 w-4" />
              <span>{{ formatNoteDate(task.date, task.time) }}</span>
            </div>
            <div class="note-actions">
              <button :aria-label="task.done ? '標示為待辦' : '標示為完成'" @click="toggleRoommateDone(task.id)">
                <CheckCircle2 class="h-5 w-5" />
              </button>
              <button aria-label="刪除任務" @click="removeRoommateTask(task.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </article>

          <div v-if="filteredRoommate.length === 0" class="empty-state">
            目前沒有符合條件的室友協作任務。
          </div>
        </div>

        <button class="show-completed" @click="activeTab === 'personal' ? (personalFilter = 'done') : (roommateFilter = 'done')">
          <Sparkles class="h-4 w-4" />
          {{ activeTab === 'personal' ? '顯示已完成記事' : '顯示已完成任務' }}
        </button>
      </section>

      <aside class="life-panel">
        <section class="weekly-card">
          <div class="panel-heading compact">
            <h2>本週總覽</h2>
            <span>05.25 - 05.31</span>
          </div>
          <div class="weekly-stats">
            <div>
              <CheckCircle2 class="h-5 w-5" />
              <span>待辦</span>
              <strong>{{ activeTab === 'personal' ? personalStats.pending : roommateStats.pending }}</strong>
            </div>
            <div>
              <Bell class="h-5 w-5" />
              <span>{{ activeTab === 'personal' ? '提醒' : '待分配' }}</span>
              <strong>{{ activeTab === 'personal' ? personalStats.today : roommateStats.unassigned }}</strong>
            </div>
            <div>
              <CheckCircle2 class="h-5 w-5" />
              <span>完成</span>
              <strong>{{ activeTab === 'personal' ? personalStats.done : roommateStats.done }}</strong>
            </div>
          </div>
        </section>

        <section class="next-card">
          <div class="section-title">
            <h2>下一個事件</h2>
            <button>更多</button>
          </div>
          <div v-if="nextEvent" class="next-event-card">
            <CalendarDays class="h-6 w-6" />
            <div>
              <h3>{{ nextEvent.title }}</h3>
              <p>{{ formatNoteDate(nextEvent.date, nextEvent.time) }}</p>
            </div>
          </div>
          <div v-else class="empty-mini">目前沒有待處理事件。</div>
        </section>

        <section v-if="activeTab === 'roommate'" class="members-card">
          <div class="section-title">
            <h2>室友成員</h2>
            <button @click="openMemberDialog('link')">邀請</button>
          </div>
          <div class="member-list">
            <div v-for="member in roommateMembers" :key="member.id" class="member-row">
              <span :class="['avatar-chip', memberAccentClass(member.accent)]">{{ memberInitial(member.name) }}</span>
              <div>
                <strong>{{ member.name }}</strong>
                <p>{{ member.role }}</p>
              </div>
              <button aria-label="移除室友" @click="removeRoommateMember(member.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
          <p v-if="memberActionStatus" class="member-status">{{ memberActionStatus }}</p>
        </section>

        <img class="mascot" :src="notesMascotImage" alt="坐在懶骨頭上寫記事的 RentMate 插畫人物" />
      </aside>
    </main>

    <Dialog v-model:open="showPersonalDialog">
      <DialogContent class="max-w-lg rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">新增個人記事</DialogTitle>
          <DialogDescription>新增日常提醒、租務或生活待辦。</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="savePersonalNote">
          <div class="space-y-2">
            <Label>標題</Label>
            <Input v-model="personalForm.title" placeholder="例如：繳交六月房租" class="rounded-xl" />
          </div>
          <div class="space-y-2">
            <Label>補充內容</Label>
            <Textarea v-model="personalForm.content" placeholder="補充細節或提醒事項" class="min-h-[92px] rounded-xl" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2"><Label>日期</Label><Input v-model="personalForm.date" type="date" class="rounded-xl" /></div>
            <div class="space-y-2"><Label>時間</Label><Input v-model="personalForm.time" type="time" class="rounded-xl" /></div>
          </div>
          <div class="space-y-2">
            <Label>類別</Label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tag in personalTags"
                :key="tag"
                type="button"
                :class="['rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', personalForm.tag === tag ? noteTagClass(tag) : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300']"
                @click="personalForm.tag = tag"
              >
                {{ tag }}
              </button>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="showPersonalDialog = false; resetPersonalForm()">取消</Button>
            <Button type="submit" class="flex-1 rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">儲存記事</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showRoommateTaskDialog">
      <DialogContent class="max-w-lg rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">新增共同任務</DialogTitle>
          <DialogDescription>建立任務並指派給室友，大家都能清楚知道該做什麼。</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="saveRoommateTask">
          <div class="space-y-2"><Label>任務名稱</Label><Input v-model="roommateTaskForm.title" placeholder="例如：分攤水電費" class="rounded-xl" /></div>
          <div class="space-y-2"><Label>補充內容</Label><Textarea v-model="roommateTaskForm.content" placeholder="填寫任務說明或備註" class="min-h-[92px] rounded-xl" /></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2"><Label>日期</Label><Input v-model="roommateTaskForm.date" type="date" class="rounded-xl" /></div>
            <div class="space-y-2"><Label>時間</Label><Input v-model="roommateTaskForm.time" type="time" class="rounded-xl" /></div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>類別</Label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="tag in roommateTags"
                  :key="tag"
                  type="button"
                  :class="['rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', roommateTaskForm.tag === tag ? noteTagClass(tag) : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300']"
                  @click="roommateTaskForm.tag = tag"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>指派對象</Label>
              <select v-model="roommateTaskForm.assigneeId" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#4845A5]">
                <option value="">尚未指派</option>
                <option v-for="member in roommateMembers" :key="member.id" :value="member.id">{{ member.name }} · {{ member.role }}</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="showRoommateTaskDialog = false; resetRoommateTaskForm()">取消</Button>
            <Button type="submit" class="flex-1 rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">建立任務</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showMemberDialog">
      <DialogContent class="max-w-xl rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">邀請室友加入協作區</DialogTitle>
          <DialogDescription>室友加入後，即可共同查看與完成分工任務。</DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-1.5">
            <button :class="['dialog-tab', { active: memberDialogMode === 'link' }]" @click="memberDialogMode = 'link'">
              <Link2 class="h-4 w-4" />分享連結
            </button>
            <button :class="['dialog-tab', { active: memberDialogMode === 'qr' }]" @click="memberDialogMode = 'qr'">
              <QrCode class="h-4 w-4" />QR Code
            </button>
            <button :class="['dialog-tab', { active: memberDialogMode === 'manual' }]" @click="memberDialogMode = 'manual'">
              <UserPlus class="h-4 w-4" />手動新增
            </button>
          </div>

          <div v-if="memberDialogMode === 'link'" class="invite-box">
            <p class="text-sm font-semibold text-[#111322]">分享邀請連結</p>
            <p class="mt-1 text-sm text-[#737789]">複製後傳送給室友，對方開啟連結即可加入。</p>
            <div class="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <Link2 class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p class="break-all text-xs leading-5 text-[#737789]">{{ inviteLink }}</p>
            </div>
            <div class="mt-3 flex gap-2">
              <Button class="flex-1 rounded-full bg-[#4845A5] hover:bg-[#3c398f]" @click="copyInviteLink"><Copy class="h-4 w-4" />複製連結</Button>
              <Button variant="outline" class="flex-1 rounded-full" @click="shareInviteLink"><Share2 class="h-4 w-4" />分享</Button>
            </div>
          </div>

          <div v-else-if="memberDialogMode === 'qr'" class="invite-box text-center">
            <p class="text-sm font-semibold text-[#111322]">掃描 QR Code 加入</p>
            <p class="mt-1 text-sm text-[#737789]">適合面對面邀請室友快速加入。</p>
            <img :src="qrCodeUrl" alt="室友邀請 QR Code" class="mx-auto mt-3 h-52 w-52 rounded-2xl border border-white bg-white p-2 shadow-sm" />
            <div class="mt-3 flex gap-2">
              <Button class="flex-1 rounded-full bg-[#4845A5] hover:bg-[#3c398f]" @click="shareInviteLink"><Share2 class="h-4 w-4" />分享</Button>
              <Button variant="outline" class="flex-1 rounded-full" @click="copyInviteLink"><Copy class="h-4 w-4" />複製連結</Button>
            </div>
          </div>

          <form v-else class="invite-box space-y-4" @submit.prevent="saveRoommateMember">
            <p class="text-sm text-[#737789]">手動建立僅供暫時記錄分工，不會傳送加入邀請給對方。</p>
            <div class="space-y-2"><Label>姓名 / 稱呼</Label><Input v-model="roommateMemberForm.name" placeholder="例如：小芸" class="rounded-xl bg-white" /></div>
            <div class="space-y-2"><Label>角色說明</Label><Input v-model="roommateMemberForm.role" placeholder="例如：採買與備品" class="rounded-xl bg-white" /></div>
            <Button type="submit" class="w-full rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">建立暫存成員</Button>
          </form>

          <p v-if="copyStatus" class="text-center text-xs text-[#737789]">{{ copyStatus }}</p>
          <div class="flex gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="regenerateInviteToken">
              重新產生邀請碼
            </Button>
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="showMemberDialog = false">關閉</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.room-rhythm-page {
  min-height: 100%;
  padding: 24px clamp(18px, 3vw, 42px) 36px;
  color: #111322;
  background:
    radial-gradient(circle at 8% 0%, rgba(238, 234, 254, 0.9), transparent 28%),
    linear-gradient(180deg, #f7f6f1 0%, #fbfaf7 100%);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 48px;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border: 1px solid rgba(27, 29, 40, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
}

.mode-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  color: #737789;
  font-size: 14px;
  font-weight: 800;
  transition: all 0.18s ease;
}

.mode-button span {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: rgba(17, 19, 34, 0.06);
  font-size: 12px;
}

.mode-button.active {
  color: white;
  background: #4845a5;
  box-shadow: 0 8px 20px rgba(72, 69, 165, 0.2);
}

.mode-button.active span {
  background: rgba(255, 255, 255, 0.2);
}

.topbar-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #111322;
  font-size: 14px;
  font-weight: 700;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(330px, 0.95fr) minmax(190px, 0.45fr) minmax(360px, 0.8fr);
  align-items: center;
  gap: 22px;
  margin-top: 24px;
  padding: 30px 34px 26px;
  border-bottom: 1px solid rgba(27, 29, 40, 0.22);
  background: rgba(255, 255, 255, 0.2);
}

.hero-eyebrow {
  color: #4845a5;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.hero-copy h1 {
  margin-top: 8px;
  color: #05050a;
  font-size: clamp(40px, 4.6vw, 58px);
  font-weight: 950;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.hero-copy p:last-child {
  margin-top: 16px;
  color: #111322;
  font-size: 16px;
  font-weight: 500;
}

.paper-plane {
  width: min(100%, 270px);
  justify-self: center;
  opacity: 0.96;
}

.rhythm-summary {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 22px;
}

.summary-divider {
  width: 1px;
  height: 96px;
  background: rgba(27, 29, 40, 0.36);
}

.summary-item {
  min-width: 0;
}

.summary-label {
  display: block;
  color: #111322;
  font-size: 14px;
  font-weight: 800;
}

.summary-item strong {
  display: inline-block;
  margin-top: 8px;
  color: #05050a;
  font-size: 52px;
  font-weight: 950;
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.summary-item small {
  margin-left: 8px;
  color: #111322;
  font-size: 13px;
  font-weight: 800;
}

.completion {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 14px;
  align-items: center;
}

.completion .summary-label,
.completion small {
  grid-column: 2;
  margin-left: 0;
}

.progress-ring {
  grid-row: 1 / span 2;
  width: 72px;
  height: 72px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle closest-side, #f7f6f1 72%, transparent 73%),
    conic-gradient(#6d58e8 var(--progress), rgba(72, 69, 165, 0.12) 0);
}

.progress-ring span {
  color: #111322;
  font-size: 18px;
  font-weight: 900;
}

.content-grid {
  display: grid;
  grid-template-columns: 230px minmax(520px, 1fr) 330px;
  gap: 22px;
  margin-top: 22px;
}

.date-index-panel,
.notes-board,
.life-panel > section {
  border: 1px solid rgba(27, 29, 40, 0.16);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.52);
}

.date-index-panel {
  padding: 22px 20px;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-heading h2,
.section-title h2 {
  color: #111322;
  font-size: 16px;
  font-weight: 950;
  letter-spacing: 0.01em;
}

.panel-heading.compact span {
  border: 1px solid rgba(27, 29, 40, 0.12);
  border-radius: 999px;
  padding: 6px 12px;
  color: #737789;
  font-size: 12px;
  font-weight: 800;
}

.date-list {
  margin-top: 26px;
}

.date-row {
  position: relative;
  display: grid;
  grid-template-columns: 74px 1fr 12px;
  align-items: center;
  width: 100%;
  min-height: 55px;
  border-bottom: 1px dotted rgba(27, 29, 40, 0.28);
  color: #111322;
  text-align: left;
}

.date-row::before {
  content: '';
  position: absolute;
  left: -20px;
  width: 4px;
  height: 28px;
  border-radius: 999px;
  background: transparent;
}

.date-row.active::before {
  background: #6d58e8;
}

.date-main {
  font-size: 17px;
  font-weight: 900;
}

.date-week {
  color: #737789;
  font-size: 13px;
  font-weight: 700;
}

.date-row.today .date-week {
  justify-self: start;
  border: 1px solid rgba(72, 69, 165, 0.32);
  border-radius: 999px;
  padding: 3px 8px;
  background: #eeeafe;
  color: #4845a5;
  font-size: 12px;
}

.date-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.date-dot.has-note {
  background: #6d58e8;
}

.date-dot.is-today {
  background: #f1bd32;
}

.date-dot.overdue {
  background: #b54854;
}

.date-dot.empty {
  background: rgba(17, 19, 34, 0.16);
}

.calendar-button {
  width: 100%;
  margin-top: 28px;
  border-radius: 14px;
  border-color: rgba(27, 29, 40, 0.35);
  color: #111322;
  font-weight: 800;
}

.notes-board {
  min-width: 0;
  padding: 22px 26px 20px;
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.board-kicker {
  color: #111322;
  font-size: 15px;
  font-weight: 900;
}

.board-header h2 {
  margin-top: 4px;
  color: #111322;
  font-size: 24px;
  font-weight: 950;
}

.primary-action {
  min-width: 128px;
  border-radius: 999px;
  background: #4845a5;
  font-weight: 900;
  box-shadow: 0 8px 20px rgba(72, 69, 165, 0.22);
}

.primary-action:hover {
  background: #3c398f;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(27, 29, 40, 0.22);
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 15px;
  border-radius: 999px;
  background: rgba(17, 19, 34, 0.06);
  color: #111322;
  font-size: 14px;
  font-weight: 850;
}

.filter-pill span {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  font-size: 12px;
}

.filter-pill.active {
  background: #4845a5;
  color: white;
}

.list-heading {
  display: grid;
  grid-template-columns: 60px 86px minmax(190px, 1fr) 150px 64px;
  gap: 16px;
  align-items: center;
  padding: 16px 0 10px;
  color: #737789;
  font-size: 12px;
  font-weight: 850;
}

.list-heading.roommate {
  grid-template-columns: 60px 86px minmax(190px, 1fr) 128px 150px 64px;
}

.note-list {
  min-height: 370px;
}

.note-row {
  display: grid;
  grid-template-columns: 60px 86px minmax(190px, 1fr) 150px 64px;
  gap: 16px;
  align-items: center;
  min-height: 90px;
  border-top: 1px solid rgba(27, 29, 40, 0.24);
}

.note-row.roommate-row {
  grid-template-columns: 60px 86px minmax(190px, 1fr) 128px 150px 64px;
}

.note-row.done {
  opacity: 0.62;
}

.note-row.overdue {
  background: linear-gradient(90deg, rgba(246, 223, 225, 0.45), transparent 28%);
}

.note-number {
  color: #05050a;
  font-size: 29px;
  font-weight: 950;
  line-height: 1;
}

.note-tag {
  width: fit-content;
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 13px;
  font-weight: 900;
}

.note-main {
  min-width: 0;
}

.note-main h3 {
  overflow: hidden;
  color: #111322;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  font-weight: 950;
}

.note-main p {
  margin-top: 5px;
  overflow: hidden;
  color: #737789;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.note-row.done .note-main h3,
.note-row.done .note-main p {
  text-decoration: line-through;
}

.note-time {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #111322;
  font-size: 13px;
  font-weight: 750;
}

.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.note-actions button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 999px;
  color: #737789;
  transition: all 0.18s ease;
}

.note-actions button:hover {
  background: #eeeafe;
  color: #4845a5;
}

.assignee-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #111322;
  font-size: 13px;
  font-weight: 800;
}

.avatar-chip {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 950;
}

.avatar-chip.empty {
  background: #f2e9c8;
  color: #9a741a;
}

.show-completed {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 18px auto 0;
  color: #4845a5;
  font-size: 13px;
  font-weight: 900;
}

.empty-state,
.empty-mini {
  border: 1px dashed rgba(27, 29, 40, 0.22);
  border-radius: 18px;
  padding: 34px 18px;
  color: #737789;
  text-align: center;
  font-size: 14px;
  font-weight: 650;
}

.life-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 18px;
}

.weekly-card,
.next-card,
.members-card {
  padding: 22px 20px;
}

.weekly-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  margin-top: 24px;
  padding-top: 8px;
}

.weekly-stats div {
  display: grid;
  place-items: center;
  gap: 5px;
  border-right: 1px solid rgba(27, 29, 40, 0.18);
  color: #4845a5;
}

.weekly-stats div:last-child {
  border-right: 0;
}

.weekly-stats span {
  color: #111322;
  font-size: 13px;
  font-weight: 800;
}

.weekly-stats strong {
  color: #111322;
  font-size: 30px;
  font-weight: 950;
  line-height: 1;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title button {
  color: #4845a5;
  font-size: 13px;
  font-weight: 900;
}

.next-event-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  border: 1px solid rgba(72, 69, 165, 0.18);
  border-radius: 14px;
  background: #eeeafe;
  padding: 16px 14px;
  color: #4845a5;
}

.next-event-card h3 {
  color: #111322;
  font-size: 15px;
  font-weight: 950;
}

.next-event-card p {
  margin-top: 3px;
  color: #111322;
  font-size: 13px;
  font-weight: 650;
}

.member-list {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.member-row {
  display: grid;
  grid-template-columns: 30px 1fr 28px;
  align-items: center;
  gap: 10px;
}

.member-row strong {
  color: #111322;
  font-size: 14px;
  font-weight: 900;
}

.member-row p,
.member-status {
  color: #737789;
  font-size: 12px;
  font-weight: 600;
}

.member-row button {
  color: #a1a1aa;
}

.mascot {
  width: min(100%, 320px);
  align-self: center;
  margin-top: auto;
  opacity: 0.96;
}

.dialog-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  padding: 10px 12px;
  color: #737789;
  font-size: 13px;
  font-weight: 850;
}

.dialog-tab.active {
  background: white;
  color: #4845a5;
  box-shadow: 0 6px 16px rgba(17, 19, 34, 0.06);
}

.invite-box {
  border: 1px solid rgba(27, 29, 40, 0.12);
  border-radius: 18px;
  background: rgba(247, 246, 241, 0.6);
  padding: 16px;
}

@media (max-width: 1280px) {
  .hero-panel {
    grid-template-columns: 1fr 220px;
  }

  .rhythm-summary {
    grid-column: 1 / -1;
    max-width: 620px;
  }

  .content-grid {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .life-panel {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) 260px;
    align-items: start;
  }
}

@media (max-width: 960px) {
  .hero-panel,
  .content-grid,
  .life-panel {
    grid-template-columns: 1fr;
  }

  .paper-plane {
    display: none;
  }

  .rhythm-summary {
    max-width: none;
  }

  .date-index-panel {
    overflow-x: auto;
  }

  .date-list {
    display: flex;
    gap: 10px;
  }

  .date-row {
    min-width: 118px;
    grid-template-columns: 1fr auto;
    border: 1px solid rgba(27, 29, 40, 0.14);
    border-radius: 16px;
    padding: 12px;
  }

  .date-row::before,
  .date-week {
    display: none;
  }

  .list-heading {
    display: none;
  }

  .note-row,
  .note-row.roommate-row {
    grid-template-columns: 42px 1fr 48px;
    gap: 12px;
    padding: 14px 0;
  }

  .note-tag,
  .note-time,
  .assignee-cell {
    grid-column: 2;
  }
}

@media (max-width: 640px) {
  .room-rhythm-page {
    padding: 16px 12px 28px;
  }

  .topbar,
  .board-header,
  .rhythm-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-panel {
    padding: 24px 18px;
  }

  .hero-copy h1 {
    font-size: 40px;
  }

  .summary-divider {
    display: none;
  }

  .summary-item strong {
    font-size: 42px;
  }

  .notes-board,
  .date-index-panel,
  .weekly-card,
  .next-card,
  .members-card {
    padding: 18px;
  }

  .note-number {
    font-size: 24px;
  }
}
</style>
