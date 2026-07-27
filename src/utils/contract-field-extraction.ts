import { extractContractFieldCandidates as extractSharedCandidates } from '@/shared/contract-field-extraction.js'

export type FieldConfidence = 'high' | 'medium' | 'low'

export interface ContractFieldCandidate {
  value: string
  sourceValue: string
  confidence: FieldConfidence
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
