import {
  BLANK,
  buildContractDocument as buildSharedContractDocument,
  documentValuesFromFieldReviews as sharedValuesFromFieldReviews,
  documentValuesFromRental as sharedValuesFromRental,
} from '@/shared/contract-document.js'
import type { ContractFieldReview } from '@/src/utils/contract-ocr'
import type { RentalPayload } from '@/src/utils/contract-rental-payload'

export { BLANK }

export type ContractDocumentSegment =
  | { kind: 'literal'; text: string }
  | { kind: 'value'; fieldId: string; label: string; text: string; filled: boolean }
  | {
      kind: 'choice'
      fieldId: string
      label: string
      options: Array<{ text: string; checked: boolean }>
    }

export type ContractDocumentLine =
  | { kind: 'text'; segments: ContractDocumentSegment[] }
  | { kind: 'aside'; subtitle?: string; note?: string }

export interface ContractDocumentSection {
  id: string
  title: string
  lines: ContractDocumentLine[]
}

export interface ContractDocument {
  sections: ContractDocumentSection[]
  filledCount: number
  blankCount: number
  blankLabels: string[]
}

export type ContractDocumentValues = Record<string, string>

export function buildContractDocument(values: ContractDocumentValues): ContractDocument {
  return buildSharedContractDocument(values) as ContractDocument
}

export function documentValuesFromFieldReviews(
  fieldReviews: Record<string, ContractFieldReview> | undefined,
): ContractDocumentValues {
  return sharedValuesFromFieldReviews(fieldReviews) as ContractDocumentValues
}

/** 後端回傳的 rentals 一列（個資欄位已解密成字串）。 */
export function documentValuesFromRental(
  rental: Partial<RentalPayload> | null,
): ContractDocumentValues {
  return sharedValuesFromRental(rental) as ContractDocumentValues
}
