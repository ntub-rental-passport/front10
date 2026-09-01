import {
  Bell,
  CheckSquare,
  ClipboardList,
  FileText,
  Home,
  PiggyBank,
  Trash2,
  User,
  Zap,
} from 'lucide-vue-next'
import type { Component } from 'vue'

export interface NavItem {
  icon: Component
  label: string
  path: string
}

export function useNavigation() {
  const navItems: NavItem[] = [
    { icon: Home, label: '首頁', path: '/app' },
    { icon: FileText, label: '合約 OCR', path: '/app/contract/scanner' },
    { icon: PiggyBank, label: '租金補貼', path: '/app/subsidy' },
    { icon: Trash2, label: '垃圾清運', path: '/app/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/app/handover' },
    { icon: Zap, label: '停電通報', path: '/app/outage' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
    { icon: Bell, label: '通知中心', path: '/app/notifications' },
  ]

  const accountItem: NavItem = { icon: User, label: '我的帳戶', path: '/app/account' }

  // 手機底部列專用項目（6 項）
  const mobileNavItems: NavItem[] = [
    { icon: Home, label: '首頁', path: '/app' },
    { icon: FileText, label: '合約 OCR', path: '/app/contract/scanner' },
    { icon: Trash2, label: '垃圾清運', path: '/app/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/app/handover' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
    { icon: User, label: '我的帳號', path: '/app/account' },
  ]

  return { navItems, accountItem, mobileNavItems }
}
