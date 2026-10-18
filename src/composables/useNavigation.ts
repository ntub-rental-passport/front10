import {
  Bell,
  CheckSquare,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  PiggyBank,
  Trash2,
  User,
  Wrench,
  Zap,
} from 'lucide-vue-next'
import type { Component } from 'vue'

export interface NavItem {
  icon: Component
  label: string
  path: string
}

export function isMobileNavItemActive(itemPath: string, currentPath: string): boolean {
  const path = currentPath.replace(/\/+$/, '')
  if (itemPath === '/app/contract/scanner') {
    return ['/app/contract/scanner', '/app/contract/editor', '/app/contract-analysis'].includes(path)
  }
  return path === itemPath || path.startsWith(`${itemPath}/`)
}

export function useNavigation() {
  const navItems: NavItem[] = [
    { icon: Home, label: '首頁', path: '/app' },
    { icon: FileText, label: '合約 OCR', path: '/app/contract/scanner' },
    { icon: PiggyBank, label: '租金補貼', path: '/app/subsidy' },
    { icon: Trash2, label: '垃圾清運', path: '/app/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/app/handover' },
    { icon: Wrench, label: '家具報修', path: '/app/repairs' },
    { icon: Zap, label: '停電通報', path: '/app/outage' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
    { icon: Bell, label: '通知中心', path: '/app/notifications' },
    { icon: CreditCard, label: '方案與訂閱', path: '/app/subscription' },
  ]

  const accountItem: NavItem = { icon: User, label: '我的帳戶', path: '/app/account' }

  // 手機底部列專用項目；首頁與帳戶由頂部列進入。
  const mobileNavItems: NavItem[] = [
    { icon: CheckSquare, label: '點交', path: '/app/handover' },
    { icon: FileText, label: '契約辨識', path: '/app/contract/scanner' },
    { icon: Trash2, label: '垃圾', path: '/app/garbage' },
    { icon: Wrench, label: '報修', path: '/app/repairs' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
  ]

  return { navItems, accountItem, mobileNavItems }
}
