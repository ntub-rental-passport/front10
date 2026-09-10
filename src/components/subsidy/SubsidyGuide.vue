<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SubsidyJourney from './SubsidyJourney.vue'
import heroImage from '@/src/assets/subsidy/01-rent-subsidy-hero.png'
import eligibilityImage from '@/src/assets/subsidy/02-eligibility-check.png'
import housingImage from '@/src/assets/subsidy/03-housing-check.png'
import documentsImage from '@/src/assets/subsidy/04-application-documents.png'
import progressImage from '@/src/assets/subsidy/05-progress-followup.png'
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  ClipboardCheck,
  House,
  CircleHelp,
  FileText,
} from 'lucide-vue-next'
import {
  checkHousing,
  checkIncome,
  incomeLimits,
  subsidySources as sources,
  type Answer,
} from '@/src/utils/subsidy-guide'

const route = useRoute()
const tabs = [
  ['租補總覽', '/app/subsidy'],
  ['資格初步檢核', '/app/subsidy/calculator'],
  ['房屋條件確認', '/app/subsidy/housing'],
  ['申請準備', '/app/subsidy/apply'],
  ['進度與補件', '/app/subsidy/progress'],
  ['追繳協助', '/app/subsidy/recovery'],
]
const page = computed(() => route.path.split('/').pop())
// Session memory only: no identity numbers, account credentials, documents or cross-account persistence.
const form = reactive({
  city: '',
  annual: '' as number | '',
  people: '' as number | '',
  expanded: false,
  identity: '' as Answer,
  ownership: '' as Answer,
  assistance: '' as Answer,
})
const housing = reactive({
  tax: '' as Answer,
  legal: '' as Answer,
  residentialTax: '' as Answer,
  use: '' as Answer,
  old: false,
})
const income = computed(() => checkIncome(form.city, form.annual, form.people, form.expanded))
const housingResult = computed(() =>
  checkHousing(housing.tax, housing.legal, housing.residentialTax, housing.use, housing.old),
)
const personalQuestions = [
  {
    key: 'identity' as const,
    title: '是否為在國內設有戶籍的中華民國成年國民（18 歲以上）？',
    help: '未成年特例請選「不確定／需確認」，洽承辦確認；不要求戶籍與租屋處同縣市。',
  },
  {
    key: 'ownership' as const,
    title: '家庭成員是否均無自有房屋？',
    help: '小面積共有、公告拆遷或毀損房屋有認定例外，請勿自行排除申請可能。',
  },
  {
    key: 'assistance' as const,
    title: '家庭成員是否未接受其他政府住宅協助？',
    help: '若正在領取其他補貼，可能需切結放棄或確認例外；不可直接重複領取。',
  },
]
const housingQuestions = [
  {
    key: 'tax' as const,
    title: '實際承租房屋有房屋稅籍嗎？',
    help: '請向房東索取稅單或稅籍證明，確認門牌與樓層。隔壁或樓下的稅籍不代表你的房間已符合。',
  },
  {
    key: 'legal' as const,
    title: '已保存登記，或有建築物合法證明嗎？',
    help: '可請房東提供建物登記謄本或合法建築證明；有稅籍不等於已完成合法建物確認。',
  },
  {
    key: 'residentialTax' as const,
    title: '房屋稅單是否載明全部或部分按住家用稅率課稅？',
    help: '依稅單或稅捐單位證明確認；不能只依房東口頭保證。',
  },
  {
    key: 'use' as const,
    title: '建物主要用途是否含住、農舍、套房、公寓或宿舍？',
    help: '查建物登記資料。「住家用稅率」與這項用途條件為擇一，仍需具稅籍及保存登記或合法證明。',
  },
]
const options = [
  { value: 'yes', label: '是' },
  { value: 'no', label: '否' },
  { value: 'unknown', label: '不確定／需確認' },
]
const needs = reactive({ pregnancy: false, disaster: false, alternate: false })
const checked = ref<string[]>([])
const documents = computed(() => [
  {
    id: 'lease',
    title: '租賃契約影本或電子契約',
    help: '確認承租人、出租人、地址、租金與租期完整；各頁、簽章清晰。',
    tag: '基本必要',
  },
  {
    id: 'account',
    title: '撥款帳戶證明',
    help: '需清楚顯示申請人戶名及帳號，例如存摺封面。',
    tag: '基本必要',
  },
  ...(needs.pregnancy
    ? [
        {
          id: 'pregnancy',
          title: '胎兒證明',
          help: '準備審查基準日前一個月內醫療院所或衛生單位出具的證明。',
          tag: '依情況',
        },
      ]
    : []),
  ...(needs.disaster
    ? [
        {
          id: 'disaster',
          title: '災民資格證明',
          help: '準備權責主管機關認定文件，依官方申請頁要求檢附。',
          tag: '依情況',
        },
      ]
    : []),
  ...(needs.alternate
    ? [
        {
          id: 'alternate',
          title: '指定帳戶切結書與帳戶證明',
          help: '本人帳戶無法使用時，確認指定帳戶的切結與文件要求。',
          tag: '依情況',
        },
      ]
    : []),
])
const prepared = computed(() => documents.value.filter((d) => checked.value.includes(d.id)).length)
const progress = reactive({ status: '', date: '', deadline: '' })
const recovery = reactive({ received: '', deadline: '', reason: '', question: '' })
const feedback = ref('')
const faqQuery = ref('')
const faqs = [
  {
    q: '家庭成員怎麼算？父母、室友也算嗎？',
    a: '不是直接採計同戶籍所有人。原則包含本人、配偶、本人或配偶的未成年子女（含胎兒），及受本人或配偶監護之人；子女權利義務等細節請依官方定義確認。',
    source: sources.announcement,
  },
  {
    q: '套房、雅房、獨立套房有什麼不同？',
    a: '獨立套房有獨立權狀或對外出入口並有單一門牌；分租套房通常無獨立權狀或門牌，但有獨立衛浴；分租雅房沒有獨立衛浴。請依實際狀況與租約填寫，房型名稱不能證明房屋符合補貼條件。',
    source: sources.portal,
  },
  {
    q: '申請成功就代表審核通過嗎？',
    a: '不是。官方完成送出並取得案件流水編號，表示已提出申請；是否核准仍待審查。RentMate 的勾選與紀錄也不會送交政府。',
    source: sources.portal,
  },
  {
    q: '房東說可以租補，就不用查房屋資料嗎？',
    a: '仍建議核對稅籍、建物資料與承租樓層，保存租約及往來紀錄。租約 OCR 能協助閱讀，無法驗證稅籍或建物合法性。',
    source: sources.faq,
  },
]
const filteredFaqs = computed(() => faqs.filter((f) => (f.q + f.a).includes(faqQuery.value.trim())))
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  feedback.value = '已產生下載檔案，請妥善保存；未送交政府。'
}
function exportChecklist() {
  download(
    'RentMate｜115 年租補申請準備清單\n' +
      documents.value
        .map((d) => `${checked.value.includes(d.id) ? '已準備' : '待準備'}｜${d.title}：${d.help}`)
        .join('\n') +
      '\n房屋條件請另行查證。\n正式申請：' +
      sources.portal,
    'RentMate-租補準備清單.txt',
  )
}
function exportRecovery() {
  download(
    `RentMate｜追繳通知諮詢筆記（本人整理，非法律判定）\n收到日期：${recovery.received || '待填'}\n通知所載期限：${recovery.deadline || '待確認'}\n通知理由：${recovery.reason || '待填'}\n想詢問的問題：${recovery.question || '待填'}\n\n請向承辦確認：\n1.適用哪一年度規定、哪一筆房屋資料及不符期間？\n2.追繳金額的月份與計算方式？能否提供查核依據？\n3.需要補充哪些證據？通知列明的救濟方式與期限？\n4.如有還款困難，可否申請分期及需要的文件？\n5.目前房屋與未來申請資格是否需另案確認？\n\n準備：通知全文與信封、歷年核定函、各期租約、撥款紀錄、稅籍與建物文件。\n官方問答：${sources.faq}`,
    'RentMate-追繳諮詢筆記.txt',
  )
}
</script>

