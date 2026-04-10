<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Search } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6 max-w-3xl mx-auto">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">垃圾清運時程</h1>
    </div>

    <div class="relative">
      <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input placeholder="台北市大安區信義路四段" class="pl-8" />
    </div>

    <div class="space-y-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">週日</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge>定期收運</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">週一</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge>定期收運</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">週二</CardTitle>
        </CardHeader>
        <CardContent class="flex gap-2">
          <Badge>定期收運</Badge>
          <Badge variant="secondary">含資源回收</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">週四</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge>定期收運</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">週五</CardTitle>
        </CardHeader>
        <CardContent class="flex gap-2">
          <Badge>定期收運</Badge>
          <Badge variant="secondary">含資源回收</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">資源回收</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">每隔週日加收</p>
        </CardContent>
      </Card>
    </div>

    <Button>設定通知</Button>
  </div>
</template>
