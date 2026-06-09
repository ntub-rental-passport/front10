<script setup lang="ts">
import { reactive } from 'vue'
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
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import paperPlaneImage from '@/src/assets/notes/note-paper-plane.png'
import notesMascotImage from '@/src/assets/notes/note-mascot.png'
import { useNotesState } from './useNotesState'

const notes = reactive(useNotesState('personal'))
</script>

<template>
  <div class="room-rhythm-page">
    <header class="topbar">
      <div class="mode-switch" aria-label="記事模式切換">
        <button
          :class="['mode-button', { active: notes.activeTab === 'personal' }]"
          @click="notes.switchTab('personal')"
        >
          個人記事
          <span>{{ notes.personalStats.pending }}</span>
        </button>
        <button
          :class="['mode-button', { active: notes.activeTab === 'roommate' }]"
          @click="notes.switchTab('roommate')"
        >
          室友協作
          <span>{{ notes.roommateStats.pending }}</span>
        </button>
      </div>

      <div class="topbar-meta">
        <CalendarDays class="h-4 w-4" />
        <span>{{ notes.formatTopDate() }}</span>
        <Bell class="ml-3 h-5 w-5" />
      </div>
    </header>

    <section class="hero-panel">
      <div class="hero-copy">
        <p class="hero-eyebrow">{{ notes.activeEyebrow }}</p>
        <h1>{{ notes.activeTitle }}</h1>
        <p>{{ notes.activeSubtitle }}</p>
      </div>

      <img class="paper-plane" :src="paperPlaneImage" alt="紙飛機與虛線飛行軌跡" />

      <div class="rhythm-summary" aria-label="今日節奏摘要">
        <div class="summary-item">
          <span class="summary-label">今日事項</span>
          <strong>{{ String(notes.personalStats.today).padStart(2, '0') }}</strong>
          <small>TO DO</small>
        </div>
        <div class="summary-divider" />
        <div class="summary-item completion">
          <span class="summary-label">本月完成度</span>
          <div class="progress-ring" :style="{ '--progress': `${notes.activeStats.completion}%` }">
            <span>{{ notes.activeStats.completion }}%</span>
          </div>
          <small>{{ notes.activeStats.done }} / {{ notes.activeStats.total }} 則完成</small>
        </div>
      </div>
    </section>

    <main class="content-grid content-grid-personal">
      <section class="focus-board">
        <aside class="date-index-panel merged-panel">
          <div class="panel-heading">
            <h2>DATE INDEX</h2>
            <CalendarDays class="h-5 w-5" />
          </div>

          <div class="date-list">
            <button
              v-for="day in notes.dateIndexDays"
              :key="day.key"
              :class="['date-row', { active: day.isSelected, today: day.isToday }]"
              @click="notes.selectDate(day.key)"
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

          <div class="mini-calendar">
            <div class="mini-calendar-header">
              <button type="button" class="mini-month-button" @click="notes.changeMiniCalendarMonth(-1)">
                <ChevronLeft class="h-4 w-4" />
              </button>
              <strong>{{ notes.miniCalendarLabel }}</strong>
              <button type="button" class="mini-month-button" @click="notes.changeMiniCalendarMonth(1)">
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>

            <div class="mini-calendar-weekdays">
              <span v-for="weekday in ['日', '一', '二', '三', '四', '五', '六']" :key="weekday">{{ weekday }}</span>
            </div>

            <div class="mini-calendar-grid">
              <button
                v-for="day in notes.miniCalendarDays"
                :key="day.key"
                type="button"
                :class="[
                  'mini-calendar-day',
                  {
                    muted: !day.isCurrentMonth,
                    today: day.isToday,
                    selected: day.isSelected,
                    marked: day.hasItems,
                  },
                ]"
                @click="notes.selectDate(day.key)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>

          <Button variant="outline" class="calendar-button" @click="notes.selectDate(notes.todayKey)">
            <CalendarDays class="h-4 w-4" />
            回到今天
          </Button>
        </aside>

        <section class="notes-board merged-panel">
          <div class="board-header">
            <div>
              <p class="board-kicker">TODAY / 個人記事</p>
              <h2>個人記事板</h2>
            </div>

            <Button class="primary-action" @click="notes.openPersonalDialogFor()">
              <Plus class="h-4 w-4" />
              新增記事
            </Button>
          </div>

          <div class="filter-row">
            <button
              v-for="option in notes.personalFilters"
              :key="option.value"
              :class="['filter-pill', { active: notes.personalFilter === option.value }]"
              @click="notes.personalFilter = option.value"
            >
              {{ option.label }}
              <span>{{ option.count() }}</span>
            </button>
          </div>

          <div class="list-heading">
            <span>編號</span>
            <span>類別</span>
            <span>事項</span>
            <span>時間</span>
            <span />
          </div>

          <div class="note-list">
            <article
              v-for="(note, index) in notes.filteredPersonal"
              :key="note.id"
              :class="['note-row', { done: note.done, overdue: notes.isOverdue(note.date, note.done) }]"
            >
              <div class="note-number">{{ String(index + 1).padStart(2, '0') }}</div>
              <Badge variant="outline" :class="['note-tag', notes.noteTagClass(note.tag, note.done)]">{{ note.tag }}</Badge>
              <div class="note-main">
                <h3>{{ note.title }}</h3>
                <p>{{ note.content || '尚未填寫補充說明' }}</p>
              </div>
              <div class="note-time">
                <Clock3 class="h-4 w-4" />
                <span>{{ notes.formatNoteDate(note.date, note.time) }}</span>
              </div>
              <div class="note-actions">
                <button :aria-label="note.done ? '標示為待辦' : '標示為完成'" @click="notes.togglePersonalDone(note.id)">
                  <CheckCircle2 class="h-5 w-5" />
                </button>
                <button aria-label="刪除記事" @click="notes.removePersonalNote(note.id)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </article>

            <div v-if="notes.filteredPersonal.length === 0" class="empty-state">
              目前沒有符合篩選條件的個人記事。
            </div>
          </div>

          <button class="show-completed" @click="notes.personalFilter = 'done'">
            <Sparkles class="h-4 w-4" />
            顯示已完成記事
          </button>
        </section>
      </section>

      <aside class="life-panel life-panel-personal">
        <section class="weekly-focus-card">
          <div class="weekly-focus-header">
            <h2>THIS WEEK</h2>
            <button type="button" class="weekly-focus-link">
              週檢視
              <ArrowUpRight class="h-4 w-4" />
            </button>
          </div>

          <div class="weekly-focus-stats">
            <div>
              <span>待辦</span>
              <strong>{{ notes.weeklyHighlights.pending }}</strong>
            </div>
            <div>
              <span>今天</span>
              <strong>{{ notes.weeklyHighlights.today }}</strong>
            </div>
            <div>
              <span>完成</span>
              <strong class="text-[#05050a]">{{ notes.weeklyHighlights.done }}</strong>
            </div>
          </div>

          <div class="weekly-focus-divider" />

          <div class="section-title weekly-focus-event-title">
            <h2>NEXT EVENT</h2>
            <button type="button">更多</button>
          </div>
          <div v-if="notes.nextEvent" class="next-event-card compact">
            <CalendarDays class="h-6 w-6" />
            <div class="next-event-copy">
              <h3>{{ notes.nextEvent.title }}</h3>
              <p>{{ notes.formatNoteDate(notes.nextEvent.date, notes.nextEvent.time) }}</p>
            </div>
          </div>
          <div v-else class="empty-mini">目前沒有待處理事件。</div>

          <img class="weekly-focus-mascot" :src="notesMascotImage" alt="坐在懶骨頭上寫記事的 RentMate 插畫人物" />
        </section>
      </aside>
    </main>

    <Dialog v-model:open="notes.showPersonalDialog">
      <DialogContent class="max-w-lg rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">新增個人記事</DialogTitle>
          <DialogDescription>新增日常提醒、租務或生活待辦。</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="notes.savePersonalNote">
          <div class="space-y-2">
            <Label>標題</Label>
            <Input v-model="notes.personalForm.title" placeholder="例如：繳交六月房租" class="rounded-xl" />
          </div>
          <div class="space-y-2">
            <Label>補充內容</Label>
            <Textarea v-model="notes.personalForm.content" placeholder="補充細節或提醒事項" class="min-h-[92px] rounded-xl" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2"><Label>日期</Label><Input v-model="notes.personalForm.date" type="date" class="rounded-xl" /></div>
            <div class="space-y-2"><Label>時間</Label><Input v-model="notes.personalForm.time" type="time" class="rounded-xl" /></div>
          </div>
          <div class="space-y-2">
            <Label>類別</Label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tag in notes.personalTags"
                :key="tag"
                type="button"
                :class="['rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', notes.personalForm.tag === tag ? notes.noteTagClass(tag) : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300']"
                @click="notes.personalForm.tag = tag"
              >
                {{ tag }}
              </button>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="notes.showPersonalDialog = false; notes.resetPersonalForm()">取消</Button>
            <Button type="submit" class="flex-1 rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">儲存記事</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style src="./notes.css"></style>
