import { describe, expect, it } from 'vitest'
import { isRepairOverdue, repairToMaintenance, repairMatchesTab } from './admin-repair'
import type { AdminRepairRecord } from '@/src/services/adminRepairApi'

const record = (patch: Partial<AdminRepairRecord> = {}): AdminRepairRecord => ({
  id: 'R-20261001-01', ticketNo: 'R-20261001-01', canonicalStatus: 'new', status: 'pending',
  tenantUserId: '1', landlordUserId: '2', tenant: '租客甲', landlord: '房東甲',
  address: '臺北市測試路', location: '浴室', equipment: '水電', description: '水管漏水',
  createdAt: '2026-10-01T00:00:00+08:00', updatedAt: '2026-10-01T00:00:00+08:00',
  timeline: [], photos: [], ...patch,
})

describe('真實報修的後台呈現', () => {
  it('保留三端同一編號與租客驗收階段', () => {
    const item = repairToMaintenance(record({ canonicalStatus: 'in_progress', status: 'inspection' }), 7)
    expect(item.id).toBe('R-20261001-01')
    expect(item.status).toBe('in_progress')
    expect(item.awaitingInspection).toBe(true)
    expect(item.tenantName).toBe('租客甲')
  })
  it('爭議與逾期可以同時篩選，不覆寫原始狀態', () => {
    const item = repairToMaintenance(record({ responsibilityAgreement: 'questioned', responsibilityQuestion: '責任不清楚' }), 7, new Date('2026-10-10T00:00:00+08:00'))
    expect(item.status).toBe('submitted')
    expect(repairMatchesTab(item, 'disputed')).toBe(true)
    expect(repairMatchesTab(item, 'overdue')).toBe(true)
    expect(repairMatchesTab(item, 'pending')).toBe(true)
  })
  it('門檻調高後逾期標籤消失，工單狀態不變', () => {
    const now = new Date('2026-10-10T00:00:00+08:00')
    expect(repairToMaintenance(record(), 7, now).overdue).toBe(true)
    expect(repairToMaintenance(record(), 10, now).overdue).toBe(false)
  })
  it('只有尚未開始處理的工單依建立時間判斷逾期', () => {
    const now = new Date('2026-10-10T00:00:00+08:00')
    for (const status of ['new', 'acknowledged'] as const) expect(isRepairOverdue(status, '2026-10-01T00:00:00+08:00', 7, now)).toBe(true)
    for (const status of ['scheduled', 'in_progress', 'completed', 'cancelled'] as const) expect(isRepairOverdue(status, '2026-10-01T00:00:00+08:00', 7, now)).toBe(false)
    expect(isRepairOverdue('new', '2026-10-03T00:00:00+08:00', 7, now)).toBe(false)
    expect(isRepairOverdue('new', 'invalid', 7, now)).toBe(false)
  })
  it('責任異議解決後留下歷史文字不會一直標爭議', () => {
    expect(repairToMaintenance(record({ responsibilityAgreement: 'agreed', responsibilityQuestion: '原先的疑問' }), 7).disputed).toBe(false)
  })
})
