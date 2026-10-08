export type UtilityMethod = 'pending' | 'no_bill' | 'amount' | 'meter' | 'shared' | 'master' | 'included'
export type UtilityField = 'amount' | 'previous' | 'current' | 'rate' | 'total' | 'share' | 'shares' | 'main_usage' | 'sub_usage'
export type UtilityPayer = 'landlord_collect' | 'tenant_direct' | 'landlord_absorb'
export type UtilityEntry = { method: UtilityMethod; payer?: UtilityPayer; recorded_on?: string } & Partial<Record<UtilityField, number | string>>
export interface UtilityDetails { electricity: UtilityEntry; water: UtilityEntry }

export const utilityMethods: { value: UtilityMethod; label: string }[] = [
  { value: 'pending', label: '帳單待確認（金額未知）' },
  { value: 'no_bill', label: '本期不出帳（隔月收費，記 0 元）' },
  { value: 'amount', label: '帳單金額／固定費用' },
  { value: 'meter', label: '依抄表度數計費' },
  { value: 'shared', label: '平均／比例分攤' },
  { value: 'master', label: '主表＋分表拆分' },
  { value: 'included', label: '已含租金／由房東負擔' },
]
export const utilityFields: Record<UtilityMethod, UtilityField[]> = {
  pending: [], no_bill: [], included: [], amount: ['amount'],
  meter: ['previous', 'current', 'rate'], shared: ['total', 'share', 'shares'],
  master: ['previous', 'current', 'total', 'main_usage', 'sub_usage', 'share', 'shares'],
}
export const utilityFieldLabels: Record<UtilityField, string> = {
  amount: '本期金額（元）', previous: '上期讀數', current: '本期讀數', rate: '每度單價（元）',
  total: '整戶帳單總額（元）', share: '我的份數', shares: '全部份數（含我）',
  main_usage: '主表本期用量', sub_usage: '所有分表本期用量合計（含我）',
}

export function utilityPreview(entry: UtilityEntry): { amount: number | null; error: string } {
  if (entry.method === 'amount' && entry.payer && entry.payer !== 'landlord_collect') return { amount: 0, error: '' }
  if (entry.method === 'pending') return { amount: null, error: '' }
  if (entry.method === 'included' || entry.method === 'no_bill') return { amount: 0, error: '' }
  const values: Partial<Record<UtilityField, number>> = {}
  for (const key of utilityFields[entry.method]) {
    const raw = entry[key]
    const value = Number(raw)
    const positive = ['share', 'shares', 'main_usage'].includes(key)
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(value) || value < 0 ||
      (positive && value === 0) || value > (key === 'rate' ? 100_000 : 100_000_000)) {
      return { amount: null, error: `請填寫有效的${utilityFieldLabels[key]}。` }
    }
    values[key] = value
  }
  const n = (key: UtilityField) => values[key] ?? 0
  const usage = n('current') - n('previous')
  if (['meter', 'master'].includes(entry.method) && usage <= 0)
    return { amount: null, error: '本期讀數必須大於上期讀數，請確認是否抄錯或更換電表。' }
  if (['shared', 'master'].includes(entry.method) && n('share') > n('shares'))
    return { amount: null, error: '我的份數不可超過總份數。' }
  if (entry.method === 'master' && (n('sub_usage') < usage || n('sub_usage') > n('main_usage')))
    return { amount: null, error: '分表總用量須介於我的用量與主表用量之間。' }
  const amount = entry.method === 'amount' ? n('amount')
    : entry.method === 'meter' ? usage * n('rate')
    : entry.method === 'shared' ? n('total') * n('share') / n('shares')
    : n('total') * (usage + (n('main_usage') - n('sub_usage')) * n('share') / n('shares')) / n('main_usage')
  const rounded = Math.round(amount + Number.EPSILON * amount)
  return rounded > 100_000_000
    ? { amount: null, error: '計算金額超過上限。' }
    : { amount: rounded, error: '' }
}

export function cleanUtilityEntry(entry: UtilityEntry): UtilityEntry {
  return Object.fromEntries([
    ['method', entry.method], ...(entry.payer ? [['payer', entry.payer]] : []),
    ...(entry.recorded_on ? [['recorded_on', entry.recorded_on]] : []),
    ...utilityFields[entry.method].filter(key => entry[key] != null && !(entry.method === 'amount' && entry.payer && entry.payer !== 'landlord_collect')).map(key => [key, entry[key]]),
  ]) as UtilityEntry
}

export function utilityReceivable(entry: UtilityEntry): number | null {
  return entry.payer && entry.payer !== 'landlord_collect' ? 0 : utilityPreview(entry).amount
}

export interface UtilityContext { previous: string | number; rate: string | number | null; initial: boolean }

export function utilityPayerLabel(payer?: UtilityPayer): string | null {
  return payer === 'tenant_direct' ? '房客自繳' : payer === 'landlord_absorb' ? '房東負擔' : null
}
