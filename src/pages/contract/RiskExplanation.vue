<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink, FileText, MessageSquareText } from 'lucide-vue-next'
import type { ContractAssessment } from '@/src/utils/contract-risk'
import { explainContractRisk } from '@/src/utils/contract-risk-explanation'

const props = defineProps<{ risk: ContractAssessment }>()
const emit = defineEmits<{
  locate: [detail: { label: string; pageIndex: number | null; focusText: string }]
}>()
const explanation = computed(() => explainContractRisk(props.risk))
const evidence = computed(() =>
  props.risk.details?.length
    ? props.risk.details.filter((detail) => detail.focusText.trim())
    : props.risk.clause
      ? [{ label: '契約原文', pageIndex: props.risk.pageIndex, focusText: props.risk.clause }]
      : [],
)
// Unknown model citations remain labelled as candidates, never verified law.
function candidateLink(value: string) {
  const match = value.match(/https:\/\/[^\s]+/)?.[0]
  if (!match) return undefined
  try {
    const url = new URL(match)
    return ['law.moj.gov.tw', 'mojlaw.moj.gov.tw', 'www.ey.gov.tw'].includes(url.hostname)
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
</script>

<template>
  <div class="risk-explanation" :class="{ 'is-caution': risk.severity !== 'high' }">
    <section class="risk-explanation-section">
      <h4>
        {{
          risk.status === 'confirmed'
            ? risk.metrics?.length
              ? '問題條款與計算依據'
              : '問題條款'
            : '待核對條款'
        }}
        <small v-if="explanation.problemSummary">重點摘要</small>
      </h4>
      <ul v-if="explanation.problemSummary" class="risk-problem-list">
        <li>{{ explanation.problemSummary }}</li>
      </ul>
      <ol v-else-if="evidence.length" class="risk-problem-list">
        <li v-for="(detail, index) in evidence" :key="`${detail.pageIndex}-${index}`">
          <blockquote>{{ detail.focusText }}</blockquote>
        </li>
      </ol>
      <p v-else>尚無可定位的契約原文。請核對完整契約與附件後再判斷。</p>
    </section>

    <section class="risk-explanation-section">
      <h4>法條依據 </h4>
      <ul v-if="explanation.laws.length" class="risk-citation-list">
        <li v-for="law in explanation.laws" :key="law.label">
          <a :href="law.href" target="_blank" rel="noopener noreferrer">
            <FileText :size="16" aria-hidden="true" />{{ law.label
            }}<ExternalLink :size="13" aria-hidden="true" />
          </a>
          <p>{{ law.summary }}</p>
        </li>
      </ul>
      <template v-else>
        <p>此項尚未配對已核對的法條，不能僅憑 AI 說明認定違法。</p>
        <ul v-if="risk.legalBasis?.length" class="risk-citation-list risk-candidate-citations">
          <li v-for="basis in risk.legalBasis" :key="basis">
            <small>模型提供的候選依據・待核對</small>
            <a
              v-if="candidateLink(basis)"
              :href="candidateLink(basis)"
              target="_blank"
              rel="noopener noreferrer"
              >{{ basis.replace(/https?:\/\/\S+/g, '') || '查看候選來源' }}
              <ExternalLink :size="13"
            /></a>
            <p v-else>{{ basis }}</p>
          </li>
        </ul>
      </template>
    </section>

    <section class="risk-explanation-section">
      <h4>{{ risk.status === 'confirmed' ? '為什麼有風險' : '判斷條件與待確認原因' }}</h4>
      <p class="risk-reason">{{ explanation.reason }}</p>
    </section>

    <section class="risk-explanation-section">
      <h4>建議如何修改</h4>
      <ol class="risk-next-steps">
        <li v-for="step in explanation.steps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <section class="risk-negotiation-example">
      <h4><MessageSquareText :size="17" aria-hidden="true" />可以這樣跟房東說</h4>
      <p>{{ explanation.message }}</p>
    </section>

    <section class="risk-explanation-section risk-evidence-section">
      <h4>原始契約條文對照</h4>
      <ol v-if="evidence.length" class="risk-evidence-list">
        <li v-for="(detail, index) in evidence" :key="`${detail.pageIndex}-${index}`">
          <p>{{ detail.focusText }}</p>
          <button
            v-if="detail.pageIndex !== null"
            type="button"
            class="risk-page-button"
            @click="emit('locate', detail)"
          >
            第 {{ detail.pageIndex + 1 }} 頁 ↗
          </button>
          <small v-else>來源未定位</small>
        </li>
      </ol>
      <p v-else>尚無原文可定位，請先核對文件。</p>
      <div class="risk-meta">
        <span>{{ risk.sourceLabel }}</span
        ><span v-if="risk.groupLabel">{{ risk.groupLabel }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped src="./risk-explanation.css"></style>
