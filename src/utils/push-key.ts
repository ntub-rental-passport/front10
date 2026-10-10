export function base64UrlToBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  )
}

export function isSameKey(existing: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (existing === null || existing.byteLength !== expected.length) return false
  return new Uint8Array(existing).every((byte, index) => byte === expected[index])
}
