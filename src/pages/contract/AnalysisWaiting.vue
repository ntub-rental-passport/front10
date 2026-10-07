<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Check, FileSearch, FileText, Lightbulb, ShieldCheck, Sparkles } from 'lucide-vue-next'

defineProps<{ pageCount: number }>()
defineEmits<{ back: [] }>()
const elapsed = ref(0)
const started = Date.now()
const heading = ref<HTMLElement | null>(null)
const tips = [
  '分析完成後，可以展開風險項目，對照契約原文一起確認。',
  '押金、修繕與提前終止條款，都值得在簽約前仔細閱讀。',
  'AI 提醒是閱讀契約的輔助；有疑問的條款，可以再向專業人士確認。',
]
const tip = computed(() => tips[Math.floor(elapsed.value / 12) % tips.length])
const duration = computed(() => elapsed.value < 60 ? `${elapsed.value} 秒` : `${Math.floor(elapsed.value / 60)} 分 ${elapsed.value % 60} 秒`)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  heading.value?.focus({ preventScroll: true })
  timer = setInterval(() => { elapsed.value = Math.floor((Date.now() - started) / 1000) }, 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="analysis-waiting">
    <button type="button" class="waiting-back" @click="$emit('back')"><ArrowLeft :size="16" />返回欄位校對</button>
    <section class="waiting-card" aria-labelledby="waiting-title">
      <div class="waiting-grid" aria-hidden="true" />
      <span class="waiting-corner waiting-corner--top" aria-hidden="true" />
      <span class="waiting-corner waiting-corner--bottom" aria-hidden="true" />
      <div class="waiting-art" aria-hidden="true">
        <div class="waiting-orbit" />
        <div class="waiting-orbit waiting-orbit--inner" />
        <div class="waiting-document">
          <div class="waiting-document-header"><FileText :size="22" /><span>RENTMATE</span></div>
          <i /><i /><i /><i />
          <div class="waiting-document-check"><Check :size="15" /><span /><Check :size="15" /><span /></div>
          <div class="waiting-beam" />
        </div>
        <span class="waiting-badge waiting-badge--search"><FileSearch :size="23" /></span>
        <span class="waiting-badge waiting-badge--shield"><ShieldCheck :size="23" /></span>
        <Sparkles class="waiting-sparkle" :size="20" />
      </div>
      <div class="waiting-copy">
        <span class="waiting-eyebrow">RENTMATE · CONTRACT ANALYSIS</span>
        <h1 id="waiting-title" ref="heading" tabindex="-1">正在讀懂您的契約<span class="waiting-dots" aria-hidden="true"><i /><i /><i /></span></h1>
        <p role="status">{{ elapsed >= 45 ? '分析仍在進行中，複雜條款可能需要多一點時間。' : 'AI 正在分析契約內容，協助整理值得留意的條款。' }}</p>
        <div class="waiting-meta"><span>{{ pageCount }} 頁契約</span><span aria-hidden="true">·</span><span>已等待 {{ duration }}</span></div>
      </div>
      <ol class="waiting-steps" aria-label="契約分析狀態">
        <li class="is-done"><span><Check :size="16" /></span><div><strong>校對內容已帶入</strong><small>保留您確認過的文字與欄位</small></div></li>
        <li class="is-active" aria-current="step"><span><Sparkles :size="16" /></span><div><strong>等待 AI 分析回覆</strong><small>分析完成後自動開啟報告</small></div><i class="waiting-pulse" aria-hidden="true" /></li>
        <li><span><FileText :size="16" /></span><div><strong>檢視契約分析</strong><small>查看提醒，回到原文確認</small></div></li>
      </ol>
      <div class="waiting-tip"><Lightbulb :size="18" aria-hidden="true" /><div><span>等待時的小提醒</span><p>{{ tip }}</p></div></div>
      <p class="waiting-footnote">請保持此頁開啟。返回校對不會清除已儲存的內容。</p>
    </section>
  </main>
</template>

<style scoped>
@reference "../../index.css";
.analysis-waiting { @apply mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10; }
.waiting-back { @apply mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground; }
.waiting-back:focus-visible { @apply outline-2 outline-offset-4 outline-primary; }
.waiting-card { @apply relative isolate overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 pb-7 pt-8 shadow-sm sm:px-12 sm:pb-9 sm:pt-10; background: radial-gradient(ellipse at 50% 0%, #edf7f5 0%, #f6f8ff 38%, #fff 72%); }
.waiting-grid { @apply pointer-events-none absolute inset-x-0 top-0 -z-10 h-80; background-image: linear-gradient(#7c9c9b0c 1px, transparent 1px), linear-gradient(90deg, #7c9c9b0c 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(#000, transparent); }
.waiting-corner { @apply absolute h-7 w-7 border-teal-600/30; }
.waiting-corner--top { @apply left-5 top-5 rounded-tl-lg border-l-2 border-t-2; }
.waiting-corner--bottom { @apply bottom-5 right-5 rounded-br-lg border-b-2 border-r-2; }
.waiting-art { @apply relative mx-auto mb-6 flex h-52 w-64 items-center justify-center; }
.waiting-orbit { @apply absolute h-52 w-52 rounded-full border border-dashed border-teal-700/20; animation: orbit 32s linear infinite; }
.waiting-orbit--inner { @apply h-40 w-40 border-solid border-indigo-200/60; animation-direction: reverse; }
.waiting-document { @apply relative w-32 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-lg; transform: rotate(-6deg); animation: float 5s ease-in-out infinite; }
.waiting-document-header { @apply mb-4 flex items-center gap-1.5 text-teal-700; }
.waiting-document-header span { font-size: 8px; font-weight: 700; letter-spacing: .07em; }
.waiting-document > i { @apply mb-2 block h-1 rounded-full bg-slate-200; }
.waiting-document > i:nth-of-type(2) { width: 70%; }
.waiting-document > i:nth-of-type(4) { width: 80%; }
.waiting-document-check { @apply mt-4 grid grid-cols-[16px_1fr] items-center gap-2 text-teal-600; }
.waiting-document-check span { @apply h-1 rounded-full bg-teal-100; }
.waiting-beam { @apply absolute inset-x-0 top-0 h-12 border-b border-teal-400/80; background: linear-gradient(transparent, #5eead43b); animation: scan 3.5s ease-in-out infinite; }
.waiting-badge { @apply absolute flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-white/90 text-teal-700 shadow-md; animation: float 5s ease-in-out infinite reverse; }
.waiting-badge--search { @apply right-3 top-7; }
.waiting-badge--shield { @apply bottom-5 left-4 text-indigo-500; animation-delay: -2s; }
.waiting-sparkle { @apply absolute left-10 top-5 text-teal-500/70; }
.waiting-copy { @apply text-center; }
.waiting-eyebrow { @apply text-[10px] font-semibold tracking-[.2em] text-teal-700 sm:text-xs; }
.waiting-copy h1 { @apply mb-3 mt-3 text-xl font-semibold tracking-tight text-slate-900 outline-none sm:text-3xl; }
.waiting-copy > p { @apply text-sm leading-7 text-slate-500; }
.waiting-dots { @apply ml-1 inline-flex gap-1; }
.waiting-dots i { @apply h-1 w-1 rounded-full bg-teal-600; animation: breathe 1.5s ease-in-out infinite; }
.waiting-dots i:nth-child(2) { animation-delay: .2s; }
.waiting-dots i:nth-child(3) { animation-delay: .4s; }
.waiting-meta { @apply mt-4 flex justify-center gap-3 text-xs tabular-nums text-slate-500; }
.waiting-steps { @apply mx-auto my-7 grid max-w-xl gap-2; }
.waiting-steps li { @apply flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-slate-400; }
.waiting-steps li > span { @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200; }
.waiting-steps strong { @apply block text-sm font-medium; }
.waiting-steps small { @apply mt-1 block text-xs; }
.waiting-steps .is-done { @apply text-slate-600; }
.is-done > span { @apply border-teal-100 bg-teal-50 text-teal-600; }
.waiting-steps .is-active { @apply border-teal-100 bg-white/80 text-teal-800 shadow-sm; }
.is-active > span { @apply border-teal-100 bg-teal-50; }
.waiting-pulse { @apply ml-auto h-2 w-2 shrink-0 rounded-full bg-teal-500; animation: breathe 2s ease-in-out infinite; }
.waiting-tip { @apply mx-auto flex max-w-xl items-start gap-3 rounded-xl bg-slate-50 px-4 py-4 text-slate-500; }
.waiting-tip > svg { @apply mt-0.5 shrink-0 text-amber-600; }
.waiting-tip span { @apply text-xs font-medium text-slate-700; }
.waiting-tip p { @apply mt-1 min-h-10 text-xs leading-5; }
.waiting-footnote { @apply mx-auto mt-5 max-w-xl text-center text-xs leading-6 text-slate-400; }
@keyframes orbit { to { transform: rotate(360deg); } }
@keyframes float { 50% { translate: 0 -7px; } }
@keyframes scan { 0%, 100% { top: -48px; opacity: 0; } 15%, 80% { opacity: 1; } 90% { top: 100%; opacity: 0; } }
@keyframes breathe { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .waiting-beam { top: 45%; opacity: .6; } }
</style>
