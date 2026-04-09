import { Home, FileText, PiggyBank, Trash2, CheckSquare, Zap, ClipboardList, User } from 'lucide-vue-next'
import type { Component } from 'vue'

export interface NavItem {
  icon: Component
  label: string
  path: string
}

export function useNavigation() {
  const navItems: NavItem[] = [
    { icon: Home, label: '總覽', path: '/' },
    { icon: FileText, label: '契約分析', path: '/contract' },
    { icon: PiggyBank, label: '租金補貼', path: '/subsidy' },
    { icon: Trash2, label: '垃圾清運', path: '/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/handover' },
    { icon: Zap, label: '停水停電', path: '/outage' },
    { icon: ClipboardList, label: '記事板', path: '/notes' },
    { icon: User, label: '我的帳戶', path: '/account' },
  ]

  return { navItems }
}
