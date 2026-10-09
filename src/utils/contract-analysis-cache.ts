const STORAGE_KEY = 'rentmate-contract-analysis-v1'

export type CachedContractAnalysis =
  | { state: 'ok'; ragRisks: unknown[]; aiRisks: unknown[] }
  | { state: 'failed'; message: string }

type Entry = { key: string; result: CachedContractAnalysis }
let memory: Entry | null = null

/** The key includes the review session and every input sent to the analysis API. */
export async function contractAnalysisKey(sessionId: string, requestBody: string): Promise<string> {
  const input = JSON.stringify([sessionId, requestBody])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function readContractAnalysis(key: string): CachedContractAnalysis | null {
  if (memory?.key === key) return memory.result
  try {
    const entry = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as Entry | null
    if (entry?.key !== key) return null
    const result = entry.result
    if ((result?.state === 'ok' && Array.isArray(result.ragRisks) && Array.isArray(result.aiRisks)) ||
        (result?.state === 'failed' && typeof result.message === 'string')) {
      memory = entry
      return result
    }
  } catch { /* Storage may be disabled or damaged; never treat it as a successful analysis. */ }
  return null
}

export function writeContractAnalysis(key: string, result: CachedContractAnalysis): void {
  memory = { key, result }
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory)) } catch { /* Retain SPA navigation fallback. */ }
}

export function clearContractAnalysis(): void {
  memory = null
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* Storage unavailable. */ }
}
