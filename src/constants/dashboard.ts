import type { AccentKey } from '@/src/mocks/dashboard-seed'

type AccentStyleConfig = {
  badgeTextClass: string
  dotClass: string
  progressClass: string
  borderClass: string
  selectedClass: string
  hoverBgClass: string
  hoverBorderClass: string
}

type AccentStyle = {
  badge: string
  dot: string
  progress: string
  border: string
  soft: string
  selected: string
  selectedText: string
  selectedSubText: string
  selectedTrack: string
  selectedDot: string
  hoverBg: string
  hoverBorder: string
  hoverText: string
  hoverSubText: string
  hoverTrack: string
  hoverDot: string
  headerBadge: string
  headerText: string
  headerSubText: string
}

export interface DefenseReminder {
  eyebrow: string
  title: string
  summary: string
  source: string
  actionLabel: string
  actionTo: string
}

export interface RiskTag {
  label: string
  count: number
  className: string
}

export interface FeaturedArticle {
  title: string
  category: string
  publishedAt: string
  to: string
}

function createAccentStyle(config: AccentStyleConfig): AccentStyle {
  return {
    badge: `border-indigo-200 bg-indigo-50 ${config.badgeTextClass}`,
    dot: config.dotClass,
    progress: config.progressClass,
    border: config.borderClass,
    soft: 'bg-indigo-50/80',
    selected: config.selectedClass,
    selectedText: 'text-white',
    selectedSubText: 'text-white/95',
    selectedTrack: 'bg-white/30',
    selectedDot: 'bg-white',
    hoverBg: config.hoverBgClass,
    hoverBorder: config.hoverBorderClass,
    hoverText: 'group-hover:text-white',
    hoverSubText: 'group-hover:text-white/95',
    hoverTrack: 'group-hover:bg-white/30',
    hoverDot: 'group-hover:bg-white',
    headerBadge: 'border-white/30 bg-white/20 text-white',
    headerText: 'text-white',
    headerSubText: 'text-white/80',
  }
}

export const accentStyles: Record<AccentKey, AccentStyle> = {
  sky: createAccentStyle({
    badgeTextClass: 'text-[#005CAF]',
    dotClass: 'bg-[#005CAF]',
    progressClass: 'bg-[#005CAF]',
    borderClass: 'border-[#005CAF]',
    selectedClass: 'border-[#005CAF]/50 bg-[#005CAF]/80',
    hoverBgClass: 'hover:bg-[#005CAF]/80',
    hoverBorderClass: 'hover:border-[#005CAF]',
  }),
  emerald: createAccentStyle({
    badgeTextClass: 'text-[#113285]',
    dotClass: 'bg-[#113285]',
    progressClass: 'bg-[#113285]',
    borderClass: 'border-[#113285]',
    selectedClass: 'border-[#113285]/50 bg-[#113285]/80',
    hoverBgClass: 'hover:bg-[#113285]/80',
    hoverBorderClass: 'hover:border-[#113285]',
  }),
  amber: createAccentStyle({
    badgeTextClass: 'text-[#5F2677]',
    dotClass: 'bg-[#5F2677]',
    progressClass: 'bg-[#5F2677]',
    borderClass: 'border-[#5F2677]',
    selectedClass: 'border-[#5F2677]/50 bg-[#5F2677]/80',
    hoverBgClass: 'hover:bg-[#5F2677]/80',
    hoverBorderClass: 'hover:border-[#5F2677]',
  }),
}

export const defenseReminder: DefenseReminder = {
  eyebrow: 'AI 租客防禦提醒',
  title: '租屋風險先看懂',
  summary:
    '把違約金、設備修繕、押金退還等常見爭議整理成更好理解的重點，幫你在簽約和付款前先避開地雷。',
  source: '內容整理自租賃實務常見情境與平台內部教學資料。',
  actionLabel: '查看完整指南',
  actionTo: '/app/contract',
}

export const riskTags: RiskTag[] = [
  { label: '違約金', count: 12, className: 'border-red-200 bg-red-50 text-red-600' },
  { label: '設備修繕', count: 8, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { label: '押金退還', count: 15, className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  { label: '租約續約', count: 10, className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  { label: '水電費用', count: 22, className: 'border-slate-200 bg-slate-100 text-slate-600' },
]

export const featuredArticles: FeaturedArticle[] = [
  {
    title: '提前解約要賠多少？租賃專法違約金上限解析',
    category: '違約金',
    publishedAt: '2026-04-05',
    to: '/app/contract',
  },
  {
    title: '冷氣壞了誰修？圖解修繕責任與存證信函寫法',
    category: '設備修繕',
    publishedAt: '2026-03-28',
    to: '/app/contract',
  },
  {
    title: '退租時被扣押金？這 3 種自然損耗房東不能扣',
    category: '押金退還',
    publishedAt: '2026-03-15',
    to: '/app/contract',
  },
]
