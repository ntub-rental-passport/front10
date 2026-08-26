export function extractVariables(text: string): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = match[1].trim()
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => {
    const key = name.trim()
    const value = vars[key]
    return value === undefined ? match : value
  })
}
