import { daysAgo, daysAhead } from './helpers'
import type { DeductionResponse, DepositStatus } from '@/src/utils/admin-deposit'

export interface Deduction {
  id: string
  label: string
  amount: number
  basis: string
  tenantResponse: DeductionResponse
}

export interface DepositCase {
  id: string
  address: string
  tenant: string
  depositAmount: number
  monthlyRent: number
  status: DepositStatus
  moveOutDate: string | null
  refundDueDate: string | null
  refundedAt: string | null
  deductions: Deduction[]
}

export function seedDepositCases(): DepositCase[] {
  return [
    // held：租期中，押金持有中，尚未退租
    {
      id: 'dc-1',
      address: '台北市萬華區西寧南路 60 號 4 樓',
      tenant: '家安',
      depositAmount: 45000,
      monthlyRent: 15000,
      status: 'held',
      moveOutDate: null,
      refundDueDate: null,
      refundedAt: null,
      deductions: [],
    },

    // inspecting：已退租，正在點交
    {
      id: 'dc-2',
      address: '新北市永和區永和路二段 88 號 5 樓',
      tenant: '詩涵',
      depositAmount: 24000,
      monthlyRent: 12000,
      status: 'inspecting',
      moveOutDate: daysAgo(3),
      refundDueDate: daysAhead(27),
      refundedAt: null,
      deductions: [],
    },

    // deduction_proposed：房東已提出扣款項目，超收案例
    {
      id: 'dc-3',
      address: '台中市北屯區崇德路二段 168 號 7 樓',
      tenant: '柏毅',
      depositAmount: 30000,
      monthlyRent: 10000,
      status: 'deduction_proposed',
      moveOutDate: daysAgo(10),
      refundDueDate: daysAhead(20),
      refundedAt: null,
      deductions: [
        { id: 'dd-1', label: '牆面釘孔修補', amount: 1500, basis: '牆面多處釘孔痕跡，依合約約定由押金扣除修補費用', tenantResponse: 'pending' },
        { id: 'dd-2', label: '未繳清水電費', amount: 800, basis: '退租當月水電費尚未結清', tenantResponse: 'pending' },
      ],
    },

    // disputed：租客對扣款項目有異議
    {
      id: 'dc-4',
      address: '高雄市苓雅區三多三路 100 號 9 樓',
      tenant: '雅筑',
      depositAmount: 26000,
      monthlyRent: 13000,
      status: 'disputed',
      moveOutDate: daysAgo(15),
      refundDueDate: daysAhead(15),
      refundedAt: null,
      deductions: [
        { id: 'dd-3', label: '冷氣清洗', amount: 2000, basis: '退租點交時冷氣濾網髒污，需專業清洗', tenantResponse: 'disputed' },
        { id: 'dd-4', label: '地板刮傷', amount: 3000, basis: '客廳木地板多處刮傷痕跡', tenantResponse: 'disputed' },
      ],
    },
    {
      id: 'dc-5',
      address: '台南市中西區民權路一段 55 號 3 樓',
      tenant: '冠宇',
      depositAmount: 18000,
      monthlyRent: 9000,
      status: 'disputed',
      moveOutDate: daysAgo(20),
      refundDueDate: daysAhead(10),
      refundedAt: null,
      deductions: [
        { id: 'dd-5', label: '遺失鑰匙補製', amount: 1200, basis: '退租時未歸還一組鑰匙，需補製鎖匙', tenantResponse: 'disputed' },
      ],
    },

    // agreed：租客已同意扣款項目，等待撥款
    {
      id: 'dc-6',
      address: '桃園市蘆竹區南崇路 200 號 6 樓',
      tenant: '芷萱',
      depositAmount: 22000,
      monthlyRent: 11000,
      status: 'agreed',
      moveOutDate: daysAgo(22),
      refundDueDate: daysAhead(8),
      refundedAt: null,
      deductions: [
        { id: 'dd-6', label: '牆面釘孔修補', amount: 1000, basis: '牆面釘孔痕跡修補費用', tenantResponse: 'agreed' },
      ],
    },

    // refunded：已完成退還
    {
      id: 'dc-7',
      address: '新竹市東區關新路 168 號 11 樓',
      tenant: '承儒',
      depositAmount: 28000,
      monthlyRent: 14000,
      status: 'refunded',
      moveOutDate: daysAgo(40),
      refundDueDate: daysAgo(10),
      refundedAt: daysAgo(12),
      deductions: [
        { id: 'dd-7', label: '地板刮傷', amount: 1500, basis: '主臥地板刮傷修補費用', tenantResponse: 'agreed' },
      ],
    },

    // overdue：逾 30 天應退還期限仍未退還
    {
      id: 'dc-8',
      address: '台北市松山區八德路四段 90 號 8 樓',
      tenant: '品睿',
      depositAmount: 32000,
      monthlyRent: 16000,
      status: 'overdue',
      moveOutDate: daysAgo(45),
      refundDueDate: daysAgo(15),
      refundedAt: null,
      deductions: [
        { id: 'dd-8', label: '未繳清水電費', amount: 2500, basis: '退租當月電費及瓦斯費尚未結清', tenantResponse: 'pending' },
      ],
    },
  ]
}
