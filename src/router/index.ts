import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/src/components/layout.vue'
import AdminLayout from '@/src/components/admin-layout.vue'
import { getAuthSession, getPendingRegistration, needsNicknameSetup, resolveRoleHome, type AuthRole } from '@/src/composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/src/pages/home.vue') },
    { path: '/login', component: () => import('@/src/pages/login.vue') },
    { path: '/register', component: () => import('@/src/pages/register.vue') },
    { path: '/verify-email', component: () => import('@/src/pages/verify-code.vue') },
    { path: '/welcome', component: () => import('@/src/pages/welcome.vue'), meta: { requiresAuth: true, role: 'user' as AuthRole } },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true, role: 'admin' as AuthRole },
      children: [{ path: '', component: () => import('@/src/pages/admin-dashboard.vue') }],
    },
    {
      path: '/app',
      component: Layout,
      meta: { requiresAuth: true, role: 'user' as AuthRole },
      children: [
        { path: '', component: () => import('@/src/pages/dashboard.vue') },
        { path: 'contract', component: () => import('@/src/pages/contract.vue') },
        { path: 'subsidy', component: () => import('@/src/pages/subsidy.vue') },
        { path: 'garbage', component: () => import('@/src/pages/garbage.vue') },
        { path: 'handover', component: () => import('@/src/pages/handover.vue') },
        { path: 'handover/baseline', component: () => import('@/src/pages/handover-baseline.vue') },
        { path: 'handover/checkout', component: () => import('@/src/pages/handover-checkout.vue') },
        { path: 'outage', component: () => import('@/src/pages/outage.vue') },
        { path: 'notes', component: () => import('@/src/pages/notes.vue') },
        { path: 'account', component: () => import('@/src/pages/account.vue') },
      ],
    },
    { path: '/contract', redirect: '/app/contract' },
    { path: '/subsidy', redirect: '/app/subsidy' },
    { path: '/garbage', redirect: '/app/garbage' },
    { path: '/handover', redirect: '/app/handover' },
    { path: '/outage', redirect: '/app/outage' },
    { path: '/notes', redirect: '/app/notes' },
    { path: '/account', redirect: '/app/account' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
    {
    path: '/contract-analysis',
    name: 'ContractAnalysis',
    // 這裡使用動態載入 (Lazy Loading) 的方式
    component: () => import('../pages/contract-analysis.vue'),
    meta: { title: '契約分析報告' }
  },
  ],
})

router.beforeEach((to) => {
  const session = getAuthSession()
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const pendingRegistration = getPendingRegistration()

  if (to.path === '/verify-email' && !pendingRegistration) {
    return '/register'
  }

  if (!requiresAuth) return true

  if (!session?.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  const protectedRecord = [...to.matched].reverse().find((record) => typeof record.meta.role === 'string')
  const requiredRole = protectedRecord?.meta.role as AuthRole | undefined

  if (requiredRole && session.role !== requiredRole) {
    return resolveRoleHome(session.role)
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