<template>
  <div class="subsidy-guide">
    <header class="guide-heading">
      <div>
        <span class="eyebrow">RENTMATE · 租屋支持</span>
        <h1>租金補貼助手</h1>
      </div>
      <a class="official-link" :href="sources.portal" target="_blank" rel="noopener noreferrer"
        >政府租補網站 <ArrowUpRight :size="16"
      /></a>
    </header>
    <nav class="guide-nav" aria-label="租金補貼功能">
      <RouterLink
        v-for="tab in tabs"
        :key="tab[1]"
        :to="tab[1]!"
        :class="{ active: route.path === tab[1] || (page === 'upload' && tab[0] === '申請準備') }"
        :aria-current="route.path === tab[1] ? 'page' : undefined"
        >{{ tab[0] }}</RouterLink
      >
    </nav>

    <template v-if="page === 'subsidy'">
      <section class="hero illustrated-hero">
        <img
          class="hero-art"
          :src="heroImage"
          alt="租客核對租補文件，房東拿著鑰匙，身後是租賃住宅"
          width="1672"
          height="941"
          fetchpriority="high"
        />
        <div class="hero-copy">
          <span class="eyebrow">115 年度 · 300 億元中央擴大租金補貼</span>
          <h2>申請租補，<br />從看懂自己的下一步開始。</h2>
          <p>不確定資格、文件，或擔心租屋條件？<br />一步步確認，把要問的事整理好再出發。</p>
          <RouterLink class="primary" to="/app/subsidy/calculator"
            >開始資格初步檢核 <ArrowRight :size="17"
          /></RouterLink>
        </div>
        <div class="hero-note hero-note-below">
          <House :size="38" stroke-width="1.3" /><strong>先確認人，再確認房</strong>
          <p>收到補貼不代表日後不會查核。<br />簽約、續約或搬家，都值得再確認。</p>
          <RouterLink to="/app/subsidy/housing">檢查房屋條件 →</RouterLink>
        </div>
      </section>
      <SubsidyJourney />
      <div class="meta-grid">
        <article class="panel">
          <span class="eyebrow">申請期間</span>
          <h3>115/01/01 — 12/31</h3>
          <p>1 月 1 日 09:00 開始，12 月 31 日 17:00 截止。隨到隨辦。</p>
        </article>
        <article class="panel">
          <span class="eyebrow">補貼金額</span>
          <h3>依地區與家庭條件核定</h3>
          <p>金額與加碼以官方試算及審查為準，不以單一最高額推估。</p>
        </article>
        <article class="panel">
          <span class="eyebrow">已經申請過？</span>
          <h3>先確認舊案是否帶入</h3>
          <p>符合舊戶條件者可能直接帶入。先至官方查詢，避免重複申請。</p>
        </article>
      </div>
      <h2 class="section-title">你現在需要哪一種協助？</h2>
      <div class="action-grid">
        <RouterLink
          v-for="(item, i) in [
            {
              title: '我還沒申請',
              text: '了解資格、所得門檻與文件',
              path: 'calculator',
              icon: ClipboardCheck,
            },
            {
              title: '我擔心房屋不符合',
              text: '核對稅籍、用途與承租範圍',
              path: 'housing',
              icon: House,
            },
            {
              title: '我收到追繳通知',
              text: '整理通知、期限與諮詢問題',
              path: 'recovery',
              icon: CircleHelp,
            },
          ]"
          :key="item.path"
          :to="'/app/subsidy/' + item.path"
          class="action-card"
          ><span class="step-number">0{{ i + 1 }}</span
          ><component :is="item.icon" :size="25" />
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
          <ArrowRight :size="18"
        /></RouterLink>
      </div>
      <section class="panel faq">
        <h2>把常見問題說清楚</h2>
        <label for="faq-search">搜尋問題</label
        ><input
          id="faq-search"
          v-model="faqQuery"
          type="search"
          placeholder="例如：家庭成員、套房、審核"
        />
        <details v-for="f in filteredFaqs" :key="f.q">
          <summary>{{ f.q }}</summary>
          <p>{{ f.a }}</p>
          <a :href="f.source" target="_blank" rel="noopener noreferrer">查看官方說明 ↗</a>
        </details>
        <p v-if="!filteredFaqs.length">找不到對應說明，請查官方問答或撥打下方諮詢專線。</p>
      </section>
    </template>

    <div v-else-if="page === 'calculator'" class="content-grid">
      <section class="panel">
        <span class="eyebrow">01 / 申請前</span>
        <h2>資格與所得初步檢核</h2>
        <p>先了解可能需要確認的條件。不用輸入姓名、身分證或健保卡號。</p>
        <fieldset v-for="q in personalQuestions" :key="q.key">
          <legend>{{ q.title }}</legend>
          <p>{{ q.help }}</p>
          <div class="choices">
            <label v-for="o in options" :key="o.value"
              ><input v-model="form[q.key]" type="radio" :name="q.key" :value="o.value" />{{
                o.label
              }}</label
            >
          </div>
        </fieldset>
        <div class="form-grid">
          <label
            >租屋縣市<select v-model="form.city">
              <option value="">請選擇</option>
              <option v-for="(_, city) in incomeLimits" :key="city">{{ city }}</option>
            </select></label
          ><label
            >計入家庭成員人數<input
              v-model.number="form.people"
              type="number"
              min="1"
              step="1"
              placeholder="含本人" /></label
          ><label class="full"
            >家庭全年所得總額（元）<input
              v-model.number="form.annual"
              type="number"
              min="0"
              placeholder="請填全年所得，非單月薪資"
          /></label>
        </div>
        <p class="hint">
          家庭成員原則包含本人、配偶、本人或配偶的未成年子女（含胎兒）及受本人或配偶監護之人，不是所有同戶籍者或室友。子女權利義務等細節請依官方定義確認。
        </p>
        <p class="hint">
          採官方查調的所得口徑，含分離課稅所得。不要直接以實領薪資替代；應採計的所得年度請向承辦確認。
        </p>
        <label class="check-row"
          ><input v-model="form.expanded" type="checkbox" />符合新婚 2
          年內或育有未成年子女（含胎兒）家庭定義</label
        >
        <p class="hint">不確定婚育定義時，先使用一般門檻，再向承辦確認。</p>
      </section>
      <aside>
        <section class="panel result" aria-live="polite">
          <img
            class="topic-art"
            :src="eligibilityImage"
            alt="以身分、家庭與所得三個面向確認申請條件"
            width="1254"
            height="1254"
            decoding="async"
          />
          <ClipboardCheck :size="28" />
          <h2>你的初步結果</h2>
          <template v-if="income"
            ><span class="big-number"
              >{{ income.monthly.toLocaleString('zh-TW', { maximumFractionDigits: 2 }) }}
              <small>元／人／月</small></span
            >
            <p>全年所得 ÷ 12 ÷ 家庭人數</p>
            <p>門檻：須低於 {{ income.limit.toLocaleString() }} 元</p>
            <strong>{{
              income.passes ? '填入的所得低於門檻' : '填入的所得未低於門檻'
            }}</strong></template
          >
          <p v-else>請填妥縣市、有效的非負所得與正整數人數，才會顯示所得結果。</p>
          <p v-if="personalQuestions.some((q) => form[q.key] !== 'yes')">
            身分、房屋持有或住宅協助條件仍有未確認項目，請洽承辦釐清。
          </p>
          <p>所得結果不是完整資格認定；房屋、租約、租金上限與例外條件仍需查核。</p>
          <RouterLink class="primary" to="/app/subsidy/housing"
            >下一步：確認房屋 <ArrowRight :size="16" /></RouterLink
          ><a :href="sources.portal" target="_blank" rel="noopener noreferrer"
            >前往官方「房東(客)資格查詢專區」試算金額 ↗</a
          >
        </section>
      </aside>
    </div>

    <div v-else-if="page === 'housing'" class="content-grid">
      <section class="panel">
        <span class="eyebrow">02 / 房屋查證</span>
        <h2>這間房，可以申請租補嗎？</h2>
        <p>依文件逐項確認。不知道的項目選「不確定」，不要猜測。</p>
        <label class="check-row"
          ><input v-model="housing.old" type="checkbox" />我是 114 年核定、以相同租賃地址帶入 115
          年的舊戶</label
        >
        <fieldset v-for="q in housingQuestions" :key="q.key">
          <legend>{{ q.title }}</legend>
          <p>{{ q.help }}</p>
          <div class="choices">
            <label v-for="o in options" :key="o.value"
              ><input v-model="housing[q.key]" type="radio" :name="q.key" :value="o.value" />{{
                o.label
              }}</label
            >
          </div>
        </fieldset>
      </section>
      <aside>
        <section class="panel result" :class="housingResult.level" aria-live="polite">
          <img
            class="topic-art"
            :src="housingImage"
            alt="租客拿著文件核對承租房屋"
            width="1254"
            height="1254"
            loading="lazy"
            decoding="async"
          />
          <ShieldCheck :size="28" />
          <h2>{{ housingResult.title }}</h2>
          <p>{{ housingResult.detail }}</p>
          <h3>接下來可以這樣做</h3>
          <ol>
            <li>向房東索取能核對門牌、樓層的稅籍與建物文件。</li>
            <li>將租約地址、承租範圍與文件逐一比對。</li>
            <li>把不一致處交給房屋所在地承辦確認，保留回覆。</li>
          </ol>
          <a :href="sources.faq" target="_blank" rel="noopener noreferrer"
            >查看 115 年房屋條件與舊戶說明 ↗</a
          >
        </section>
        <section class="panel">
          <h3>還要留意</h3>
          <p>
            承租人是否為申請人、出租人或所有權人是否為家庭成員或直系親屬、租約用途、住宅類型及租金上限，均可能影響資格。
          </p>
          <RouterLink to="/app/subsidy/apply">繼續準備申請 →</RouterLink>
        </section>
      </aside>
    </div>

    <div v-else-if="page === 'apply' || page === 'upload'" class="content-grid">
      <section class="panel">
        <span class="eyebrow">03 / 文件與填表</span>
        <h2>帶著準備好的資料，再去申請</h2>
        <p>此處只勾選準備狀態，不收取或上傳證件。選擇適用情況，產生你的清單。</p>
        <div class="choices">
          <label><input v-model="needs.pregnancy" type="checkbox" />孕有胎兒</label
          ><label><input v-model="needs.disaster" type="checkbox" />災民</label
          ><label><input v-model="needs.alternate" type="checkbox" />無法使用本人帳戶</label>
        </div>
        <div class="checklist">
          <label v-for="doc in documents" :key="doc.id" class="document-row"
            ><input v-model="checked" type="checkbox" :value="doc.id" /><span
              ><small>{{ doc.tag }}</small
              ><strong>{{ doc.title }}</strong
              ><span>{{ doc.help }}</span></span
            ></label
          >
        </div>
        <p aria-live="polite">
          已準備 {{ prepared }} / {{ documents.length }} 項（自行勾選，未驗證內容）
        </p>
        <button class="primary" @click="exportChecklist">
          <FileText :size="16" />下載準備清單
        </button>
        <h3>房屋查證資料，另行留存</h3>
        <p>
          房屋稅單、建物謄本或合法證明可協助確認房屋條件，並非一律列為每人必上傳的基本文件。收到補件通知時，按承辦指定項目準備。
        </p>
        <h3>填表前再確認</h3>
        <ul>
          <li>基本資料、聯絡方式及戶籍／通訊地址。</li>
          <li>租屋地址、起訖日、月租金及房型。</li>
          <li>家庭成員資料及適用身分；不把所有室友都算進家庭。</li>
          <li>帳戶資料及切結內容；在官方頁面逐項核對。</li>
        </ul>
      </section>
      <aside>
        <section class="panel result">
          <img
            class="topic-art"
            :src="documentsImage"
            alt="整理租約與申請文件"
            width="1254"
            height="1254"
            loading="lazy"
            decoding="async"
          />
          <h2>政府網站的 5 個步驟</h2>
          <ol class="steps">
            <li>驗證身分</li>
            <li>填寫資料</li>
            <li>上傳文件</li>
            <li>核對資料並送出</li>
            <li>取得案件流水編號</li>
          </ol>
          <p>在官方完成送出才算提出申請；拿到編號也不代表審核通過。</p>
          <a class="primary" :href="sources.portal" target="_blank" rel="noopener noreferrer"
            >前往政府網站申請／補件 <ArrowUpRight :size="16"
          /></a>
        </section>
        <section class="panel">
          <h3>文件看不懂？</h3>
          <p>可使用 RentMate 合約 OCR 協助閱讀租約，再自行核對原文。</p>
          <RouterLink to="/app/contract/scanner">開啟合約 OCR →</RouterLink>
        </section>
      </aside>
    </div>

    <div v-else-if="page === 'progress'" class="content-grid">
      <section class="panel">
        <span class="eyebrow">04 / 申請後</span>
        <h2>進度與補件備忘</h2>
        <div class="empty-state">
          <ClipboardCheck :size="34" />
          <h3>尚未連結政府案件</h3>
          <p>RentMate 無法讀取你的官方審查進度。先到政府網站點選「進度查詢」，再依通知記下待辦。</p>
          <a class="primary" :href="sources.portal" target="_blank" rel="noopener noreferrer"
            >前往官方查詢／補件 <ArrowUpRight :size="16"
          /></a>
        </div>
        <form
          @submit.prevent="
            download(
              'RentMate｜本人手動記錄，非官方同步\n狀態：' +
                progress.status +
                '\n查詢日：' +
                progress.date +
                '\n通知所載補件期限：' +
                (progress.deadline || '無／待確認'),
              'RentMate-租補進度備忘.txt',
            )
          "
        >
          <h3>手動整理這次查詢</h3>
          <label
            >官方查詢或通知所示狀態<select v-model="progress.status" required>
              <option value="">請選擇</option>
              <option>已送出／待審查</option>
              <option>需補件</option>
              <option>已核定</option>
              <option>未核准</option>
              <option>停止補貼／收到追繳通知</option>
              <option>其他／需詢問承辦</option>
            </select></label
          >
          <div class="form-grid">
            <label>查詢日期<input v-model="progress.date" type="date" required /></label
            ><label
              >通知所載補件期限（如有）<input v-model="progress.deadline" type="date"
            /></label>
          </div>
          <button class="primary" type="submit">下載手動備忘</button>
        </form>
      </section>
      <aside>
        <section class="panel">
          <img
            class="topic-art"
            :src="progressImage"
            alt="核對通知、行事曆與申請進度"
            width="1254"
            height="1254"
            loading="lazy"
            decoding="async"
          />
          <h2>收到補件通知後</h2>
          <ol>
            <li>核對通知年度、案件與缺少項目。</li>
            <li>確認期限，不以 RentMate 預估取代通知。</li>
            <li>至政府網站選對年度補件入口，上傳指定文件。</li>
            <li>保留送出紀錄，再查官方是否收到。</li>
          </ol>
          <RouterLink to="/app/subsidy/upload">整理補件文件 →</RouterLink>
        </section>
        <section class="panel">
          <h3>搬家或續約了？</h3>
          <p>
            重新確認租約及房屋條件，向承辦確認需要的異動文件與期限。舊戶帶入不代表所有資料自動更新。
          </p>
          <RouterLink to="/app/subsidy/housing">重新確認房屋 →</RouterLink>
        </section>
      </aside>
    </div>

    <div v-else-if="page === 'recovery'" class="content-grid">
      <section class="panel">
        <span class="eyebrow">遇到問題，我們一起整理</span>
        <h2>收到追繳通知，先看清楚再處理</h2>
        <p>
          先保留通知全文與信封，確認發文機關、追繳期間及通知所列期限。不要只憑社群案例判斷自己的結果。
        </p>
        <div class="notice">
          <strong>歷年追繳與未來申請，是兩件需要分別確認的事</strong>
          <p>
            不同年度可能適用不同規定。現在的房屋條件或舊戶過渡安排，不能直接推論以前的款項是否應返還，也不能直接判斷是否必須搬家。
          </p>
        </div>
        <h3>建立諮詢筆記</h3>
        <p class="hint">欄位可先留白；內容僅留在目前頁面，下載後可帶去詢問承辦。</p>
        <div class="form-grid">
          <label>收到通知日期<input v-model="recovery.received" type="date" /></label
          ><label>通知所載處理期限<input v-model="recovery.deadline" type="date" /></label>
        </div>
        <label
          >通知寫的不符原因<textarea
            v-model="recovery.reason"
            rows="3"
            maxlength="2000"
            placeholder="例如：稅籍、建物用途、地址不符；不需貼入身分證或帳戶資料"
          /></label
        ><label
          >我想詢問的問題<textarea
            v-model="recovery.question"
            rows="3"
            maxlength="2000"
            placeholder="例如：查核的是哪個樓層？哪些年度？現在續租是否仍可申請？"
          /></label
        ><button class="primary" @click="exportRecovery">下載諮詢筆記與提問清單</button>
        <h3>和承辦確認這 5 件事</h3>
        <ol>
          <li>適用哪年度規定？依據哪筆稅籍、建物資料？</li>
          <li>不符期間與每月追繳金額如何計算？</li>
          <li>能否提供補充證據？通知所列救濟方式與期限為何？</li>
          <li>還款有困難時，可否申請分期？需要哪些文件？</li>
          <li>目前房屋是否影響後續補貼？搬家前應如何確認新屋？</li>
        </ol>
      </section>
      <aside>
        <section class="panel result">
          <h2>先把資料放在一起</h2>
          <ul>
            <li>追繳通知全文、信封與送達資料</li>
            <li>歷年核定函、租約及續約文件</li>
            <li>補貼入帳與租金付款紀錄</li>
            <li>稅籍、建物用途及樓層證明</li>
            <li>與房東及承辦往來紀錄</li>
          </ul>
          <p>
            若對處分有疑義，依通知所載救濟教示詢問承辦或法律扶助；請確認期限，不假設陳情或詢問會暫停期限。
          </p>
          <a class="primary" href="tel:0277298003">租補資格諮詢 02-7729-8003</a
          ><a :href="sources.faq" target="_blank" rel="noopener noreferrer">查看政府租補問答 ↗</a>
        </section>
      </aside>
    </div>

    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
    <footer class="sources">
      <div>
        <strong>資料來源與適用範圍</strong>
        <p>
          115 年度（2026）｜查核日期 2026/09/11。依你提供的官方申請網頁、24
          頁教學手冊與官方公告整理；如有修正，以最新官方規定及個案審查為準。
        </p>
        <a :href="sources.announcement" target="_blank" rel="noopener noreferrer"
          >115 年受理公告 ↗</a
        ><a :href="sources.faq" target="_blank" rel="noopener noreferrer">115 年官方問答 ↗</a
        ><a :href="sources.overview" target="_blank" rel="noopener noreferrer">政府申請指南 ↗</a>
      </div>
      <div>
        <strong>需要真人協助？</strong>
        <p>
          資格與法規：<a href="tel:0277298003">02-7729-8003</a
          ><br />個案與追繳：請聯絡通知上的地方承辦。
        </p>
        <small
          >本頁輸入及勾選僅供當次使用，離開頁面不保留；需要留存請下載。下載檔案不會送交政府。</small
        >
      </div>
    </footer>
  </div>
