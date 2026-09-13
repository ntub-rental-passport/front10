<script setup lang="ts">
/**
 * 點交清單與存證 — Hub 頁
 * ---------------------------------------------------------
 * 這頁是「集散地」，本身不執行拍照或比對，只負責：
 *   1. 讓使用者切換／新增／刪除租屋處（多址支援）
 *   2. 顯示目前租屋處的整體統計（搬入幾項、退租幾項、已比對幾項）
 *   3. 提供兩張大卡，分別連到：
 *      - 入住前點交：/app/handover/baseline
 *      - 退租前點交與比對：/app/handover/checkout
 *
 * 設計理由：搬入與退租是租期兩端的事件，中間隔數月到數年，
 * 把它們做成不同頁面比塞在同一頁更貼近真實使用情境。
 */

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, Plus, Trash2, ArrowRight, LogIn, LogOut } from 'lucide-vue-next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'

import { useHandover } from '@/src/composables/useHandover'
import { countItemsWithEvidence } from '@/src/utils/handover'

const router = useRouter()
const {
  properties,
  currentProperty,
  selectProperty,
  addProperty,
  removeProperty,
  itemsOfCurrentProperty,
} = useHandover()

// ---------- 租屋處 ---------- //

const showAddPropertyDialog = ref(false)
const newProperty = ref({ alias: '', address: '' })

function submitAddProperty() {
  if (!newProperty.value.alias || !newProperty.value.address) return
  addProperty(newProperty.value.alias, newProperty.value.address)
  newProperty.value = { alias: '', address: '' }
  showAddPropertyDialog.value = false
}

function onSelectProperty(val: string) {
  selectProperty(val)
}

function confirmRemoveProperty() {
  if (!currentProperty.value) return
  const ok = window.confirm(
    `確定要刪除「${currentProperty.value.alias}」？此租屋處底下的所有點交項目與照片將一併移除。`
  )
  if (ok) removeProperty(currentProperty.value.id)
}

// ---------- 統計 ---------- //

const stats = computed(() => {
  const items = itemsOfCurrentProperty.value
  return {
    total: items.length,
    baselineDone: countItemsWithEvidence(items, 'baseline'),
    checkoutDone: countItemsWithEvidence(items, 'checkout'),
    diffDone: items.filter((it) => it.diff).length,
  }
})

// ---------- 導航 ---------- //

function goBaseline() {
  router.push('/app/handover/baseline')
}
function goCheckout() {
  router.push('/app/handover/checkout')
}
</script>

<template>
  <div class="space-y-6">
    <!-- 標題 -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight">點交清單與存證</h1>
      <p class="text-muted-foreground">
        分為「入住前點交」與「退租前點交與比對」兩個階段，請依目前租屋進度選擇。
      </p>
    </div>

    <!-- 租屋處選擇器 -->
    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[240px] space-y-1">
            <Label class="flex items-center gap-1 text-xs">
              <Building2 class="h-3 w-3" /> 目前租屋處
            </Label>
            <Select
              :model-value="currentProperty?.id ?? ''"
              @update:model-value="(v) => onSelectProperty(String(v))"
            >
              <SelectTrigger>
                <SelectValue placeholder="請選擇租屋處" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in properties" :key="p.id" :value="p.id">
                  {{ p.alias }}（{{ p.address }}）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog v-model:open="showAddPropertyDialog">
            <DialogTrigger as-child>
              <Button variant="outline" size="sm">
                <Plus class="mr-1 h-4 w-4" /> 新增租屋處
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增租屋處</DialogTitle>
                <DialogDescription>輸入暱稱與完整地址，方便日後辨識。</DialogDescription>
              </DialogHeader>
              <div class="space-y-3 py-2">
                <div class="space-y-1">
                  <Label>暱稱</Label>
                  <Input v-model="newProperty.alias" placeholder="例如：中山區套房" />
                </div>
                <div class="space-y-1">
                  <Label>地址</Label>
                  <Input v-model="newProperty.address" placeholder="完整地址" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" @click="showAddPropertyDialog = false">取消</Button>
                <Button @click="submitAddProperty">新增</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            v-if="currentProperty"
            variant="ghost"
            size="sm"
            class="text-destructive"
            @click="confirmRemoveProperty"
          >
            <Trash2 class="mr-1 h-4 w-4" /> 刪除
          </Button>
        </div>

        <div v-if="currentProperty" class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">點交項目</div>
            <div class="font-semibold">{{ stats.total }} 項</div>
          </div>
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">搬入已存證</div>
            <div class="font-semibold">{{ stats.baselineDone }} / {{ stats.total }}</div>
          </div>
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">退租已存證</div>
            <div class="font-semibold">{{ stats.checkoutDone }} / {{ stats.total }}</div>
          </div>
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">已完成比對</div>
            <div class="font-semibold">{{ stats.diffDone }} / {{ stats.total }}</div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 兩個階段入口卡 -->
    <div v-if="currentProperty" class="grid gap-4 md:grid-cols-2">
      <!-- 入住前點交（含彙整 + 列印 + 匯出） -->
      <Card class="hover:border-primary transition-colors cursor-pointer" @click="goBaseline">
        <CardHeader>
          <div class="flex items-center gap-2 text-primary">
            <LogIn class="h-5 w-5" />
            <CardTitle>入住前點交</CardTitle>
          </div>
          <CardDescription>
            搬入時建立家具清單、逐項拍攝、依房間分組檢視，可列印或匯出 PDF。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="text-sm text-muted-foreground mb-3">
            目前進度：{{ stats.baselineDone }} / {{ stats.total }} 項已存證
          </div>
          <Button class="w-full">
            進入入住前點交 <ArrowRight class="ml-1 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <!-- 退租前點交與比對 -->
      <Card class="hover:border-primary transition-colors cursor-pointer" @click="goCheckout">
        <CardHeader>
          <div class="flex items-center gap-2 text-primary">
            <LogOut class="h-5 w-5" />
            <CardTitle>退租前點交與比對</CardTitle>
          </div>
          <CardDescription>
            退租時對照搬入照重拍，系統自動產生差異比對，並可一鍵匯出 PDF 證據包。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="text-sm text-muted-foreground mb-3">
            目前進度：{{ stats.checkoutDone }} / {{ stats.total }} 項已存證，已比對
            {{ stats.diffDone }} 項
          </div>
          <Button class="w-full" variant="outline">
            進入退租前點交 <ArrowRight class="ml-1 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>

    <Card v-else>
      <CardContent class="pt-6 text-center text-muted-foreground space-y-2">
        <Building2 class="h-8 w-8 mx-auto" />
        <p>請先新增至少一個租屋處，才能開始建立點交清單。</p>
      </CardContent>
    </Card>
  </div>
</template>
