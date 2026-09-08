import type { ContractFieldReview, ContractOcrResult } from '@/src/utils/contract-ocr'
import {
  extractContractFieldCandidates,
  type ContractFieldCandidate,
  type FieldConfidence,
} from '@/src/utils/contract-field-extraction'

export interface ContractAutofillField {
  key: keyof ContractAutofillData
  label: string
  value: string | number
  confidence: FieldConfidence
}

export interface ContractAutofillData {
  tenantName: string
  tenantPhone: string
  tenantNationalId: string
  tenantAddress: string
  propertyAddress: string
  roomNumber: string
  leaseStart: string
  leaseEnd: string
  monthlyRent: number
  depositAmount: number
  paymentDay: number
  paymentFrequency: 'monthly' | 'bimonthly' | 'quarterly'
  sourceFileName: string
  sourceText: string
  fields: ContractAutofillField[]
  missingLabels: string[]
  reviewCount: number
}

const fieldLabels: Array<[keyof ContractAutofillData, string]> = [
  ['tenantName', '租客姓名'],
  ['tenantPhone', '聯絡電話'],
  ['tenantNationalId', '身分證字號'],
  ['tenantAddress', '聯絡地址'],
  ['propertyAddress', '租屋地址'],
  ['roomNumber', '房號'],
  ['leaseStart', '租約開始日'],
  ['leaseEnd', '租約結束日'],
  ['monthlyRent', '每期月租'],
  ['depositAmount', '押金'],
  ['paymentDay', '繳租日'],
]

function candidateFromReview(
  review: ContractFieldReview | undefined,
  fallback: ContractFieldCandidate,
): ContractFieldCandidate {
  const value = review?.value?.trim()
  if (!value) return fallback
  return {
    value,
    sourceValue: review.sourceValue?.trim() || value,
    confidence: review.confidence,
  }
}

function parseMoney(value: string): number {
  const digits = value.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

function parsePaymentDay(value: string): number {
  if (/月底|月末/.test(value)) return 31
  const match = value.match(/([0-9]{1,2})\s*日/)
  const day = Number(match?.[1] ?? 0)
  return day >= 1 && day <= 31 ? day : 5
}

function parsePaymentFrequency(value: string): ContractAutofillData['paymentFrequency'] {
  const months = Number(value.match(/([0-9]+)/)?.[1] ?? 1)
  if (months === 2) return 'bimonthly'
  if (months >= 3) return 'quarterly'
  return 'monthly'
}

/** 將 OCR 的民國或西元日期轉成 date input 可接受的 YYYY-MM-DD。 */
export function normalizeContractDate(value: string): string {
  const normalized = value.replace(/[年月.／]/g, '/').replace(/日/g, '').replace(/\s+/g, '')
  const roc = normalized.match(/(民國)?([0-9]{2,4})\/([0-9]{1,2})\/([0-9]{1,2})/)
  if (roc) {
    const rawYear = Number(roc[2])
    const year = roc[1] || rawYear < 1000 ? rawYear + 1911 : rawYear
    const month = Number(roc[3])
    const day = Number(roc[4])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return ''
}

function roomFromText(value: string): string {
  const match = value.match(/(?:第\s*)?([0-9０-９A-Za-z一二三四五六七八九十-]+)\s*(?:房|室)/)
  return match?.[1]?.replaceAll(' ', '') ?? ''
}

export function buildContractAutofillData(result: ContractOcrResult): ContractAutofillData {
  const extracted = extractContractFieldCandidates(result.text)
  const reviews = result.fieldReviews ?? {}
  const tenant = candidateFromReview(reviews.tenant, extracted.tenant)
  const tenantPhone = candidateFromReview(reviews.tenant_phone, extracted.tenant_phone)
  const tenantNationalId = candidateFromReview(reviews.tenant_id, extracted.tenant_id)
  const tenantAddress = candidateFromReview(
    reviews.tenant_mailing_address ?? reviews.tenant_registered_address,
    extracted.tenant_mailing_address.value
      ? extracted.tenant_mailing_address
      : extracted.tenant_registered_address,
  )
  const propertyAddress = candidateFromReview(reviews.address, extracted.address)
  const rentalRoom = candidateFromReview(reviews.rental_room, extracted.rental_room)
  const leaseStart = candidateFromReview(reviews.start_date, extracted.startDate)
  const leaseEnd = candidateFromReview(reviews.end_date, extracted.endDate)
  const rent = candidateFromReview(reviews.rent, extracted.rent)
  const deposit = candidateFromReview(reviews.deposit, extracted.deposit)
  const dueDay = candidateFromReview(reviews.due_day, extracted.dueDay)
  const paymentPeriod = candidateFromReview(reviews.payment_period, extracted.payment_period)

  const data: ContractAutofillData = {
    tenantName: tenant.value,
    tenantPhone: tenantPhone.value,
    tenantNationalId: tenantNationalId.value,
    tenantAddress: tenantAddress.value,
    propertyAddress: propertyAddress.value,
    roomNumber: roomFromText(rentalRoom.value),
    leaseStart: normalizeContractDate(leaseStart.value),
    leaseEnd: normalizeContractDate(leaseEnd.value),
    monthlyRent: parseMoney(rent.value),
    depositAmount: parseMoney(deposit.value),
    paymentDay: parsePaymentDay(dueDay.value),
    paymentFrequency: parsePaymentFrequency(paymentPeriod.value),
    sourceFileName: result.fileName,
    sourceText: result.text,
    fields: [],
    missingLabels: [],
    reviewCount: 0,
  }

  const confidenceByKey: Partial<Record<keyof ContractAutofillData, FieldConfidence>> = {
    tenantName: tenant.confidence,
    tenantPhone: tenantPhone.confidence,
    tenantNationalId: tenantNationalId.confidence,
    tenantAddress: tenantAddress.confidence,
    propertyAddress: propertyAddress.confidence,
    roomNumber: rentalRoom.confidence,
    leaseStart: leaseStart.confidence,
    leaseEnd: leaseEnd.confidence,
    monthlyRent: rent.confidence,
    depositAmount: deposit.confidence,
    paymentDay: dueDay.confidence,
  }

  data.fields = fieldLabels
    .filter(([key]) => {
      const value = data[key]
      return typeof value === 'number' ? value > 0 : Boolean(value)
    })
    .map(([key, label]) => ({
      key,
      label,
      value: data[key] as string | number,
      confidence: confidenceByKey[key] ?? 'low',
    }))
  data.missingLabels = fieldLabels
    .filter(([key]) => {
      const value = data[key]
      return typeof value === 'number' ? value <= 0 : !value
    })
    .map(([, label]) => label)
  data.reviewCount = data.fields.filter((field) => field.confidence !== 'high').length
  return data
}
