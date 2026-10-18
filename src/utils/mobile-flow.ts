export function hasInAppHistory(back: unknown): boolean {
  return typeof back === 'string' && back.startsWith('/') && !back.startsWith('//')
}
