import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { RentalContract } from '@/src/utils/dashboard-contract'
import { useDashboard } from './useDashboard'

const api = vi.hoisted(() => ({
  fetchDashboardContracts: vi.fn(), recordBillPayment: vi.fn(), reportLandlordPayment: vi.fn(),
  undoBillPayment: vi.fn(), saveBillUtilities: vi.fn(), downloadBillPaymentProof: vi.fn(),
}))
vi.mock('@/src/services/dashboardApi', () => api)

beforeEach(() => {
  vi.resetAllMocks()
  const contract: RentalContract = {
    id: '1', title: '測試租約', city: '', address: '', landlord: '', leaseMonths: 12,
    contractStart: '2026-01-01', contractEnd: '2026-12-31', dueDay: 5,
    electricityPlan: '', waterPlan: '', accent: 'sky', source: 'self',
    cycles: [{
      id: '12', periodIndex: 1, periodStart: '2026-01-01', periodEnd: '2026-01-31',
      dueDate: '2026-01-05', rentAmount: 20000, electricityAmount: 0, waterAmount: 0,
      paidAt: null, paymentMethod: null, paymentNote: '', paymentProofName: null,
      paymentProofStored: false,
    }],
  }
  api.fetchDashboardContracts.mockResolvedValue([contract])
  api.recordBillPayment.mockResolvedValue({ paidAt: '2026-01-03', paymentProofStored: true })
  vi.stubGlobal('document', { getElementById: vi.fn().mockReturnValue(null) })
})
afterEach(() => vi.unstubAllGlobals())

async function dashboard() {
  let state!: ReturnType<typeof useDashboard>
  await renderToString(createSSRApp({
    setup() {
      state = useDashboard()
      return () => null
    },
  }))
  await state.loadContracts()
  state.openPaymentDialog('12')
  return state
}

describe('自記帳單上傳憑證', () => {
  it('選檔時沿用 data URL 讀取並傳送 proof', async () => {
    const data = 'data:application/pdf;base64,JVBERi0='
    const read = vi.fn()
    vi.stubGlobal('FileReader', class {
      result = data
      onload?: () => void
      readAsDataURL(file: File) {
        read(file)
        this.onload?.()
      }
    })
    const state = await dashboard()
    const file = new File(['%PDF-'], '憑證.pdf', { type: 'application/pdf' })
    await state.submitPaymentRecord({
      paidAt: '2026-01-03', method: 'bank-transfer', note: '', proofName: file.name, proofFile: file,
    })
    expect(read).toHaveBeenCalledWith(file)
    expect(api.recordBillPayment).toHaveBeenCalledWith('12', {
      paid_at: '2026-01-03', payment_method: 'bank-transfer', payment_note: '',
      payment_proof_name: file.name, proof: { name: file.name, data },
    })
    expect(state.activeContractView.value?.cycles[0]?.cycle.paymentProofStored).toBe(true)
    expect(api.reportLandlordPayment).not.toHaveBeenCalled()
  })

  it('沒有選檔時保留檔名相容行為', async () => {
    const state = await dashboard()
    await state.submitPaymentRecord({
      paidAt: '2026-01-03', method: 'cash', note: '', proofName: '舊憑證.jpg',
    })
    expect(api.recordBillPayment).toHaveBeenCalledWith('12', {
      paid_at: '2026-01-03', payment_method: 'cash', payment_note: '', payment_proof_name: '舊憑證.jpg',
    })
  })

  it('下載失敗顯示錯誤訊息', async () => {
    const state = await dashboard()
    api.downloadBillPaymentProof.mockRejectedValue(new Error('憑證檔案暫時無法讀取。'))
    await state.downloadPaymentProof('12')
    expect(api.downloadBillPaymentProof).toHaveBeenCalledWith('12')
    expect(state.actionError.value).toBe('憑證檔案暫時無法讀取。')
  })
})
