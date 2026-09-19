<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import eligibility from '@/src/assets/subsidy/02-eligibility-check.png'
import housing from '@/src/assets/subsidy/03-housing-check.png'
import documents from '@/src/assets/subsidy/04-application-documents.png'
import progress from '@/src/assets/subsidy/05-progress-followup.png'

const steps = [
  {
    title: '先了解自己的資格',
    label: '資格檢核',
    image: eligibility,
    description: '從身分、家庭成員與所得開始，把不確定的條件逐一釐清。',
    action: '開始資格初步檢核',
    path: 'calculator',
  },
  {
    title: '也替租屋做一次確認',
    label: '房屋確認',
    image: housing,
    description: '核對實際承租範圍、稅籍與建物資料，知道還需要向房東或承辦確認什麼。',
    action: '確認房屋條件',
    path: 'housing',
  },
  {
    title: '把需要的文件準備好',
    label: '文件準備',
    image: documents,
    description: '依自己的情況整理租約、帳戶與證明文件，帶著清單到政府網站申請。',
    action: '建立文件清單',
    path: 'apply',
  },
  {
    title: '申請後，記得追蹤下一步',
    label: '進度追蹤',
    image: progress,
    description: '到官方確認進度，整理通知與補件期限，留下每次查詢的備忘。',
    action: '查看進度與補件指引',
    path: 'progress',
  },
]
const selected = ref(0)
const current = computed(() => steps[selected.value]!)
</script>

<template>
  <section class="journey" aria-labelledby="journey-title">
    <div class="journey-heading">
      <div>
        <span>YOUR NEXT STEP</span>
        <h2 id="journey-title">租補這條路，一步一步來</h2>
      </div>
      <p>點選步驟，看看現在可以做什麼。</p>
    </div>
    <div class="journey-options" role="group" aria-label="選擇租補準備步驟">
      <button
        v-for="(step, i) in steps"
        :key="step.path"
        type="button"
        :aria-pressed="selected === i"
        aria-controls="journey-preview"
        :class="{ selected: selected === i }"
        @click="selected = i"
      >
        <span>0{{ i + 1 }}</span
        >{{ step.label }}
      </button>
    </div>
    <div id="journey-preview" class="preview-frame">
      <Transition name="journey-switch" mode="out-in">
        <div :key="current.path" class="journey-preview">
          <img
            :src="current.image"
            alt=""
            width="1254"
            height="1254"
            loading="lazy"
            decoding="async"
          />
          <div class="journey-copy">
            <span class="step-count">STEP 0{{ selected + 1 }} / 04</span>
            <div aria-live="polite" aria-atomic="true">
              <h3>{{ current.title }}</h3>
              <p>{{ current.description }}</p>
            </div>
            <RouterLink :to="'/app/subsidy/' + current.path"
              >{{ current.action }} <ArrowRight :size="17"
            /></RouterLink>
          </div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.journey {
  background: #fff;
  border: 1px solid #e2e6ef;
  border-radius: 20px;
  padding: 28px;
  margin: 28px 0;
  color: #25324a;
}
.journey-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  margin-bottom: 22px;
}
.journey-heading span,
.step-count {
  font-size: 11px;
  color: #7567aa;
  letter-spacing: 0.12em;
  font-weight: 700;
}
.journey h2 {
  font-size: 23px;
  font-weight: 700;
  margin: 5px 0;
}
.journey p {
  color: #627088;
  font-size: 14px;
  line-height: 1.8;
}
.journey-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 6px;
  background: #f4f3f8;
  border-radius: 12px;
}
.journey-options button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 12px 8px;
  color: #657188;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  transition:
    background 0.2s,
    color 0.2s,
    box-shadow 0.2s;
}
.journey-options button span {
  font-size: 11px;
  color: #8e849f;
}
.journey-options button.selected {
  background: white;
  color: #5146a0;
  border-color: #e1dbf0;
  box-shadow: 0 3px 10px #5146a010;
}
.journey-options button:hover {
  background: #eeebf7;
}
.journey-options button.selected span {
  color: #5146a0;
}
.preview-frame {
  min-height: 330px;
}
.journey-preview {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  align-items: center;
  gap: 38px;
  min-height: 330px;
}
.journey-preview img {
  width: 100%;
  max-width: 310px;
  aspect-ratio: 1;
  object-fit: contain;
  justify-self: center;
}
.journey-copy {
  max-width: 490px;
  padding: 25px 0;
}
.journey h3 {
  font-size: 25px;
  font-weight: 700;
  margin: 10px 0;
}
.journey-copy p {
  margin: 12px 0 24px;
}
.journey-copy a {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #5146a0;
  font-weight: 600;
  text-decoration: none;
}
.journey-copy a:hover {
  text-decoration: underline;
}
.journey-switch-enter-active,
.journey-switch-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.journey-switch-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.journey-switch-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
button:focus-visible,
a:focus-visible {
  outline: 3px solid #9687dc;
  outline-offset: 3px;
}
@media (max-width: 640px) {
  .journey {
    padding: 20px;
  }
  .journey-heading {
    display: block;
  }
  .journey-heading p {
    margin-top: 8px;
  }
  .journey-options {
    grid-template-columns: 1fr 1fr;
  }
  .journey-preview {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .journey-preview img {
    max-width: 230px;
  }
  .journey-copy {
    padding: 0 0 15px;
    min-height: 210px;
  }
  .journey h3 {
    font-size: 22px;
  }
  .preview-frame {
    min-height: 440px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .journey-switch-enter-active,
  .journey-switch-leave-active,
  .journey-options button {
    transition: none;
  }
  .journey-switch-enter-from,
  .journey-switch-leave-to {
    transform: none;
  }
}
</style>
