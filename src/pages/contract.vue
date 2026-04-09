<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, AlertTriangle, CheckCircle2, Bot } from 'lucide-vue-next'

const isUploaded = ref(false)

const contractText = `房屋租賃契約書
立契約書人：
出租人：王大明 (以下簡稱甲方)
承租人：李小華 (以下簡稱乙方)

第一條：租賃標的
房屋座落：台北市大安區和平東路二段100號5樓
...
第三條：租金與押金
每月租金新台幣 15,000 元整。
押金新台幣 45,000 元整 (相當於三個月租金)。

第四條：修繕責任
房屋及附屬設備損壞時，不論原因為何，概由乙方負責修繕。
...`
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">契約分析</h1>
      <p class="text-muted-foreground">上傳租賃契約，AI 將為您辨識潛在風險並提供談判建議。</p>
    </div>

    <Card v-if="!isUploaded" class="border-dashed border-2">
      <CardContent class="flex flex-col items-center justify-center h-64 space-y-4">
        <div class="rounded-full bg-primary/10 p-4">
          <Upload class="h-8 w-8 text-primary" />
        </div>
        <div class="text-center">
          <h3 class="text-lg font-semibold">上傳租屋契約</h3>
          <p class="text-sm text-muted-foreground mt-1">支援 PDF 或圖片格式 (JPG, PNG)</p>
        </div>
        <Button @click="isUploaded = true">選擇檔案</Button>
      </CardContent>
    </Card>

    <Tabs v-else default-value="analysis" class="w-full">
      <TabsList class="grid w-full grid-cols-3">
        <TabsTrigger value="preview">契約預覽</TabsTrigger>
        <TabsTrigger value="analysis">風險分析</TabsTrigger>
        <TabsTrigger value="negotiation">AI 談判輔助</TabsTrigger>
      </TabsList>

      <TabsContent value="preview" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>契約內容預覽</CardTitle>
            <CardDescription>OCR 辨識結果，可點擊編輯修正錯誤</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="bg-muted p-4 rounded-md font-mono text-sm whitespace-pre-wrap h-96 overflow-y-auto">{{ contractText }}</div>
          </CardContent>
          <CardFooter class="justify-between">
            <Button variant="outline" @click="isUploaded = false">重新上傳</Button>
            <Button>儲存電子檔</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="analysis" class="mt-4">
        <div class="space-y-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <AlertTriangle class="h-5 w-5 text-destructive" />
                高風險條款 (2)
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="border rounded-lg p-4 space-y-2">
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold">押金超收</h4>
                  <Badge variant="destructive">高風險</Badge>
                </div>
                <p class="text-sm text-muted-foreground bg-muted p-2 rounded">
                  原文：押金新台幣 45,000 元整 (相當於三個月租金)。
                </p>
                <p class="text-sm">
                  <strong>AI 解析：</strong> 依據《租賃住宅市場發展及管理條例》，押金不得超過兩個月租金總額。此條款違反法規，房客有權要求依法調整為兩個月。
                </p>
              </div>
              <div class="border rounded-lg p-4 space-y-2">
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold">修繕責任轉嫁</h4>
                  <Badge variant="destructive">高風險</Badge>
                </div>
                <p class="text-sm text-muted-foreground bg-muted p-2 rounded">
                  原文：房屋及附屬設備損壞時，不論原因為何，概由乙方負責修繕。
                </p>
                <p class="text-sm">
                  <strong>AI 解析：</strong> 依據《民法》第429條，除契約另有訂定或另有習慣外，租賃物之修繕由出租人負擔。此條款將所有修繕責任轉嫁給承租人，對您極為不利。
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <CheckCircle2 class="h-5 w-5 text-green-500" />
                合規條款 (5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">租金金額、租期、水電費計價方式等條款符合一般常規與法規限制。</p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="negotiation" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Bot class="h-5 w-5 text-primary" />
              AI 談判腳本建議
            </CardTitle>
            <CardDescription>針對高風險條款，提供您與房東溝通的建議說法</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div class="space-y-2">
              <h4 class="font-semibold text-primary">針對「押金超收」</h4>
              <div class="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
                「房東您好，我非常喜歡這間房子，也很有誠意承租。不過我查了一下內政部的租賃法規，目前規定押金最高只能收兩個月。為了符合法規，我們是不是可以把押金調整為 30,000 元呢？我會好好愛惜您的房子的。」
              </div>
              <div class="flex justify-end">
                <Button variant="ghost" size="sm">複製文字</Button>
              </div>
            </div>
            <div class="space-y-2">
              <h4 class="font-semibold text-primary">針對「修繕責任」</h4>
              <div class="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
                「房東，關於合約第四條修繕責任的部分，『不論原因為何皆由乙方負責』這點我比較擔心。如果是房屋結構或設備自然老化的損壞，依法應該是由房東負責修繕的。我們是否能改成『因乙方人為破壞由乙方負責，自然耗損由甲方負責』這樣比較公平呢？」
              </div>
              <div class="flex justify-end">
                <Button variant="ghost" size="sm">複製文字</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
