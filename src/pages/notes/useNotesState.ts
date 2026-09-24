import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createPersonalNote, deletePersonalNote, listPersonalNotes, updatePersonalNote, listHouseholds, createHousehold, joinHousehold, notesRequest, groupPath, type Household } from '@/src/services/notesApi'

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

const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六']

export function useNotesState(mode: MainTab) {
  const router = useRouter()
  const route = useRoute()
  const browserNow = new Date()
  const todayKey = toDateKey(browserNow)
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://rentmate.app'

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

  const personalNotes = ref<PersonalNote[]>([])
  const roommateMembers = ref<RoommateMember[]>([])
  const roommateTasks = ref<RoommateTask[]>([])
  const groups = ref<Household[]>([])
  const householdId = ref('')
  const activeGroup = computed(() => groups.value.find(group => group.id === householdId.value))
  const inviteToken = computed(() => activeGroup.value?.inviteCode || '')
  const isOwner = computed(() => activeGroup.value?.isOwner ?? false)
  const pendingInvite = computed(() => typeof route.query.invite === 'string' ? route.query.invite : '')
  const syncError = ref('')
  const isLoading = ref(false)
  const isSaving = ref(false)
  const hasLegacyNotes = ref(false)

  function exportLegacyNotes(): void {
    if (typeof window === 'undefined') return
    const backup = Object.fromEntries([
      'rentmate-notes-personal-v3-room-rhythm', 'rentmate-notes-roommate-v3-room-rhythm',
      'rentmate-notes-members-v3-room-rhythm', 'rentmate-notes-invite-token-v3-room-rhythm',
    ].map(key => [key, window.localStorage.getItem(key)]))
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'rentmate-legacy-notes.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function perform(action: () => Promise<void>): Promise<void> {
    if (isSaving.value || isLoading.value) return
    isSaving.value = true
    syncError.value = ''
    try { await action() } catch (error) {
      syncError.value = error instanceof Error ? error.message : '記事同步失敗，請重試。'
    } finally { isSaving.value = false }
  }

  async function loadGroup(): Promise<void> {
    if (!householdId.value) {
      roommateMembers.value = []
      roommateTasks.value = []
      return
    }
    const path = groupPath(householdId.value)
    const [members, tasks] = await Promise.all([
      notesRequest<RoommateMember[]>(`${path}/members`),
      notesRequest<RoommateTask[]>(`${path}/tasks`),
    ])
    roommateMembers.value = members
    roommateTasks.value = tasks
  }

  async function reloadNotes(): Promise<void> {
    if (isLoading.value || isSaving.value) return
    isLoading.value = true
    syncError.value = ''
    try {
      const [notes, households] = await Promise.all([listPersonalNotes(), listHouseholds()])
      personalNotes.value = notes as PersonalNote[]
      groups.value = households
      if (!households.some(group => group.id === householdId.value)) householdId.value = households[0]?.id || ''
      await loadGroup()
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : '記事載入失敗，請重試。'
    } finally { isLoading.value = false }
  }

  async function ensureGroup(): Promise<string> {
    if (!householdId.value) {
      const group = await createHousehold()
      groups.value.push(group)
      householdId.value = group.id
      await loadGroup()
    }
    return groupPath(householdId.value)
  }

  async function acceptInvite(): Promise<void> {
    await perform(async () => {
      const group = await joinHousehold(pendingInvite.value)
      if (!groups.value.some(item => item.id === group.id)) groups.value.push(group)
      householdId.value = group.id
      await loadGroup()
      const query = { ...route.query }
      delete query.invite
      await router.replace({ query })
      memberActionStatus.value = '已加入室友協作空間'
    })
  }

  async function selectGroup(id: string): Promise<void> {
    await perform(async () => {
      const previous = householdId.value
      householdId.value = id
      try { await loadGroup() } catch (error) { householdId.value = previous; throw error }
    })
  }

  onMounted(async () => {
    if (typeof window !== 'undefined') {
      hasLegacyNotes.value = Boolean(window.localStorage.getItem('rentmate-notes-personal-v3-room-rhythm') || window.localStorage.getItem('rentmate-notes-roommate-v3-room-rhythm'))
    }
    await reloadNotes()
  })

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
    email: '',
    role: '新加入室友',
  })

  const inviteLink = computed(() => inviteToken.value ? `${currentOrigin}/app/notes/roommates?invite=${inviteToken.value}` : '')
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

  async function openMemberDialog(modeValue: MemberDialogMode = 'link'): Promise<void> {
    await perform(async () => {
      await ensureGroup()
      memberDialogMode.value = modeValue
      showMemberDialog.value = true
    })
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
      email: '',
      role: '新加入室友',
    }
  }

  async function savePersonalNote(): Promise<void> {
    if (!personalForm.value.title.trim()) return
    await perform(async () => {
      const note = await createPersonalNote({ ...personalForm.value })
      personalNotes.value.push(note as PersonalNote)
      selectedDate.value = personalForm.value.date
      showPersonalDialog.value = false
      resetPersonalForm()
    })
  }

  async function saveRoommateTask(): Promise<void> {
    if (!roommateTaskForm.value.title.trim()) return
    await perform(async () => {
      const path = await ensureGroup()
      const id = editingRoommateTaskId.value
      const task = await notesRequest<RoommateTask>(
        `${path}/tasks${id ? `/${encodeURIComponent(id)}` : ''}`,
        id ? 'PATCH' : 'POST', { ...roommateTaskForm.value },
      )
      if (id) roommateTasks.value = roommateTasks.value.map(item => item.id === id ? task : item)
      else roommateTasks.value.push(task)
      selectedDate.value = roommateTaskForm.value.date
      closeRoommateTaskDialog()
    })
  }

  async function saveRoommateMember(): Promise<void> {
    if (!roommateMemberForm.value.name.trim() || !roommateMemberForm.value.email.trim()) return
    await perform(async () => {
      const path = await ensureGroup()
      const member = await notesRequest<RoommateMember>(`${path}/members`, 'POST', { ...roommateMemberForm.value })
      roommateMembers.value.push(member)
      memberActionStatus.value = `已加入 ${member.name}，室友可登入帳號查看協作任務。`
      showMemberDialog.value = false
      resetRoommateMemberForm()
    })
  }

  async function togglePersonalDone(id: string): Promise<void> {
    const note = personalNotes.value.find(item => item.id === id)
    if (!note) return
    await perform(async () => { Object.assign(note, await updatePersonalNote(id, { done: !note.done })) })
  }

  async function toggleRoommateDone(id: string): Promise<void> {
    const task = roommateTasks.value.find(item => item.id === id)
    if (!task) return
    await perform(async () => {
      Object.assign(task, await notesRequest<RoommateTask>(`${groupPath(householdId.value)}/tasks/${encodeURIComponent(id)}`, 'PATCH', { done: !task.done }))
    })
  }

  async function removePersonalNote(id: string): Promise<void> {
    await perform(async () => {
      await deletePersonalNote(id)
      personalNotes.value = personalNotes.value.filter(note => note.id !== id)
    })
  }

  async function removeRoommateTask(id: string): Promise<void> {
    await perform(async () => {
      await notesRequest(`${groupPath(householdId.value)}/tasks/${encodeURIComponent(id)}`, 'DELETE')
      roommateTasks.value = roommateTasks.value.filter(task => task.id !== id)
      if (editingRoommateTaskId.value === id) closeRoommateTaskDialog()
    })
  }

  async function removeRoommateMember(id: string): Promise<void> {
    await perform(async () => {
      await notesRequest(`${groupPath(householdId.value)}/members/${encodeURIComponent(id)}`, 'DELETE')
      await loadGroup()
      memberActionStatus.value = '已移除成員，相關任務改為未指派。'
    })
  }

  async function regenerateInviteToken(): Promise<void> {
    await perform(async () => {
      const group = await notesRequest<Household>(`${await ensureGroup()}/invite`, 'POST')
      groups.value = groups.value.map(item => item.id === group.id ? group : item)
      copyStatus.value = '已更新邀請連結，舊連結不再有效'
    })
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
    syncError, isLoading, isSaving, reloadNotes, groups, householdId, selectGroup, pendingInvite, acceptInvite, isOwner, hasLegacyNotes, exportLegacyNotes,
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
