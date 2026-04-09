<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const emit = defineEmits<{ back: [] }>()

const city = ref('')
const rent = ref('')
const registeredAddress = ref('')
const rentalAddress = ref('')
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold">填寫申請資料</h2>
      <p class="text-sm text-muted-foreground mt-1">請填寫完整資訊後送出申請</p>
    </div>
    <div class="space-y-3">
      <div class="space-y-1.5">
        <Label>申請縣市</Label>
        <Select v-model="city">
          <SelectTrigger><SelectValue placeholder="請選擇縣市" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="taipei">台北市</SelectItem>
            <SelectItem value="newtaipei">新北市</SelectItem>
            <SelectItem value="taoyuan">桃園市</SelectItem>
            <SelectItem value="taichung">台中市</SelectItem>
            <SelectItem value="tainan">台南市</SelectItem>
            <SelectItem value="kaohsiung">高雄市</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1.5">
        <Label>月租金金額</Label>
        <Input v-model="rent" type="number" placeholder="請輸入月租金" />
      </div>
      <div class="space-y-1.5">
        <Label>戶籍地址</Label>
        <Input v-model="registeredAddress" placeholder="請輸入戶籍地址" />
      </div>
      <div class="space-y-1.5">
        <Label>租屋地址</Label>
        <Input v-model="rentalAddress" placeholder="請輸入租屋地址" />
      </div>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" class="flex-1" @click="emit('back')">上一步</Button>
      <Button class="flex-1">送出申請</Button>
    </div>
  </div>
</template>
