import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/src/components/layout.vue'
import AdminLayout from '@/src/components/admin-layout.vue'
import {
  getAuthSession,
  getPendingRegistration,
  needsNicknameSetup,
  resolveRoleHome,
  type AuthRole,
} from '@/src/composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/src/pages/home.vue') },
    { path: '/login', component: () => import('@/src/pages/auth/login.vue') },
    { path: '/register', component: () => import('@/src/pages/auth/register.vue') },
    { path: '/verify-email', component: () => import('@/src/pages/auth/verify-code.vue') },
    {
      path: '/welcome',
      component: () => import('@/src/pages/auth/welcome.vue'),
      meta: { requiresAuth: true, role: 'user' as AuthRole },
    },
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

  const protectedRecord = [...to.matched]
    .reverse()
    .find((record) => typeof record.meta.role === 'string')
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
