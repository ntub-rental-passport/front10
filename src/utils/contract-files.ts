const contractFileNameCollator = new Intl.Collator('zh-Hant-TW', {
  numeric: true,
  sensitivity: 'base',
})

export function sortContractFiles<T extends { name: string }>(files: readonly T[]): T[] {
  return [...files].sort((firstFile, secondFile) =>
    contractFileNameCollator.compare(firstFile.name, secondFile.name),
  )
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const result = [...list]
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= list.length ||
    to < 0 ||
    to >= list.length ||
    from === to
  )
    return result

  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

export function appendContractFiles<T extends { name: string }>(
  existingFiles: readonly T[],
  newFiles: readonly T[],
  manuallyReordered: boolean,
): T[] {
  return manuallyReordered
    ? [...existingFiles, ...sortContractFiles(newFiles)]
    : sortContractFiles([...existingFiles, ...newFiles])
}
