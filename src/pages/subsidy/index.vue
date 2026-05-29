<template>
  <div class="subsidy-clean-page">

    <div class="subsidy-top-hero-bar">
      <h1 class="hero-main-title">租金補貼</h1>
      <div class="hero-capsule-nav">
        <span class="nav-pill active">租補首頁</span>
        <span class="nav-pill">租補試算</span>
        <span class="nav-pill">租補申請</span>
        <span class="nav-pill">申請進度</span>
      </div>
    </div>

    <div class="subsidy-main-grid">

      <div class="left-content-flow">

        <div class="top-cards-row">
          <div class="meta-info-card">
            <div class="icon-round-box bg-purple">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <div class="meta-card-body">
              <h3>補貼金額</h3>
              <p>每月最高補貼 6,000 元，依各家庭經濟狀況核定。</p>
            </div>
          </div>

          <div class="meta-info-card">
            <div class="icon-round-box bg-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div class="meta-card-body">
              <h3>申請期限</h3>
              <p>每年 7-9 月開放線上申請，逾期不予受理。</p>
            </div>
          </div>

          <div class="meta-info-card">
            <div class="icon-round-box bg-green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div class="meta-card-body">
              <h3>核定時程</h3>
              <p>申請後約 2-3 個月完成審核，並以信函或簡訊通知。</p>
            </div>
          </div>
        </div>

        <div class="interactive-guide-panel">
          <div class="guide-panel-header">
            <h2>租屋補貼申辦指南</h2>
            <div class="pill-steps-wrapper">
              <span class="step-pill-node active">1 資格確認</span>
              <span class="step-pill-node">2 資料填寫</span>
              <span class="step-pill-node">3 文件上傳</span>
            </div>
          </div>

          <div class="checklist-wrapper-box">
            <h4 class="block-title">資格確認</h4>
            <p class="block-desc">請確認您符合以下所有申請資格，即可開始線上申請流程：</p>

            <div class="check-list-item">
              <input type="checkbox" id="c1" class="native-styled-check" v-model="checks.c1" />
              <label for="c1" class="check-label-txt">設籍於申請縣市且實際居住於租屋處</label>
            </div>

            <div class="check-list-item">
              <input type="checkbox" id="c2" class="native-styled-check" v-model="checks.c2" />
              <label for="c2" class="check-label-txt">年齡 20 歲以上（未成年已婚、安置及失依青年除外）</label>
            </div>

            <div class="check-list-item">
              <input type="checkbox" id="c3" class="native-styled-check" v-model="checks.c3" />
              <label for="c3" class="check-label-txt">家庭年所得符合規定（依各縣市公告標準核定）</label>
            </div>

            <div class="check-list-item">
              <input type="checkbox" id="c4" class="native-styled-check" v-model="checks.c4" />
              <label for="c4" class="check-label-txt">租屋契約合法有效</label>
            </div>

            <div class="check-list-item">
              <input type="checkbox" id="c5" class="native-styled-check" v-model="checks.c5" />
              <label for="c5" class="check-label-txt">家庭成員均無自有住宅且未重複領取其他住宅補貼</label>
            </div>
          </div>
        </div>

      </div>

      <div class="right-sidebar-flow">

        <div class="sidebar-info-card">
          <h3 class="card-section-title">今日數據摘要</h3>
          <div class="metric-flex-row">
            <span class="metric-label">👥 今日全台已申請</span>
            <span class="metric-value num-purple">1,240+</span>
          </div>
          <div class="metric-flex-row">
            <span class="metric-label">⏳ 平均審核天數</span>
            <span class="metric-value num-blue">45 天</span>
          </div>
          <div class="metric-flex-row">
            <span class="metric-label">✨ 今年通過率預估</span>
            <span class="metric-value num-green">92%</span>
          </div>
        </div>

        <div class="sidebar-info-card">
          <h3 class="card-section-title">應備文件齊全度檢視</h3>

          <div class="progress-item-cell">
            <div class="progress-meta-info"><span>租賃契約書影本</span> <span class="state-green">已準備</span></div>
            <div class="track-rail"><div class="track-fill fill-green" style="width: 100%;"></div></div>
          </div>

          <div class="progress-item-cell">
            <div class="progress-meta-info"><span>建物登記權狀影本</span> <span class="state-red">未就緒</span></div>
            <div class="track-rail"><div class="track-fill fill-red" style="width: 20%;"></div></div>
          </div>

          <div class="progress-item-cell">
            <div class="progress-meta-info"><span>身分證件與存折封面</span> <span class="state-green">已準備</span></div>
            <div class="track-rail"><div class="track-fill fill-green" style="width: 100%;"></div></div>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const checks = ref({
  c1: false,
  c2: false,
  c3: false,
  c4: false,
  c5: false
});
</script>

