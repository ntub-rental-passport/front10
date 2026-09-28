import {
  buildRentalPayload as buildSharedRentalPayload,
  describeMissingFields as describeSharedMissingFields,
} from '@/shared/contract-rental-mapping.js'
import type { ContractOcrResult } from '@/src/utils/contract-ocr'

/** `rentals` 一列的內容；欄位名稱與 backend/database.sql 一致。 */
export interface RentalPayload {
  review_date: string | null
  review_days: number | null
  has_landlord_review_signature: boolean
  has_tenant_review_signature: boolean
  address: string
  tax_id: string | null
  land_number: string | null
  building_number: string | null
  building_area: number | null
  has_annex_building: boolean
  annex_building_purpose: string | null
  annex_building_area: number | null
  rental_scope: 'entire' | 'partial'
  rental_room: string | null
  rental_area: number | null
  has_parking: boolean
  car_parking_count: number | null
  car_parking_type: string | null
  car_parking_floor: string | null
  car_parking_number: string | null
  motorcycle_parking_count: number | null
  motorcycle_parking_floor: string | null
  motorcycle_parking_number: string | null
  parking_usage_time: string | null
  has_equipment: boolean
  equipment_list: string | null
  start_date: string
  end_date: string
  handover_date: string | null
  rent_amount: number
  payment_interval_months: number
  payment_day: number
  payment_method: string | null
  bank_account: string | null
  total_periods: number
  deposit_months: number | null
  deposit_amount: number
  management_fee_rule: string | null
  water_fee_rule: string | null
  electricity_fee_type: string | null
  electricity_fee_rate: string | null
  gas_fee_rule: string | null
  network_fee_rule: string | null
  other_fees_rule: string | null
  abandoned_items_rule: string | null
  jurisdiction_court: string | null
  landlord_name: string | null
  landlord_national_id: string | null
  landlord_registered_address: string | null
  landlord_contact_address: string | null
  landlord_phone: string | null
  tenant_name: string | null
  tenant_national_id: string | null
  tenant_registered_address: string | null
  tenant_contact_address: string | null
  tenant_phone: string | null
  agent_name: string | null
  agent_national_id: string | null
  authorization_document: string | null
  sublease_consent: string | null
}

export interface MissingRentalField {
  id: string
  label: string
}

export interface RentalPayloadResult {
  /** 必填欄位有缺或期間不合理時為 null，此時不可送往後端。 */
  rental: RentalPayload | null
  missing: MissingRentalField[]
  warnings: string[]
}

export function buildRentalPayload(ocrResult: ContractOcrResult | null): RentalPayloadResult {
  return buildSharedRentalPayload(ocrResult) as RentalPayloadResult
}

export function describeMissingFields(missing: MissingRentalField[]): string {
  return describeSharedMissingFields(missing) as string
}
