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

export function createAdminCollection<T>(
  name: string,
  seed: () => T,
  migrate?: (raw: T) => T,
): Ref<T> {
  const existing = registry.get(name)
  if (existing) return existing.target as Ref<T>

  const key = `${STORAGE_PREFIX}${name}`
  const stored = readJson<T>(key)
  const initial = stored === null ? seed() : (migrate ? migrate(stored) : stored)
  const target = ref(initial) as Ref<T>
  writeJson(key, target.value)

  watch(
    target,
    (value) => {
      // 值與 localStorage 相同時不重複寫入：跨分頁同步後若又寫回，
      // 會再觸發對方的 storage 事件而形成無限來回。
      if (canUseStorage() && window.localStorage.getItem(key) === JSON.stringify(value)) return
      writeJson(key, value)
    },
    { deep: true },
  )

  // 其他分頁改動同一份資料時，storage 事件會在本分頁觸發，藉此同步記憶體狀態
  if (canUseStorage()) {
    window.addEventListener('storage', (event) => {
      if (event.key !== key || event.newValue === null) return
      try {
        const next = JSON.parse(event.newValue) as T
        target.value = migrate ? migrate(next) : next
      } catch {
        // 解析失敗就保留目前狀態，不影響使用中的畫面
      }
    })
  }

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
