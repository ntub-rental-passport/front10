import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/src/components/layout.vue'
import AdminLayout from '@/src/components/admin-layout.vue'
import LandlordLayout from '@/src/components/landlord-layout.vue'
import {
  getAuthSession,
  getPendingRegistration,
  isSessionExpired,
  needsNicknameSetup,
  resolveRoleHome,
  signOut,
  type AuthRole,
} from '@/src/composables/useAuth'
import { adminSettings } from '@/src/composables/admin/useAdminSettings'
import { canAdminAccessPath } from '@/src/utils/admin-rbac'
import { getCurrentAdminRole } from '@/src/composables/admin/useAdminRbac'
import { isMaintenanceActive, isMaintenanceBypassPath } from '@/src/utils/maintenance'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/src/pages/home.vue') },
    { path: '/maintenance', component: () => import('@/src/pages/maintenance.vue') },
    { path: '/login', component: () => import('@/src/pages/auth/login.vue') },
    { path: '/register', component: () => import('@/src/pages/auth/register.vue') },
    { path: '/staff-login', component: () => import('@/src/pages/auth/staff-login.vue') },
    { path: '/verify-email', component: () => import('@/src/pages/auth/verify-code.vue') },
    {
      path: '/welcome',
      component: () => import('@/src/pages/auth/welcome.vue'),
      meta: { requiresAuth: true, roles: ['tenant'] as AuthRole[] },
    },
    {
      path: '/landlord',
      component: LandlordLayout,
      meta: { requiresAuth: true, roles: ['landlord'] as AuthRole[] },
      children: [
        { path: '', component: () => import('@/src/pages/landlord/dashboard.vue') },
        { path: 'properties', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '房務管理', description: '管理棟別、房間、出租狀態與房屋設備。' } },
        { path: 'tenants', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '租客管理', description: '管理租客資料、租約狀態、房號與聯絡資訊。' } },
        { path: 'finance', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '帳務管理', description: '管理租金收款、待收款、逾期款項與日常支出。' } },
        { path: 'maintenance', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '報修管理', description: '追蹤租客報修、處理狀態、費用與完成紀錄。' } },
        { path: 'contracts', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '合約管理', description: '管理租約、附件、到期提醒與續約進度。' } },
        { path: 'settings', component: () => import('@/src/pages/management-placeholder.vue'), meta: { title: '房東設定', description: '設定收款提醒、通知方式與房東帳號偏好。' } },
      ],
    },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true, roles: ['admin'] as AuthRole[] },
      children: [
        { path: '', component: () => import('@/src/pages/admin/index.vue') },
        { path: 'users', component: () => import('@/src/pages/admin/users.vue') },
        { path: 'users/:id', component: () => import('@/src/pages/admin/user-detail.vue') },
        { path: 'maintenance-tickets', component: () => import('@/src/pages/admin/maintenance-tickets.vue') },
        { path: 'subsidy', component: () => import('@/src/pages/admin/subsidy.vue') },
        // 押金退還已併入使用者詳情，保留舊路徑避免既有書籤與稽核紀錄連結 404
        { path: 'deposits', redirect: '/admin/users' },
        { path: 'content', component: () => import('@/src/pages/admin/content.vue') },
        { path: 'notification-center', component: () => import('@/src/pages/admin/notification-center.vue') },
        { path: 'notifications', component: () => import('@/src/pages/admin/notifications.vue') },
        { path: 'notifications/:batchId', component: () => import('@/src/pages/admin/notifications-detail.vue') },
        { path: 'monitoring', component: () => import('@/src/pages/admin/monitoring.vue') },
        // AI 使用量已擴充為系統監控，保留舊路徑避免既有書籤 404
        { path: 'ai-usage', redirect: '/admin/monitoring' },
        // 已改名為 AI 使用量，保留舊路徑避免既有書籤 404
        { path: 'ai-quality', redirect: '/admin/monitoring' },
        // 訂閱與容量已併入使用者詳情，保留舊路徑避免既有書籤 404
        { path: 'subscription', redirect: '/admin/users' },
        { path: 'audit', component: () => import('@/src/pages/admin/audit.vue') },
        { path: 'settings', component: () => import('@/src/pages/admin/settings.vue') },
        // 已移除的後台模組（review、knowledge）留在書籤裡時，導回後台總覽而非公開首頁
        { path: ':pathMatch(.*)*', redirect: '/admin' },
      ],
    },
    {
      path: '/app',
      component: Layout,
      meta: { requiresAuth: true, roles: ['tenant'] as AuthRole[] },
      children: [
        { path: '', component: () => import('@/src/pages/dashboard.vue') },
        { path: 'contract', component: () => import('@/src/pages/contract/index.vue') },
        { path: 'contract-analysis', component: () => import('@/src/pages/contract/analysis.vue') },
        { path: 'contract/editor', component: () => import('@/src/pages/contract/editor.vue') },
        { path: 'contract/combined', component: () => import('@/src/pages/contract/combined.vue') },
        { path: 'subsidy', component: () => import('@/src/pages/subsidy/index.vue') },
        {
          path: 'subsidy/calculator',
          component: () => import('@/src/pages/subsidy/calculator.vue'),
        },
        {
          path: 'subsidy/apply',
          component: () => import('@/src/pages/subsidy/apply.vue'),
        },
        {
          path: 'subsidy/progress',
          component: () => import('@/src/pages/subsidy/progress.vue'),
        },
        {
          path: 'subsidy/upload',
          component: () => import('@/src/pages/subsidy/upload.vue'),
        },
        { path: 'garbage', component: () => import('@/src/pages/garbage/index.vue') },
        { path: 'handover', component: () => import('@/src/pages/handover/index.vue') },
        { path: 'handover/baseline', component: () => import('@/src/pages/handover/baseline.vue') },
        { path: 'handover/checkout', component: () => import('@/src/pages/handover/checkout.vue') },
        {
          path: 'outage',
          component: () => import('@/src/pages/outage/OutageShell.vue'),
          children: [
            { path: '', component: () => import('@/src/pages/outage/index.vue') },
            { path: 'actions', component: () => import('@/src/pages/outage/actions.vue') },
            {
              path: 'notifications',
              component: () => import('@/src/pages/outage/notifications.vue'),
            },
            { path: 'sources', component: () => import('@/src/pages/outage/sources.vue') },
          ],
        },
        {
          path: 'notes',
          component: () => import('@/src/components/NotesLayout.vue'),
          children: [
            { path: '', component: () => import('@/src/pages/notes/index.vue') },
            { path: 'personal', redirect: '/app/notes' },
            { path: 'roommates', component: () => import('@/src/pages/notes/roommates.vue') },
          ],
        },
        { path: 'account', component: () => import('@/src/pages/account.vue') },
        { path: 'notifications', component: () => import('@/src/pages/notifications.vue') },
      ],
    },
    { path: '/contract', redirect: '/app/contract' },
    { path: '/contract-analysis', redirect: '/app/contract-analysis' },
    { path: '/subsidy', redirect: '/app/subsidy' },
    { path: '/calculator', redirect: '/app/subsidy/calculator' },
    { path: '/apply', redirect: '/app/subsidy/apply' },
    { path: '/progress', redirect: '/app/subsidy/progress' },
    { path: '/upload', redirect: '/app/subsidy/upload' },
    { path: '/garbage', redirect: '/app/garbage' },
    { path: '/handover', redirect: '/app/handover' },
    { path: '/outage', redirect: '/app/outage' },
    { path: '/outage/actions', redirect: '/app/outage/actions' },
    { path: '/outage/notifications', redirect: '/app/outage/notifications' },
    { path: '/outage/sources', redirect: '/app/outage/sources' },
    { path: '/notes', redirect: '/app/notes' },
    { path: '/collaboration', redirect: '/app/notes' },
    { path: '/roommate-collaboration', redirect: '/app/notes/roommates' },
    { path: '/account', redirect: '/app/account' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  let session = getAuthSession()

  // Session 逾時：清掉再往下走，後續的 requiresAuth 檢查會自然導向登入頁
  if (isSessionExpired(session, adminSettings.value.sessionTimeoutMinutes)) {
    signOut()
    session = null
  }

  const maintenanceOn = isMaintenanceActive(adminSettings.value, new Date(), session?.email)
  if (maintenanceOn && !isMaintenanceBypassPath(to.path)) {
    return '/maintenance'
  }
  if (!maintenanceOn && to.path === '/maintenance') {
    return '/'
  }

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const pendingRegistration = getPendingRegistration()

  if (to.path === '/verify-email' && !pendingRegistration) {
    return '/register'
  }

  if (!requiresAuth) return true

  if (!session?.isAuthenticated) {
    return {
      path: to.path.startsWith('/admin') ? '/staff-login' : '/login',
      query: { redirect: to.fullPath },
    }
  }

  const protectedRecord = [...to.matched]
    .reverse()
    .find((record) => Array.isArray(record.meta.roles))
  const requiredRoles = protectedRecord?.meta.roles as AuthRole[] | undefined

  if (requiredRoles && !requiredRoles.includes(session.role)) {
    return resolveRoleHome(session.role)
  }

  if (to.path.startsWith('/admin') && !canAdminAccessPath(getCurrentAdminRole(), to.path)) {
    return '/admin'
  }

  if (to.path !== '/welcome' && needsNicknameSetup(session)) {
    return '/welcome'
  }

  if (to.path === '/welcome' && !needsNicknameSetup(session)) {
    return resolveRoleHome(session.role)
  }

  return true
})

export default router
