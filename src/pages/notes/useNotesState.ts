import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

export type MainTab = 'personal' | 'roommate'
type PersonalTag = '租務' | '提醒' | '維護' | '採買'
type RoommateTag = '公共區域' | '清潔' | '帳務' | '採買'
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

const PERSONAL_STORAGE_KEY = 'rentmate-notes-personal-v3-room-rhythm'
const ROOMMATE_STORAGE_KEY = 'rentmate-notes-roommate-v3-room-rhythm'
const ROOMMATE_MEMBER_STORAGE_KEY = 'rentmate-notes-members-v3-room-rhythm'
const INVITE_TOKEN_STORAGE_KEY = 'rentmate-notes-invite-token-v3-room-rhythm'
const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六']
const accentRotation: Accent[] = ['indigo', 'emerald', 'amber', 'rose']

export function useNotesState(mode: MainTab) {
  const router = useRouter()
  const browserNow = new Date()
  const todayKey = toDateKey(browserNow)
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://rentmate.app'

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

  const activeTab = computed<MainTab>(() => mode)
  const personalFilter = ref<PersonalFilter>('all')
  const roommateFilter = ref<RoommateFilter>('all')
  const selectedDate = ref(todayKey)
  const miniCalendarMonth = ref(startOfMonth(todayKey))
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
  const editingRoommateTaskId = ref<string | null>(null)

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
  const activeTitle = computed(() => activeTab.value === 'personal' ? '把今天安排好' : '一起把生活整理好')
  const activeEyebrow = computed(() => activeTab.value === 'personal' ? 'TODAY IS YOURS.' : 'LIVE TOGETHER.')
  const activeSubtitle = computed(() => activeTab.value === 'personal' ? '記下生活大小事，讓租屋日常更有節奏。' : '共同分工、互相提醒，讓共居生活更輕鬆。')
  const nextEvent = computed(() => {
    const source = activeTab.value === 'personal'
      ? sortNotes(personalNotes.value.filter(note => !note.done))
      : sortNotes(roommateTasks.value.filter(task => !task.done))
    return source[0]
  })
  const isEditingRoommateTask = computed(() => editingRoommateTaskId.value !== null)
  const roommateTaskDialogTitle = computed(() => isEditingRoommateTask.value ? '編輯共同任務' : '新增共同任務')
  const roommateTaskDialogDescription = computed(() =>
    isEditingRoommateTask.value
      ? '調整任務內容、時間或指派對象，協作板會立即同步更新。'
      : '建立任務並指派給室友，大家都能清楚知道該做什麼。',
  )
  const roommateTaskSubmitLabel = computed(() => isEditingRoommateTask.value ? '儲存變更' : '建立任務')
  const weekRangeLabel = computed(() => {
    const selected = parseDateOnly(todayKey)
    const weekday = selected.getDay() || 7
    const start = new Date(selected)
    start.setDate(selected.getDate() - weekday + 1)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return `${formatMonthDay(toDateKey(start))} - ${formatMonthDay(toDateKey(end))}`
  })
  const miniCalendarLabel = computed(() => {
    const month = parseDateOnly(miniCalendarMonth.value)
    return `${month.getFullYear()} 年 ${String(month.getMonth() + 1).padStart(2, '0')} 月`
  })
  const miniCalendarDays = computed(() => {
    const sourceMonth = parseDateOnly(miniCalendarMonth.value)
    const monthIndex = sourceMonth.getMonth()
    const gridStart = new Date(sourceMonth)
    gridStart.setDate(1 - sourceMonth.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(gridStart)
      current.setDate(gridStart.getDate() + index)
      const key = toDateKey(current)
      const count = activeTab.value === 'personal'
        ? personalNotes.value.filter(note => note.date === key).length
        : roommateTasks.value.filter(task => task.date === key).length

      return {
        key,
        label: current.getDate(),
        isCurrentMonth: current.getMonth() === monthIndex,
        isToday: key === todayKey,
        isSelected: key === selectedDate.value,
        hasItems: count > 0,
      }
    })
  })
  const weeklyHighlights = computed(() => ({
    pending: activeTab.value === 'personal' ? personalStats.value.pending : roommateStats.value.pending,
    today: activeTab.value === 'personal' ? personalStats.value.today : roommateStats.value.today,
    done: activeTab.value === 'personal' ? personalStats.value.done : roommateStats.value.done,
  }))

  watch(personalNotes, value => writeJson(PERSONAL_STORAGE_KEY, value), { deep: true })
  watch(roommateTasks, value => writeJson(ROOMMATE_STORAGE_KEY, value), { deep: true })
  watch(roommateMembers, value => writeJson(ROOMMATE_MEMBER_STORAGE_KEY, value), { deep: true })
  watch(inviteToken, value => writeJson(INVITE_TOKEN_STORAGE_KEY, value))
  watch(selectedDate, (value) => {
    const monthKey = startOfMonth(value)
    if (monthKey !== miniCalendarMonth.value) {
      miniCalendarMonth.value = monthKey
    }
  })
  watch(
    roommateMembers,
    (members) => {
      if (roommateTaskForm.value.assigneeId && !members.some(member => member.id === roommateTaskForm.value.assigneeId)) {
        roommateTaskForm.value.assigneeId = members[0]?.id ?? ''
      }
    },
    { deep: true },
  )

  function selectDate(date: string): void {
    selectedDate.value = date
  }

  function changeMiniCalendarMonth(diff: number): void {
    miniCalendarMonth.value = shiftMonth(miniCalendarMonth.value, diff)
  }

  function openPersonalDialogFor(date = selectedDate.value): void {
    personalForm.value.date = date
    showPersonalDialog.value = true
  }

  function openRoommateDialogFor(date = selectedDate.value): void {
    resetRoommateTaskForm(date)
    showRoommateTaskDialog.value = true
  }

  function editRoommateTask(task: RoommateTask): void {
    editingRoommateTaskId.value = task.id
    roommateTaskForm.value = {
      title: task.title,
      content: task.content,
      date: task.date,
      time: task.time,
      tag: task.tag,
      assigneeId: task.assigneeId,
    }
    showRoommateTaskDialog.value = true
  }

  function openMemberDialog(modeValue: MemberDialogMode = 'link'): void {
    memberDialogMode.value = modeValue
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

  function resetRoommateTaskForm(date = selectedDate.value): void {
    editingRoommateTaskId.value = null
    roommateTaskForm.value = {
      title: '',
      content: '',
      date,
      time: '20:00',
      tag: '公共區域',
      assigneeId: roommateMembers.value[0]?.id ?? '',
    }
  }

  function closeRoommateTaskDialog(): void {
    showRoommateTaskDialog.value = false
    resetRoommateTaskForm()
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

    const payload = {
      title: roommateTaskForm.value.title.trim(),
      content: roommateTaskForm.value.content.trim(),
      date: roommateTaskForm.value.date,
      time: roommateTaskForm.value.time,
      tag: roommateTaskForm.value.tag,
      assigneeId: roommateTaskForm.value.assigneeId,
    }

    if (editingRoommateTaskId.value) {
      roommateTasks.value = roommateTasks.value.map(task =>
        task.id === editingRoommateTaskId.value
          ? {
              ...task,
              ...payload,
            }
          : task,
      )
    } else {
      roommateTasks.value.push({
        id: createId('roommate'),
        ...payload,
        done: false,
        creatorId: roommateMembers.value[0]?.id ?? '',
      })
    }

    selectedDate.value = roommateTaskForm.value.date
    closeRoommateTaskDialog()
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
    if (editingRoommateTaskId.value === id) {
      closeRoommateTaskDialog()
    }
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

  return {
    activeTab,
    personalFilters,
    roommateFilters,
    personalTags,
    roommateTags,
    personalFilter,
    roommateFilter,
    selectedDate,
    copyStatus,
    memberActionStatus,
    personalNotes,
    roommateMembers,
    roommateTasks,
    showPersonalDialog,
    showRoommateTaskDialog,
    showMemberDialog,
    memberDialogMode,
    personalForm,
    roommateTaskForm,
    roommateMemberForm,
    inviteLink,
    qrCodeUrl,
    roommateMemberMap,
    personalStats,
    roommateStats,
    dateIndexDays,
    filteredPersonal,
    filteredRoommate,
    activeStats,
    activeTitle,
    activeEyebrow,
    activeSubtitle,
    nextEvent,
    roommateTaskDialogTitle,
    roommateTaskDialogDescription,
    roommateTaskSubmitLabel,
    weekRangeLabel,
    miniCalendarLabel,
    miniCalendarDays,
    weeklyHighlights,
    todayKey,
    formatTopDate,
    formatNoteDate,
    isOverdue,
    noteTagClass,
    memberAccentClass,
    memberInitial,
    selectDate,
    changeMiniCalendarMonth,
    openPersonalDialogFor,
    openRoommateDialogFor,
    editRoommateTask,
    openMemberDialog,
    switchTab,
    resetPersonalForm,
    closeRoommateTaskDialog,
    savePersonalNote,
    saveRoommateTask,
    saveRoommateMember,
    togglePersonalDone,
    toggleRoommateDone,
    removePersonalNote,
    removeRoommateTask,
    removeRoommateMember,
    regenerateInviteToken,
    copyInviteLink,
    shareInviteLink,
  }
}

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

function startOfMonth(base: string): string {
  const current = parseDateOnly(base)
  current.setDate(1)
  return toDateKey(current)
}

function shiftMonth(base: string, diff: number): string {
  const current = parseDateOnly(base)
  current.setDate(1)
  current.setMonth(current.getMonth() + diff)
  return toDateKey(current)
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
  const date = parseDateOnly(toDateKey(new Date()))
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year} / ${month} / ${day}（週${daysOfWeek[date.getDay()]}）`
}

function isOverdue(date: string, done: boolean): boolean {
  return !done && date < toDateKey(new Date())
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
