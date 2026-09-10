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
import { syncSessionWithServer } from '@/src/composables/useAuth'
import { isMaintenanceActive, isMaintenanceBypassPath } from '@/src/utils/maintenance'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/src/pages/home.vue') },
    { path: '/maintenance', component: () => import('@/src/pages/maintenance.vue') },
    {
      path: '/login',
      alias: '/auth/login',
      component: () => import('@/src/pages/auth/login.vue'),
    },
    {
      path: '/register',
      alias: '/auth/register',
      component: () => import('@/src/pages/auth/register.vue'),
    },
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
        { path: 'properties', component: () => import('@/src/pages/landlord/properties.vue') },
        { path: 'tenants', component: () => import('@/src/pages/landlord/tenants.vue') },
        { path: 'finance', component: () => import('@/src/pages/landlord/finance.vue') },
        { path: 'maintenance', component: () => import('@/src/pages/landlord/maintenance.vue') },
        { path: 'contracts', component: () => import('@/src/pages/landlord/contracts.vue') },
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
        {
          path: 'tenant-guide',
          component: () => import('@/src/pages/dashboard/tenant-defense-guide/directory.vue'),
        },
        {
          path: 'contract',
          component: () => import('@/src/pages/dashboard/tenant-defense-guide/article.vue'),
        },
        {
          path: 'contract/air-conditioner-repair',
          component: () =>
            import('@/src/pages/dashboard/tenant-defense-guide/air-conditioner-repair/article.vue'),
        },
        {
          path: 'contract/electricity-fee',
          component: () =>
            import('@/src/pages/dashboard/tenant-defense-guide/electricity-fee/article.vue'),
        },
        { path: 'contract/scanner', component: () => import('@/src/pages/contract/index.vue') },
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
        { path: 'repairs', component: () => import('@/src/pages/repairs.vue') },
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

/*
 * 每次載入頁面只跟後端對一次帳。
 *
 * 不是每次導覽都對：那會讓站內切換頁面都多一次網路往返。
 * 一次就夠了 —— cookie 在同一次瀏覽期間失效的機率很低，
 * 真的失效時後續請求仍會回 401，各頁面自己有處理。
 */
let sessionSynced = false

router.beforeEach(async (to) => {
  // 只在「本機認為已登入」時才對帳；沒登入的話沒有東西可以驗，
  // 每個訪客都打一次 /me 只是浪費請求。
  if (!sessionSynced && getAuthSession()?.isAuthenticated) {
    sessionSynced = true
    await syncSessionWithServer()
  }

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

  if (
    session?.isAuthenticated &&
    ['/login', '/auth/login', '/register', '/auth/register'].includes(to.path)
  ) {
    return resolveRoleHome(session.role)
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
