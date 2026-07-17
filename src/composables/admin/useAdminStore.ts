import { ref, watch, type Ref } from 'vue'

const STORAGE_PREFIX = 'rentmate-admin:'

interface RegistryEntry {
  target: Ref<unknown>
  seed: () => unknown
}

const registry = new Map<string, RegistryEntry>()

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function createAdminCollection<T>(name: string, seed: () => T): Ref<T> {
  const existing = registry.get(name)
  if (existing) return existing.target as Ref<T>

  const key = `${STORAGE_PREFIX}${name}`
  const target = ref(readJson<T>(key) ?? seed()) as Ref<T>
  writeJson(key, target.value)
  watch(target, (value) => writeJson(key, value), { deep: true })
  registry.set(name, { target: target as Ref<unknown>, seed })
  return target
}

export function resetAdminData(): void {
  for (const entry of registry.values()) {
    entry.target.value = entry.seed()
  }

  if (!canUseStorage()) return
  const registeredKeys = new Set(
    [...registry.keys()].map((name) => `${STORAGE_PREFIX}${name}`),
  )
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(STORAGE_PREFIX) && !registeredKeys.has(key)) {
      window.localStorage.removeItem(key)
    }
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