</template>

<style scoped>
.subsidy-guide {
  max-width: 1440px;
  margin: 0 auto;
  color: #25324a;
  font-size: 15px;
  line-height: 1.75;
  padding: 8px 0 32px;
}
.guide-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.09em;
  color: #625a99;
  font-weight: 700;
}
h1 {
  font-size: 29px;
  font-weight: 750;
  margin: 3px 0;
}
h2 {
  font-size: 23px;
  font-weight: 700;
  line-height: 1.5;
  margin: 8px 0 12px;
}
h3 {
  font-size: 17px;
  font-weight: 700;
  margin: 12px 0 8px;
}
p {
  color: #627088;
  margin: 8px 0 16px;
}
a {
  color: #5146a0;
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
.official-link,
.primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  padding: 11px 18px;
  font-weight: 600;
  font-size: 14px;
}
.official-link {
  background: white;
  border: 1px solid #dedfea;
}
.primary {
  background: #5146a0;
  color: white;
  border: 0;
  cursor: pointer;
  margin: 8px 0;
}
.primary:hover {
  background: #403685;
  text-decoration: none;
}
.guide-nav {
  display: flex;
  gap: 5px;
  overflow: auto;
  padding: 6px;
  background: white;
  border: 1px solid #e4e7ee;
  border-radius: 14px;
  margin-bottom: 18px;
}
.guide-nav a {
  white-space: nowrap;
  padding: 9px 18px;
  border-radius: 9px;
  color: #657188;
  font-weight: 600;
  font-size: 14px;
}
.guide-nav a.active {
  background: #5146a0;
  color: white;
}
.hero {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 40px;
  background: linear-gradient(115deg, #efedf9, #f8f9ff);
  border: 1px solid #e3def3;
  border-radius: 22px;
  padding: 36px 40px;
}
.hero h2 {
  font-size: 34px;
  letter-spacing: -0.02em;
}
.hero-note {
  align-self: center;
  justify-self: center;
  padding: 28px;
  border-radius: 18px;
  border: 1px solid #e0dcee;
  background: #ffffffb5;
  max-width: 330px;
  transform: rotate(-2deg);
}
.hero-note svg {
  color: #756bb0;
  margin-bottom: 20px;
}
.hero-note strong {
  display: block;
  font-size: 20px;
}
.hero-note p {
  font-size: 14px;
}
.meta-grid,
.action-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin: 22px 0;
}
.panel,
.action-card {
  padding: 26px;
  background: white;
  border: 1px solid #e2e6ef;
  border-radius: 17px;
}
.panel {
  margin-bottom: 20px;
}
.meta-grid .panel {
  margin: 0;
}
.meta-grid p {
  font-size: 13px;
  margin-bottom: 0;
}
.section-title {
  margin-top: 30px;
}
.action-card {
  position: relative;
  color: #25324a;
  transition:
    transform 0.15s,
    border-color 0.15s;
}
.action-card:hover {
  transform: translateY(-3px);
  border-color: #9c93c8;
  text-decoration: none;
}
.action-card svg {
  color: #7165af;
}
.action-card p {
  font-size: 14px;
}
.step-number {
  position: absolute;
  right: 23px;
  top: 18px;
  font-size: 26px;
  color: #d8d4ea;
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
  gap: 24px;
  align-items: start;
}
.result {
  background: #f6f5fc;
  border-color: #dcd7ef;
}
.result > a:not(.primary) {
  display: block;
  margin-top: 15px;
}
.result.risk,
.notice {
  background: #fff7ed;
  border-color: #f0d5b4;
}
.result.ready {
  background: #f0f8f6;
  border-color: #cde5dd;
}
.result.review {
  background: #f9f7ef;
}
.big-number {
  font-size: 28px;
  font-weight: 700;
  display: block;
  margin: 20px 0;
}
.big-number small {
  font-size: 13px;
  font-weight: 400;
}
fieldset {
  border: 0;
  border-top: 1px solid #e9ebf1;
  padding: 20px 0;
  margin-top: 18px;
  min-width: 0;
}
legend {
  float: left;
  width: 100%;
  font-weight: 650;
  margin-bottom: 5px;
}
fieldset p {
  clear: both;
  font-size: 13px;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.choices label,
.check-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 13px;
  border: 1px solid #e0e3ed;
  border-radius: 9px;
  background: #fafbfe;
  font-size: 14px;
  cursor: pointer;
}
input[type='radio'],
input[type='checkbox'] {
  accent-color: #5146a0;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 20px 0;
}
.full {
  grid-column: 1/-1;
}
label {
  display: block;
  font-weight: 500;
}
input:not([type='checkbox']):not([type='radio']),
select,
textarea {
  display: block;
  width: 100%;
  min-width: 0;
  border: 1px solid #d6dce7;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 7px 0 12px;
  background: white;
  font: inherit;
  color: #25324a;
}
textarea {
  resize: vertical;
}
.hint {
  font-size: 13px;
}
.document-row {
  display: flex;
  gap: 14px;
  padding: 19px 0;
  border-bottom: 1px solid #e6e9ef;
  cursor: pointer;
}
.document-row input {
  margin-top: 9px;
}
.document-row span span {
  display: block;
  font-size: 13px;
  color: #657188;
}
.document-row strong {
  display: block;
}
.document-row small {
  font-size: 11px;
  color: #675a9c;
}
.checklist {
  margin-top: 20px;
}
ul,
ol {
  padding-left: 22px;
  margin: 14px 0 24px;
  color: #59677d;
}
li {
  margin: 10px 0;
}
.steps li {
  padding: 9px;
  border-bottom: 1px solid #e3dfef;
}
.empty-state {
  text-align: center;
  padding: 26px 20px;
  border: 1px dashed #d4cce9;
  border-radius: 12px;
  margin: 20px 0;
}
.empty-state svg {
  margin: auto;
  color: #7d70b3;
}
.notice {
  padding: 18px;
  border: 1px solid #f0d5b4;
  border-radius: 12px;
  margin: 22px 0;
}
.notice p {
  margin-bottom: 0;
}
.faq {
  margin-top: 25px;
}
.faq label {
  font-size: 13px;
}
.faq input {
  max-width: 440px;
}
.faq details {
  border-top: 1px solid #e7e9ef;
  padding: 15px 0;
}
.faq summary {
  cursor: pointer;
  font-weight: 600;
}
.sources {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 30px;
  border-top: 1px solid #dedfe8;
  padding-top: 23px;
  margin-top: 24px;
  font-size: 12px;
  color: #657188;
}
.sources strong {
  font-size: 13px;
}
.sources a {
  margin-right: 16px;
}
.sources small {
  font-size: 12px;
}
.feedback {
  padding: 12px 18px;
  background: #edf7f1;
  border-radius: 8px;
}
a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid #9687dc;
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
  .hero {
    gap: 20px;
    padding: 28px;
  }
  .hero h2 {
    font-size: 28px;
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
  .action-grid {
    gap: 10px;
  }
  .action-card {
    padding: 20px;
  }
}
@media (max-width: 640px) {
  .guide-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
  .guide-heading p {
    margin-bottom: 5px;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .hero-note {
    justify-self: stretch;
    max-width: none;
    transform: none;
    padding: 20px;
  }
  .hero-note svg {
    display: none;
  }
  .action-grid,
  .form-grid,
  .sources {
    grid-template-columns: 1fr;
  }
  .panel {
    padding: 20px;
  }
  .guide-nav a {
    padding: 8px 12px;
  }
  .choices {
    gap: 7px;
  }
  .choices label {
    padding: 8px;
  }
  .subsidy-guide {
    font-size: 14px;
  }
  .hero h2 {
    font-size: 27px;
  }
  .sources {
    gap: 12px;
  }
}
.subsidy-guide {
  animation: guide-arrive 260ms ease-out both;
}
.illustrated-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 0;
  gap: 0;
  overflow: hidden;
  background: #fff;
}
.hero-art {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  align-self: center;
}
.hero-copy {
  grid-area: 1 / 1;
  z-index: 1;
  width: 43%;
  align-self: center;
  padding: 30px;
}
.hero-copy h2 {
  font-size: clamp(25px, 2.5vw, 34px);
}
.hero-copy .eyebrow {
  letter-spacing: 0;
}
.hero-note-below {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  column-gap: 16px;
  max-width: none;
  width: 100%;
  border: 0;
  border-top: 1px solid #ebe7f5;
  border-radius: 0;
  background: #f8f7fc;
  transform: none;
  padding: 18px 28px;
}
.hero-note-below svg {
  grid-row: 1 / 3;
  margin: 0;
}
.hero-note-below strong {
  font-size: 16px;
}
.hero-note-below p {
  grid-column: 2;
  margin: 3px 0 0;
  font-size: 13px;
}
.hero-note-below br {
  display: none;
}
.hero-note-below a {
  grid-column: 3;
  grid-row: 1 / 3;
  font-size: 14px;
}
.topic-art {
  display: block;
  width: 100%;
  max-height: 250px;
  object-fit: contain;
  border-radius: 12px;
  background: white;
  margin: 0 auto 22px;
}
.guide-nav a,
.choices label,
.check-row,
.document-row,
.primary,
.result {
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}
.choices label:has(input:checked),
.check-row:has(input:checked) {
  border-color: #8f80c7;
  background: #f0ecfa;
  box-shadow: 0 0 0 1px #8f80c720;
}
.document-row:has(input:checked) {
  background: #f2f8f5;
}
.document-row:has(input:checked) strong {
  color: #32765c;
}
.choices label:hover,
.check-row:hover {
  border-color: #b0a6d0;
}
@keyframes guide-arrive {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 900px) {
  .hero-copy {
    grid-area: 1 / 1;
    width: 100%;
    padding: 26px 26px 0;
  }
  .hero-art {
    grid-area: 2 / 1;
    max-height: 340px;
    object-fit: contain;
    object-position: right;
  }
  .hero-note-below {
    grid-row: 3;
  }
}
@media (max-width: 640px) {
  .hero-note-below {
    display: block;
    padding: 18px 22px;
  }
  .hero-note-below a {
    display: inline-block;
    margin-top: 8px;
  }
  .topic-art {
    max-height: 200px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .subsidy-guide {
    animation: none;
  }
  .guide-nav a,
  .choices label,
  .check-row,
  .document-row,
  .primary,
  .result,
  .action-card {
    transition: none;
  }
  .action-card:hover {
    transform: none;
  }
}
</style>
