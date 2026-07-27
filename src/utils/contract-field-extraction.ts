import { extractContractFieldCandidates as extractSharedCandidates } from '@/shared/contract-field-extraction.js'

export type FieldConfidence = 'high' | 'medium' | 'low'

export interface ContractFieldCandidate {
  value: string
  sourceValue: string
  confidence: FieldConfidence
  addressResolution?: AddressResolution
}

export interface AddressResolutionPart {
  value: string
  source: 'google_ocr' | 'administrative_inference' | 'road_inference'
}

export interface AddressResolution {
  rawText: string
  normalizedAddress: string
  county: AddressResolutionPart | null
  district: AddressResolutionPart | null
  status: 'accepted' | 'inferred' | 'ambiguous' | 'conflict' | 'unresolved'
  confidence: FieldConfidence
  evidenceType: 'ocr_text' | 'administrative_inference' | 'road_inference'
  referenceDate: string | null
  warnings: string[]
}

export interface ContractFieldCandidates {
  landlord: ContractFieldCandidate
  tenant: ContractFieldCandidate
  address: ContractFieldCandidate
  startDate: ContractFieldCandidate
  endDate: ContractFieldCandidate
  rent: ContractFieldCandidate
  dueDay: ContractFieldCandidate
  deposit: ContractFieldCandidate
  penalty: ContractFieldCandidate
}

export function extractContractFieldCandidates(text: string): ContractFieldCandidates {
  return extractSharedCandidates(text) as ContractFieldCandidates
}
