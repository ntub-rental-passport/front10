<script setup lang="ts">
import { Bell, Crosshair, MapPin, Search, Star, Truck, List, ArrowRight } from 'lucide-vue-next'
defineEmits<{ navigate: ['map' | 'list' | 'nearby' | 'manual' | 'favorites' | 'reminder'] }>()
const steps = [
  {
    tab: 'map' as const,
    icon: Search,
    title: '用地址，找到清運班次',
    text: '選擇行政區與里別，輸入道路或地址，再選擇日期與時間。地圖會同步顯示符合條件的站點；點選數字群集可放大，點選紫色站點可查看詳情。',
    labels: ['選擇行政區', '里別／道路', '日期／時間'],
  },
  {
    tab: 'list' as const,
    icon: List,
    title: '用列表，比較時間與路線',
    text: '縣市固定為臺北市。每頁顯示 20 筆班次，依條件縮小結果。相同地址可能有不同車次，收藏或提醒前請確認抵達時間。',
    labels: ['臺北市', '篩選班次', '比較表定時間'],
  },
  {
    tab: 'nearby' as const,
    icon: Crosshair,
    title: '打開 GPS，查詢附近 500 公尺',
    text: '按「啟用 GPS 定位」並允許位置權限。系統會持續更新你的所在位置，將方圓 500 公尺內的班表站點依直線距離排序。若沒有結果，可改用手動選點。',
    labels: ['允許定位', '500 m 範圍', '依距離排序'],
  },
  {
    tab: 'manual' as const,
    icon: MapPin,
    title: '點一下，先查下一個目的地',
    text: '切換手動定位，在地圖空白處點選目的地。橘色定位點是查詢中心，虛線圈代表 500 公尺範圍；再次點選即可換位置。無需開啟 GPS。',
    labels: ['點擊地圖', '移動查詢中心', '查看附近站點'],
  },
  {
    tab: 'favorites' as const,
    icon: Star,
    title: '常用的站點，留在我的收藏',
    text: '點選站點旁的星號，變成金色即已收藏。收藏保存於目前瀏覽器，並依登入帳號分開；清除瀏覽器資料後需重新收藏。再次點選可取消。',
    labels: ['點選星號', '保存至收藏', '快速導航／提醒'],
  },
  {
    tab: 'reminder' as const,
    icon: Bell,
    title: '出門前，收到一則剛好的提醒',
    text: '選擇清運站點、日期與提前分鐘數，再勾選系統推播或 Gmail。郵件寄到登入帳號信箱。推播需允許通知權限，裝置支援時關閉頁面也可收到。保存後可暫停、恢復或刪除，並查看發送紀錄。',
    labels: ['選站點與日期', '提前 5–60 分鐘', '推播／Gmail'],
  },
]
</script>
<template>
  <section class="garbage-guide">
    <div class="guide-intro">
      <div>
        <p class="eyebrow">A LITTLE GUIDE FOR EVERYDAY LIFE</p>
        <h2>第一次使用？從這裡開始。</h2>
        <p>找站點、看時間、設提醒。讓日常少一件需要記住的事。</p>
      </div>
      <Truck :size="62" :stroke-width="1.2" />
    </div>
    <div class="guide-grid">
      <article v-for="(step, i) in steps" :key="step.tab" class="panel guide-card">
        <div class="guide-visual" role="img" :aria-label="step.labels.join('，接著')">
          <div class="guide-orbit">
            <span class="guide-pin"><component :is="step.icon" :size="32" /></span
            ><span class="guide-step-number">0{{ i + 1 }}</span>
          </div>
          <div class="guide-flow">
            <template v-for="(label, n) in step.labels" :key="label"
              ><ArrowRight v-if="n" :size="12" /><span>{{ label }}</span></template
            >
          </div>
        </div>
        <h3>{{ step.title }}</h3>
        <p>{{ step.text }}</p>
        <button class="text-button" @click="$emit('navigate', step.tab)">
          前往{{
            step.tab === 'reminder' ? '設定提醒' : step.tab === 'favorites' ? '我的收藏' : '查詢'
          }}
          <ArrowRight :size="15" />
        </button>
      </article>
    </div>
    <div class="panel guide-faq">
      <h3>關於時間、定位與通知</h3>
      <details>
        <summary>如何查看路線與切換航照？</summary>
        <p>
          點選地圖上的「路線列表」，選擇路線、車次與車號，即可查看各站表定時間。虛線是依時間排序的站點連線示意，不是道路導航，也不代表垃圾車目前行進位置。「航照影像」可切換國土測繪中心底圖；不是即時氣象雲圖。藍點表示你的目前位置，橘色點表示清運站點。
        </p>
      </details>
      <details>
        <summary>資料有錯誤，如何回報？</summary>
        <p>
          站點詳情或頁面底部有「回報問題」。填寫問題類型、觀察日期及說明後，前往 RentMate 的 GitHub
          Issues 確認送出，需有 GitHub
          帳號及儲存庫存取權。不會自動附上你的定位或登入資料；請勿填入個資，回報也不會直接更動官方班表。
        </p>
      </details>
      <details>
        <summary>滿版地圖如何設定查詢條件？</summary>
        <p>
          點選地圖左上角「查詢條件」，在彈出視窗選擇行政區、里別、道路、日期與時間，再按「查看結果」返回地圖。可按右上角關閉或
          Escape 關閉視窗；列表模式仍保留側邊查詢條件。
        </p>
      </details>
      <details>
        <summary>下一班倒數怎麼計算？</summary>
        <p>
          以臺北時間找出同地址尚未結束的最近班次，一小時內每秒更新分秒倒數。末班已過會尋找下一個收運日，並處理跨午夜班次。這是表定倒數，不代表車輛正在營運；例行停收以外的臨時異動仍須查閱官方公告。回收、廚餘缺少獨立班表時，不會沿用垃圾班表。
        </p>
      </details>
      <details>
        <summary>準點、誤點與抵達預測如何計算？</summary>
        <p>
          預估誤點＝預測抵達時間－該班次表定抵達時間；正值表示晚到、負值表示提早。實際誤點則須以確認到站的時間計算，不能只因表定時間已過就判定誤點。
        </p>
        <p>
          可靠預測需要同一車輛的連續 GPS
          紀錄，先排除過期或跳點資料，再依方向、路線與站點順序確認已過站／停靠／行進狀態，累加剩餘路段行車時間與中途停靠時間，並用歷史實際到站紀錄校正。Google
          道路行車時間可作輔助，但不能取代垃圾車停靠時間。
        </p>
        <p>
          目前官方 CSV／點位 API
          只有班表與站點座標，未提供真實移動軌跡，因此尚未啟用準誤點預測，也不以直線距離假裝精準
          ETA。串接後仍需標示資料更新時間與預測誤差範圍。
        </p>
      </details>
      <details>
        <summary>為什麼看板寫「表定」？</summary>
        <p>
          CSV 提供的是官方停靠班表。倒數會隨時間更新；實際車輛位置須另有 GPS
          資料，連線後以綠色標記顯示。沒有 GPS 時不會宣稱車輛已抵達。
        </p>
      </details>
      <details>
        <summary>為什麼週三、週日查不到班次？</summary>
        <p>
          臺北市一般垃圾車週三、週日例行停收。特殊限時收受點不在本次資料範圍，請參閱環保局官方網站；臨時清運調整以公告為準。
        </p>
      </details>
      <details>
        <summary>定位或通知無法開啟？</summary>
        <p>
          請使用 HTTPS 網址（本機開發可用
          localhost），並檢查瀏覽器的位置與通知權限。部分裝置需要將網站加入主畫面才能使用推播。服務顯示「尚未啟用」時，需由管理者完成通知服務設定。
        </p>
      </details>
      <details>
        <summary>提醒一定會即時收到嗎？</summary>
        <p>
          提醒需要後端持續運作，送達亦受網路、裝置省電及郵件服務影響。服務中斷超過五分鐘的過期提醒會標記逾時；發送失敗可查看紀錄並重新設定。請勿只依賴提醒判斷是否有清運。
        </p>
      </details>
    </div>
  </section>
</template>
