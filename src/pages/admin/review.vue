<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { Textarea } from '@/components/ui/textarea/index'
import { ShieldAlert } from 'lucide-vue-next'
import { useAdminReview } from '@/src/composables/admin/useAdminReview'
import { formatDateTime } from '@/src/utils/admin-format'
import type { RatingSubmission, ReviewStatus } from '@/src/mocks/admin-seed'

const {
  listings,
  ratings,
  pendingListings,
  pendingRatings,
  approveListing,
  rejectListing,
  approveRating,
  rejectRating,
} = useAdminReview()

const rejectTarget = ref<{ kind: 'listing' | 'rating'; id: string; title: string } | null>(null)
const rejectReason = ref('')

const statusLabels: Record<ReviewStatus, string> = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已退回',
}

function statusVariant(status: ReviewStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'approved') return 'default'
  if (status === 'rejected') return 'destructive'
  return 'secondary'
}

function openReject(kind: 'listing' | 'rating', id: string, title: string): void {
  rejectTarget.value = { kind, id, title }
  rejectReason.value = ''
}

function submitReject(): void {
  if (!rejectTarget.value || !rejectReason.value.trim()) return
  const reason = rejectReason.value.trim()
  if (rejectTarget.value.kind === 'listing') rejectListing(rejectTarget.value.id, reason)
  else rejectRating(rejectTarget.value.id, reason)
  rejectTarget.value = null
  rejectReason.value = ''
}

function splitContent(rating: RatingSubmission): Array<{ text: string; flagged: boolean }> {
  let segments: Array<{ text: string; flagged: boolean }> = [
    { text: rating.content, flagged: false },
  ]
  for (const flag of rating.piiFlags) {
    segments = segments.flatMap((segment) => {
      if (segment.flagged || !segment.text.includes(flag.text)) return [segment]
      const parts = segment.text.split(flag.text)
      const result: Array<{ text: string; flagged: boolean }> = []
      parts.forEach((part, index) => {
        if (part) result.push({ text: part, flagged: false })
        if (index < parts.length - 1) result.push({ text: flag.text, flagged: true })
      })
      return result
    })
  }
  return segments
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">物件與評價審核</h1>
      <p class="mt-1 text-muted-foreground">
        審核房東提交的物件與租客評價；評價已先經去識別化檢查，紅色片段為疑似個資。
      </p>
    </div>

    <Tabs default-value="listings" class="space-y-4">
      <TabsList>
        <TabsTrigger value="listings">物件審核（{{ pendingListings.length }} 待審）</TabsTrigger>
        <TabsTrigger value="ratings">評價審核（{{ pendingRatings.length }} 待審）</TabsTrigger>
      </TabsList>

      <TabsContent value="listings" class="space-y-4">
        <Card v-for="listing in listings" :key="listing.id" class="rounded-[1.5rem]">
          <CardHeader class="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle class="text-lg">{{ listing.title }}</CardTitle>
              <CardDescription>
                {{ listing.address }}｜{{ listing.landlordEmail }}｜提交於
                {{ formatDateTime(listing.submittedAt) }}
              </CardDescription>
            </div>
            <Badge :variant="statusVariant(listing.status)">{{ statusLabels[listing.status] }}</Badge>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="listing.rejectReason" class="text-sm text-destructive">
              退回理由：{{ listing.rejectReason }}
            </p>
            <div v-if="listing.status === 'pending'" class="flex gap-2">
              <Button size="sm" @click="approveListing(listing.id)">通過</Button>
              <Button
                size="sm"
                variant="outline"
                @click="openReject('listing', listing.id, listing.title)"
              >
                退回
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ratings" class="space-y-4">
        <Card v-for="rating in ratings" :key="rating.id" class="rounded-[1.5rem]">
          <CardHeader class="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle class="text-lg">{{ rating.listingTitle }}</CardTitle>
              <CardDescription>
                {{ rating.authorNickname }}｜提交於 {{ formatDateTime(rating.submittedAt) }}
              </CardDescription>
            </div>
            <Badge :variant="statusVariant(rating.status)">{{ statusLabels[rating.status] }}</Badge>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-sm leading-relaxed">
              <span
                v-for="(segment, index) in splitContent(rating)"
                :key="index"
                :class="segment.flagged ? 'rounded bg-red-100 px-1 font-medium text-red-700' : ''"
              >{{ segment.text }}</span>
            </p>
            <div
              v-if="rating.piiFlags.length > 0"
              class="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <ShieldAlert class="h-4 w-4 shrink-0" />
              去識別化檢查：偵測到
              {{ rating.piiFlags.map((flag) => `疑似${flag.kind}「${flag.text}」`).join('、') }}
            </div>
            <p v-if="rating.rejectReason" class="text-sm text-destructive">
              退回理由：{{ rating.rejectReason }}
            </p>
            <div v-if="rating.status === 'pending'" class="flex gap-2">
              <Button size="sm" @click="approveRating(rating.id)">通過並公開</Button>
              <Button
                size="sm"
                variant="outline"
                @click="openReject('rating', rating.id, `${rating.listingTitle} 的評價`)"
              >
                退回
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog
      :open="rejectTarget !== null"
      @update:open="(open: boolean) => { if (!open) rejectTarget = null }"
    >
      <DialogContent v-if="rejectTarget">
        <DialogHeader>
          <DialogTitle>退回{{ rejectTarget.kind === 'listing' ? '物件' : '評價' }}</DialogTitle>
          <DialogDescription>{{ rejectTarget.title }}｜退回理由會通知提交者。</DialogDescription>
        </DialogHeader>
        <Textarea v-model="rejectReason" placeholder="請填寫退回理由" rows="4" />
        <DialogFooter>
          <Button variant="outline" @click="rejectTarget = null">取消</Button>
          <Button variant="destructive" :disabled="!rejectReason.trim()" @click="submitReject">
            確認退回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