<style scoped>
/* 頁面整體內襯 */
.subsidy-clean-page { padding: 4px 0 32px 0; }

/* 🌟 還原你最喜歡的「租金補貼」大白條上方列樣式 */
.subsidy-top-hero-bar {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 24px;
}
.hero-main-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.hero-capsule-nav {
  background: #f1f5f9;
  padding: 4px;
  border-radius: 99px;
  display: flex;
  gap: 2px;
}
.nav-pill {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.2s;
}
.nav-pill.active {
  background: #4845A5;
  color: #ffffff;
  font-weight: 600;
}

/* 主格網佈局 (左寬右窄雙欄) */
.subsidy-main-grid { display: grid; grid-template-columns: 1fr 310px; gap: 24px; align-items: start; }

/* 三大張頂部小卡 */
.top-cards-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.meta-info-card { background: #ffffff; border-radius: 16px; padding: 18px; display: flex; gap: 14px; align-items: center; border: 1px solid #e2e8f0; }
.icon-round-box { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bg-purple { background: #f3e8ff; }
.bg-blue { background: #e0f2fe; }
.bg-green { background: #dcfce7; }

.meta-card-body h3 { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 4px 0; }
.meta-card-body p { font-size: 12px; color: #64748b; margin: 0; line-height: 1.4; }

/* 申辦指南主要白底卡片 */
.interactive-guide-panel { background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0; }
.guide-panel-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; }
.guide-panel-header h2 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }

/* 膠囊步驟條 */
.pill-steps-wrapper { background: #f1f5f9; padding: 4px; border-radius: 99px; display: flex; gap: 4px; }
.step-pill-node { padding: 4px 14px; font-size: 11px; font-weight: 500; color: #94a3b8; border-radius: 99px; }
.step-pill-node.active { background: #ffffff; color: #4845A5; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

.block-title { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 6px 0; }
.block-desc { font-size: 12px; color: #94a3b8; margin: 0 0 20px 0; }

/* 條目核取框 row */
.check-list-item { background: #f8fafc; padding: 14px 18px; border-radius: 12px; display: flex; align-items: center; gap: 14px; margin-bottom: 12px; border: 1px solid #f1f5f9; }
.native-styled-check { width: 16px; height: 16px; accent-color: #4845A5; cursor: pointer; flex-shrink: 0; }
.check-label-txt { font-size: 13px; color: #334155; font-weight: 500; cursor: pointer; line-height: 1.4; }

/* 右側邊欄數據卡片 */
.sidebar-info-card { background: #ffffff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
.sidebar-info-card:last-child { margin-bottom: 0; }
.card-section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0; }

.metric-flex-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f8fafc; }
.metric-flex-row:last-child { border-bottom: none; }
.metric-label { font-size: 13px; color: #475569; }
.metric-value { font-size: 18px; font-weight: 700; }
.num-purple { color: #6366f1; }
.num-blue { color: #3b82f6; }
.num-green { color: #22c55e; }

/* 右欄進度條 */
.progress-item-cell { margin-bottom: 16px; }
.progress-item-cell:last-child { margin-bottom: 0; }
.progress-meta-info { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 6px; font-weight: 500; }
.state-green { color: #22c55e; }
.state-red { color: #ef4444; }

.track-rail { background: #f1f5f9; height: 6px; border-radius: 99px; overflow: hidden; }
.track-fill { height: 100%; border-radius: 99px; }
.fill-green { background: #22c55e; }
.fill-red { background: #ef4444; }
</style>
