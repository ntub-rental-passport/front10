import {
  Activity,
  FileText,
  Megaphone,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Send,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-vue-next'

/**
 * 側欄項目的圖示。
 *
 * ## 為什麼不放在 admin-rbac.ts 裡
 *
 * 那個檔案是純導覽資料，有自己的單元測試。把 Vue 元件塞進去會讓一份
 * 導覽項目的資料檔變成同時管外觀的檔案，之後很難只改一邊。
 *
 * ## 挑圖示的兩個判斷
 *
 * 「通知管理」與「通知中心」語意很接近，容易挑成同一個。前者是**寄出**
 * （批次、範本），後者是**收到**（有未讀數）—— 所以 Send 對 Inbox。
 *
 * 「稽核紀錄」用 ScrollText 而不是 History：History 是時鐘箭頭，容易被讀成
 * 「還原 / 復原」，但稽核紀錄是唯讀的。
 *
 * 「內容管理」用 Megaphone 而不是 FileText：它管的是公告與首頁輪播，
 * 而總覽的「發布公告」按鈕也是 Megaphone —— 指向同一件事就該長一樣。
 *
 * 側欄永遠是展開的、標籤一直看得見，所以圖示是掃視的錨點而不是唯一的
 * 辨識依據。認不出來的路徑退回一個中性圖示，不要讓側欄破一個洞。
 *
 * 這是唯一一份圖示對照表，避免不同導覽入口漂移成兩套圖示。
 */
const ICONS: Record<string, LucideIcon> = {
  '/admin': LayoutDashboard,
  '/admin/users': Users,
  '/admin/maintenance-tickets': Wrench,
  '/admin/content': Megaphone,
  '/admin/notifications': Send,
  '/admin/notification-center': Inbox,
  '/admin/monitoring': Activity,
  '/admin/audit': ScrollText,
  '/admin/settings': Settings,
}

export function navIcon(path: string): LucideIcon {
  return ICONS[path] ?? FileText
}
