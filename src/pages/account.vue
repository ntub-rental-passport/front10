<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Moon, Bell, Shield, HelpCircle, FileText, LogOut } from 'lucide-vue-next'

const name = ref('王小明')
const phone = ref('0912-345-678')
const darkMode = ref(false)
const pushNotif = ref(true)
const biometric = ref(false)
</script>

<template>
  <div class="space-y-6 max-w-3xl mx-auto">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">我的帳戶</h1>
      <p class="text-muted-foreground">管理您的個人資料、系統設定與安全隱私。</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>個人資料</CardTitle>
        <CardDescription>更新您的基本資訊與聯絡方式</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="flex items-center gap-6">
          <Avatar class="h-20 w-20">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>王</AvatarFallback>
          </Avatar>
          <Button variant="outline">更換頭像</Button>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="name">姓名</Label>
            <Input id="name" v-model="name" />
          </div>
          <div class="space-y-2">
            <Label for="email">電子郵件</Label>
            <Input id="email" type="email" model-value="user@example.com" disabled />
          </div>
          <div class="space-y-2">
            <Label for="phone">手機號碼</Label>
            <Input id="phone" type="tel" v-model="phone" />
          </div>
        </div>
        <Button>儲存變更</Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>系統設定</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Moon class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">深色模式</p>
              <p class="text-sm text-muted-foreground">切換深色或淺色主題</p>
            </div>
          </div>
          <Switch v-model="darkMode" />
        </div>
        <Separator />
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Bell class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">推播通知</p>
              <p class="text-sm text-muted-foreground">允許系統發送重要提醒</p>
            </div>
          </div>
          <Switch v-model="pushNotif" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>安全與隱私</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Shield class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">生物辨識登入</p>
              <p class="text-sm text-muted-foreground">使用 Face ID 或 Touch ID 快速登入</p>
            </div>
          </div>
          <Switch v-model="biometric" />
        </div>
        <Separator />
        <Button variant="outline" class="w-full justify-start">重設密碼</Button>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-2">
      <Button variant="outline" class="h-auto py-4 justify-start gap-3">
        <HelpCircle class="h-5 w-5 text-muted-foreground" />
        <div class="text-left">
          <p class="font-medium">客服中心</p>
          <p class="text-xs text-muted-foreground">常見問題與聯絡我們</p>
        </div>
      </Button>
      <Button variant="outline" class="h-auto py-4 justify-start gap-3">
        <FileText class="h-5 w-5 text-muted-foreground" />
        <div class="text-left">
          <p class="font-medium">法律與隱私</p>
          <p class="text-xs text-muted-foreground">服務條款與隱私權政策</p>
        </div>
      </Button>
    </div>

    <Button variant="destructive" class="w-full">
      <LogOut class="mr-2 h-4 w-4" />
      登出帳號
    </Button>
  </div>
</template>
