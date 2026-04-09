import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/src/components/layout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', component: () => import('@/src/pages/dashboard.vue') },
        { path: 'contract', component: () => import('@/src/pages/contract.vue') },
        { path: 'subsidy', component: () => import('@/src/pages/subsidy.vue') },
        { path: 'garbage', component: () => import('@/src/pages/garbage.vue') },
        { path: 'handover', component: () => import('@/src/pages/handover.vue') },
        { path: 'outage', component: () => import('@/src/pages/outage.vue') },
        { path: 'notes', component: () => import('@/src/pages/notes.vue') },
        { path: 'account', component: () => import('@/src/pages/account.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
