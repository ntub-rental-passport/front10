export interface ContractImportMetadata {
  tenantId: number
  leaseId: number | null
  contractId: string | null
  sourceFileName: string
  importedByOcr: boolean
  importedAt: string
}

const STORAGE_KEY = 'rentmate-landlord-contract-imports-v1'
export const CONTRACTS_UPDATED_EVENT = 'rentmate:landlord-contracts-updated'

function readAll(): ContractImportMetadata[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveContractImportMetadata(metadata: ContractImportMetadata): void {
  if (typeof window === 'undefined') return
  const items = readAll()
  const key = metadata.leaseId ? `lease:${metadata.leaseId}` : `tenant:${metadata.tenantId}`
  const next = items.filter((item) =>
    (item.leaseId ? `lease:${item.leaseId}` : `tenant:${item.tenantId}`) !== key,
  )
  next.push(metadata)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(CONTRACTS_UPDATED_EVENT))
}

export function findContractImportMetadata(
  tenantId: number,
  leaseId: number | null,
): ContractImportMetadata | null {
  return readAll().find((item) =>
    leaseId ? item.leaseId === leaseId : item.tenantId === tenantId,
  ) ?? null
}

export function notifyContractsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONTRACTS_UPDATED_EVENT))
  }
}
