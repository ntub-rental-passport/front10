<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Check, ChevronRight, LayoutGrid, Sparkles } from 'lucide-vue-next'
import {
  planFeatures,
  subscriptionPlans,
  type PlanFeature,
  type PlanKey,
} from '@/src/utils/subscription-plans'

const props = defineProps<{ currentPlan: PlanKey }>()
const activeCategory = ref('all')
const expanded = ref<string | null>(null)
const planIndex = computed(() =>
  subscriptionPlans.landlord.findIndex((plan) => plan.key === props.currentPlan),
)
const features = planFeatures.landlord
const categories = [
  { key: 'all', label: '全部功能', icon: LayoutGrid },
  { key: 'included', label: '目前已包含', icon: Check },
  ...[...new Set(features.map((feature) => feature.group))].map((group) => ({
    key: group,
    label: group,
    icon: LayoutGrid,
  })),
]
// Free/basic capabilities remain available even when the paid extension is planned.
const isIncluded = (feature: PlanFeature) =>
  feature.values[planIndex.value] !== '不包含' && (props.currentPlan === 'free' || !feature.planned)
const visibleFeatures = computed(() =>
  features.filter(
    (feature) =>
      activeCategory.value === 'all' ||
      (activeCategory.value === 'included'
        ? isIncluded(feature)
        : feature.group === activeCategory.value),
  ),
)
watch([activeCategory, () => props.currentPlan], () => {
  expanded.value = null
})
</script>

<template>
  <section class="benefits" aria-labelledby="benefits-heading">
    <header class="benefits-heading">
      <Sparkles aria-hidden="true" />
      <div>
        <h2 id="benefits-heading">功能權益</h2>
        <p>查看目前方案包含的功能，以及其他方案的規劃權益。</p>
      </div>
      <span class="preview-label">方案內容展示</span>
    </header>
    <div class="benefits-body">
      <nav class="categories" aria-label="功能權益分類">
        <button
          v-for="category in categories"
          :key="category.key"
          type="button"
          :class="{ active: activeCategory === category.key }"
          :aria-pressed="activeCategory === category.key"
          aria-controls="benefit-list"
          @click="activeCategory = category.key"
        >
          <component :is="category.icon" aria-hidden="true" /><span>{{ category.label }}</span>
        </button>
      </nav>
      <div id="benefit-list" class="feature-list">
        <p class="sr-only" role="status">{{ visibleFeatures.length }} 項功能</p>
        <article
          v-for="feature in visibleFeatures"
          :key="feature.label"
          class="feature"
          :class="{ expanded: expanded === feature.label }"
        >
          <button
            type="button"
            class="feature-button"
            :aria-expanded="expanded === feature.label"
            :aria-controls="`benefit-${feature.label}`"
            @click="expanded = expanded === feature.label ? null : feature.label"
          >
            <span class="feature-icon"><LayoutGrid aria-hidden="true" /></span>
            <span class="feature-copy"
              ><strong>{{ feature.label }}</strong
              ><span>{{ feature.values[planIndex] }}</span></span
            >
            <span class="plan-badge" :class="{ available: isIncluded(feature) }">{{
              isIncluded(feature) ? '目前已包含' : feature.planned ? '規劃中' : '進階方案權益'
            }}</span>
            <ChevronRight class="feature-chevron" aria-hidden="true" />
          </button>
          <div
            :id="`benefit-${feature.label}`"
            v-show="expanded === feature.label"
            class="feature-detail"
          >
            <ul>
              <li v-for="(plan, index) in subscriptionPlans.landlord" :key="plan.key">
                <strong>{{ plan.name }}：</strong>{{ feature.values[index] }}
              </li>
            </ul>
            <p v-if="feature.planned">進階功能規劃中，以正式開放時的說明為準。</p>
            <RouterLink to="/landlord/subscription"
              >查看方案差異 <span aria-hidden="true">→</span></RouterLink
            >
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.benefits {
  overflow: hidden;
  border: 1px solid #e2dccf;
  border-radius: 22px;
  background: #fffdf8;
  color: #303b32;
}
.benefits-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid #e2dccf;
}
.benefits-heading > svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: #6a7d62;
}
.benefits-heading h2 {
  font-size: 17px;
  font-weight: 750;
}
.benefits-heading p {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.7;
  color: #85887d;
}
.preview-label {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: #85887d;
}
.benefits-body {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
}
.categories {
  padding: 12px;
  border-right: 1px solid #e2dccf;
}
.categories button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 12px;
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  color: #7b8176;
  transition: background 0.15s;
}
.categories button + button {
  margin-top: 3px;
}
.categories button:hover {
  background: #f1f4ed;
}
.categories button.active {
  background: #eaf1e8;
  color: #4f6a51;
  font-weight: 700;
}
.categories svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.feature + .feature {
  border-top: 1px solid #e2dccf;
}
.feature-button {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 78px;
  padding: 16px 22px;
  text-align: left;
  transition: background 0.15s;
}
.feature-button:hover,
.feature.expanded {
  background: #f6f8f1;
}
.feature-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #ebf1e7;
  color: #687f63;
}
.feature-icon svg {
  width: 18px;
  height: 18px;
}
.feature-copy {
  flex: 1;
  min-width: 0;
}
.feature-copy strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
}
.feature-copy > span {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.7;
  color: #85887d;
}
.plan-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 8px;
  background: #f1ede3;
  color: #85704e;
  font-size: 11px;
  white-space: nowrap;
}
.plan-badge.available {
  background: #eaf1e8;
  color: #506b52;
}
.feature-chevron {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: #94998d;
  transition: transform 0.15s;
}
.expanded .feature-chevron {
  transform: rotate(90deg);
}
.feature-detail {
  padding: 0 50px 20px 76px;
  font-size: 13px;
  line-height: 1.8;
  color: #65715f;
}
.feature-detail a {
  display: inline-block;
  margin-top: 10px;
  color: #4f7356;
  font-weight: 700;
}
.feature-detail a:hover {
  text-decoration: underline;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid #628367;
  outline-offset: -3px;
  border-radius: 8px;
}
@media (max-width: 700px) {
  .benefits-body {
    grid-template-columns: 1fr;
  }
  .categories {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid #e2dccf;
  }
  .categories button {
    width: auto;
    flex-shrink: 0;
    padding: 10px 12px;
  }
  .categories button + button {
    margin-top: 0;
  }
  .benefits-heading {
    padding: 18px;
  }
  .preview-label {
    display: none;
  }
  .feature-button {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 15px;
    gap: 8px 12px;
    padding: 16px;
  }
  .feature-icon {
    width: 36px;
    height: 36px;
    grid-column: 1;
    grid-row: 1;
  }
  .feature-copy {
    grid-column: 2;
    grid-row: 1;
  }
  .feature-chevron {
    grid-column: 3;
    grid-row: 1;
  }
  .plan-badge {
    grid-column: 2;
    justify-self: start;
  }
  .feature-detail {
    padding: 0 28px 18px 64px;
  }
}
</style>
