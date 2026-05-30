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
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  Pencil,
  Plus,
  QrCode,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-vue-next'
import paperPlaneImage from '@/src/assets/notes/note-paper-plane.png'
import notesMascotImage from '@/src/assets/notes/note-mascot.png'
import { useNotesState } from './useNotesState'

const notes = reactive(useNotesState('roommate'))
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

    <section class="hero-panel roommates-hero">
      <div class="hero-copy roommates-hero-copy">
        <p class="hero-eyebrow">LIVE TOGETHER.</p>
        <h1>室友協作板</h1>
        <p>分享家務與生活事項，讓我們一起維持整潔、有序的生活。</p>
      </div>

      <img class="paper-plane roommates-paper-plane" :src="paperPlaneImage" alt="紙飛機插圖" />

      <div class="roommates-hero-side" aria-label="室友協作摘要">
        <div class="roommates-hero-meta">
          <div class="roommates-hero-stats">
            <div>
              <span>待辦</span>
              <strong>{{ notes.roommateStats.pending }}</strong>
            </div>
            <div>
              <span>待分配</span>
              <strong>{{ notes.roommateStats.unassigned }}</strong>
            </div>
            <div>
              <span>已完成</span>
              <strong>{{ notes.roommateStats.done }}</strong>
            </div>
          </div>
        </div>

        <div class="roommates-hero-actions">
          <Button class="primary-action roommates-hero-button" @click="notes.openRoommateDialogFor()">
            <Plus class="h-4 w-4" />
            新增任務
          </Button>
          <Button variant="outline" class="secondary-action roommates-hero-button" @click="notes.openMemberDialog('manual')">
            <UserPlus class="h-4 w-4" />
            新增室友
          </Button>
        </div>
      </div>
    </section>

    <main class="content-grid roommates-layout">
      <section class="notes-board roommates-board">
        <div class="board-header roommates-header">
          <div class="board-title-block">
            <p class="board-kicker">ROOM TASKS / 室友協作</p>
            <h2>室友協作板</h2>
          </div>
        </div>

        <div class="filter-row">
          <button
            v-for="option in notes.roommateFilters"
            :key="option.value"
            :class="['filter-pill', { active: notes.roommateFilter === option.value }]"
            @click="notes.roommateFilter = option.value"
          >
            {{ option.label }}
            <span>{{ option.count() }}</span>
          </button>
        </div>

        <div class="list-heading roommate">
          <span>編號</span>
          <span>類別</span>
          <span>事項</span>
          <span>指派室友</span>
          <span>時間</span>
          <span />
        </div>

        <div class="note-list">
          <article
            v-for="(task, index) in notes.filteredRoommate"
            :key="task.id"
            :class="['note-row roommate-row', { done: task.done, overdue: notes.isOverdue(task.date, task.done) }]"
          >
            <div class="note-number">{{ String(index + 1).padStart(2, '0') }}</div>
            <Badge variant="outline" :class="['note-tag', notes.noteTagClass(task.tag, task.done)]">
              {{ task.tag }}
            </Badge>
            <div class="note-main">
              <h3>{{ task.title }}</h3>
              <p>{{ task.content || '補上任務說明，室友更容易快速理解。' }}</p>
            </div>
            <div class="assignee-cell">
              <template v-if="notes.roommateMemberMap[task.assigneeId]">
                <span :class="['avatar-chip', notes.memberAccentClass(notes.roommateMemberMap[task.assigneeId].accent)]">
                  {{ notes.memberInitial(notes.roommateMemberMap[task.assigneeId].name) }}
                </span>
                <span class="assignee-name">{{ notes.roommateMemberMap[task.assigneeId].name }}</span>
              </template>
              <template v-else>
                <span class="avatar-chip empty">?</span>
                <span class="assignee-name text-[#b17910]">待分配</span>
              </template>
            </div>
            <div class="note-time">
              <Clock3 class="h-4 w-4" />
              <span>{{ notes.formatNoteDate(task.date, task.time) }}</span>
            </div>
            <div class="note-actions">
              <button aria-label="編輯任務" @click="notes.editRoommateTask(task)">
                <Pencil class="h-4 w-4" />
              </button>
              <button :aria-label="task.done ? '標記為未完成' : '標記為完成'" @click="notes.toggleRoommateDone(task.id)">
                <CheckCircle2 class="h-5 w-5" />
              </button>
              <button aria-label="刪除任務" @click="notes.removeRoommateTask(task.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </article>

          <div v-if="notes.filteredRoommate.length === 0" class="empty-state">
            目前沒有符合條件的任務，試著新增一筆或切換篩選條件。
          </div>
        </div>

        <button class="show-completed" @click="notes.roommateFilter = 'done'">
          <Sparkles class="h-4 w-4" />
          顯示已完成任務
        </button>
      </section>

      <aside class="life-panel roommates-sidebar">
        <section class="members-card roommates-members-card">
          <div class="section-title">
            <div>
              <h2>室友 RentMate</h2>
            </div>
            <button type="button" @click="notes.openMemberDialog('link')">邀請室友</button>
          </div>

          <div class="member-list roommate-role-list">
            <article v-for="member in notes.roommateMembers" :key="member.id" class="member-row roommate-role-row">
              <span :class="['avatar-chip', notes.memberAccentClass(member.accent)]">
                {{ notes.memberInitial(member.name) }}
              </span>
              <div class="member-copy">
                <div class="member-name-line">
                  <strong>{{ member.name }}</strong>
                </div>
                <p>分工角色｜{{ member.role }}</p>
              </div>
              <button aria-label="移除室友" @click="notes.removeRoommateMember(member.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </article>
          </div>

          <p v-if="notes.memberActionStatus" class="member-status">{{ notes.memberActionStatus }}</p>
        </section>

        <section class="next-card">
          <div class="section-title">
            <h2>下一個事件</h2>
            <button type="button">更多</button>
          </div>
          <div v-if="notes.nextEvent" class="next-event-card">
            <CalendarDays class="h-6 w-6" />
            <div class="next-event-copy">
              <h3>{{ notes.nextEvent.title }}</h3>
              <p>{{ notes.formatNoteDate(notes.nextEvent.date, notes.nextEvent.time) }}</p>
            </div>
          </div>
          <div v-else class="empty-mini">目前沒有即將到來的事件。</div>
        </section>

        <img class="mascot" :src="notesMascotImage" alt="RentMate 室友插畫" />
      </aside>
    </main>

    <Dialog v-model:open="notes.showRoommateTaskDialog">
      <DialogContent class="max-w-lg rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">{{ notes.roommateTaskDialogTitle }}</DialogTitle>
          <DialogDescription>{{ notes.roommateTaskDialogDescription }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="notes.saveRoommateTask">
          <div class="space-y-2">
            <Label>任務標題</Label>
            <Input v-model="notes.roommateTaskForm.title" placeholder="例如：補買清潔用品" class="rounded-xl" />
          </div>
          <div class="space-y-2">
            <Label>任務說明</Label>
            <Textarea
              v-model="notes.roommateTaskForm.content"
              placeholder="補充任務內容，讓室友更容易接手。"
              class="min-h-[92px] rounded-xl"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>日期</Label>
              <Input v-model="notes.roommateTaskForm.date" type="date" class="rounded-xl" />
            </div>
            <div class="space-y-2">
              <Label>時間</Label>
              <Input v-model="notes.roommateTaskForm.time" type="time" class="rounded-xl" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>類別</Label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="tag in notes.roommateTags"
                  :key="tag"
                  type="button"
                  :class="['rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', notes.roommateTaskForm.tag === tag ? notes.noteTagClass(tag) : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300']"
                  @click="notes.roommateTaskForm.tag = tag"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>指派室友</Label>
              <select
                v-model="notes.roommateTaskForm.assigneeId"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#4845A5]"
              >
                <option value="">暫不指派</option>
                <option v-for="member in notes.roommateMembers" :key="member.id" :value="member.id">
                  {{ member.name }}｜{{ member.role }}
                </option>
              </select>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="notes.closeRoommateTaskDialog()">
              取消
            </Button>
            <Button type="submit" class="flex-1 rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">
              {{ notes.roommateTaskSubmitLabel }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="notes.showMemberDialog">
      <DialogContent class="max-w-xl rounded-[24px]">
        <DialogHeader>
          <DialogTitle class="text-lg font-bold text-[#111322]">邀請或新增室友</DialogTitle>
          <DialogDescription>你可以用連結、QR Code 邀請，也可以直接手動加入室友資料。</DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-1.5">
            <button :class="['dialog-tab', { active: notes.memberDialogMode === 'link' }]" @click="notes.memberDialogMode = 'link'">
              <Link2 class="h-4 w-4" />邀請連結
            </button>
            <button :class="['dialog-tab', { active: notes.memberDialogMode === 'qr' }]" @click="notes.memberDialogMode = 'qr'">
              <QrCode class="h-4 w-4" />QR Code
            </button>
            <button :class="['dialog-tab', { active: notes.memberDialogMode === 'manual' }]" @click="notes.memberDialogMode = 'manual'">
              <UserPlus class="h-4 w-4" />手動新增
            </button>
          </div>

          <div v-if="notes.memberDialogMode === 'link'" class="invite-box">
            <p class="text-sm font-semibold text-[#111322]">邀請連結</p>
            <p class="mt-1 text-sm text-[#737789]">把這個連結傳給室友，他們就能加入目前的協作空間。</p>
            <div class="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <Link2 class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p class="break-all text-xs leading-5 text-[#737789]">{{ notes.inviteLink }}</p>
            </div>
            <div class="mt-3 flex gap-2">
              <Button class="flex-1 rounded-full bg-[#4845A5] hover:bg-[#3c398f]" @click="notes.copyInviteLink">
                <Copy class="h-4 w-4" />複製連結
              </Button>
              <Button variant="outline" class="flex-1 rounded-full" @click="notes.shareInviteLink">
                <Share2 class="h-4 w-4" />分享
              </Button>
            </div>
          </div>

          <div v-else-if="notes.memberDialogMode === 'qr'" class="invite-box text-center">
            <p class="text-sm font-semibold text-[#111322]">邀請 QR Code</p>
            <p class="mt-1 text-sm text-[#737789]">讓室友直接掃描加入，不需要手動貼上連結。</p>
            <img :src="notes.qrCodeUrl" alt="室友邀請 QR Code" class="mx-auto mt-3 h-52 w-52 rounded-2xl border border-white bg-white p-2 shadow-sm" />
            <div class="mt-3 flex gap-2">
              <Button class="flex-1 rounded-full bg-[#4845A5] hover:bg-[#3c398f]" @click="notes.shareInviteLink">
                <Share2 class="h-4 w-4" />分享
              </Button>
              <Button variant="outline" class="flex-1 rounded-full" @click="notes.copyInviteLink">
                <Copy class="h-4 w-4" />複製連結
              </Button>
            </div>
          </div>

          <form v-else class="invite-box space-y-4" @submit.prevent="notes.saveRoommateMember">
            <p class="text-sm text-[#737789]">直接建立室友資料，方便馬上開始分派任務與標記角色。</p>
            <div class="space-y-2">
              <Label>室友姓名 / 暱稱</Label>
              <Input v-model="notes.roommateMemberForm.name" placeholder="例如：小安" class="rounded-xl bg-white" />
            </div>
            <div class="space-y-2">
              <Label>分工角色</Label>
              <Input v-model="notes.roommateMemberForm.role" placeholder="例如：採買與清潔" class="rounded-xl bg-white" />
            </div>
            <Button type="submit" class="w-full rounded-xl bg-[#4845A5] hover:bg-[#3c398f]">
              建立室友成員
            </Button>
          </form>

          <p v-if="notes.copyStatus" class="text-center text-xs text-[#737789]">{{ notes.copyStatus }}</p>
          <div class="flex gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="notes.regenerateInviteToken">
              重新產生邀請連結
            </Button>
            <Button type="button" variant="outline" class="flex-1 rounded-xl" @click="notes.showMemberDialog = false">
              關閉
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style src="./notes.css"></style>
