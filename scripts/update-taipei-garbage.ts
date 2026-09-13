import { readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseStops, TAIPEI_DISTRICTS, validPoint } from '../src/utils/garbage'

export const API =
  'https://data.taipei/api/v1/dataset/a6e90031-7ec4-4089-afb5-361a4efe7202?scope=resourceAquire'
const fields = [
  '行政區',
  '里別',
  '分隊',
  '局編',
  '車號',
  '路線',
  '車次',
  '抵達時間',
  '離開時間',
  '地點',
  '經度',
  '緯度',
]
export async function fetchRows(fetcher: typeof fetch = fetch) {
  const rows: Record<string, unknown>[] = []
  let total: number | undefined
  do {
    const response = await fetcher(API + '&limit=1000&offset=' + rows.length, {
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error('Official API HTTP ' + response.status)
    const { result } = await response.json()
    if (
      !Number.isInteger(result?.count) ||
      result.count < 1 ||
      result.count > 20000 ||
      !Array.isArray(result.results)
    )
      throw new Error('Invalid API schema/count')
    if (total !== undefined && total !== result.count)
      throw new Error('Dataset changed during pagination; retry later')
    total = result.count
    if (
      !result.results.length ||
      result.results.length > 1000 ||
      result.results.length + rows.length > total!
    )
      throw new Error('Incomplete/invalid API page')
    rows.push(...result.results)
  } while (rows.length < total!)
  return rows
}
export function validateRows(rows: Record<string, unknown>[], previousCount: number) {
  if (!rows.length || rows.length < previousCount * 0.8 || rows.length > previousCount * 1.2)
    throw new Error('Record count changed over 20%; manual review required')
  const escape = (value: unknown) =>
    '"' +
    String(value ?? '')
      .trim()
      .replaceAll('"', '""') +
    '"'
  for (const row of rows)
    if (!fields.every((f) => Object.hasOwn(row, f))) throw new Error('Missing official columns')
  const csv =
    fields.join(',') +
    '\n' +
    rows.map((row) => fields.map((f) => escape(row[f])).join(',')).join('\n') +
    '\n'
  const stops = parseStops(csv)
  if (stops.length !== rows.length)
    throw new Error('Duplicate IDs, invalid times or invalid district; refusing data loss')
  if (TAIPEI_DISTRICTS.some((d) => !stops.some((s) => s.district === d)))
    throw new Error('Missing districts')
  const invalidCoordinates = stops.filter((s) => !validPoint(s)).length
  if (invalidCoordinates > stops.length * 0.01)
    throw new Error('Over 1% invalid coordinates; manual review required')
  return { csv, invalidCoordinates, rows: stops.length }
}
async function main() {
  const directory = new URL('../public/data/', import.meta.url)
  const metaPath = new URL('taipei-garbage-source.json', directory)
  const csvPath = new URL('taipei-garbage.csv', directory)
  const previous = JSON.parse(await readFile(metaPath, 'utf8'))
  const rows = await fetchRows()
  const result = validateRows(rows, previous.rows)
  console.log(
    JSON.stringify({
      rows: result.rows,
      invalidCoordinates: result.invalidCoordinates,
      mode: process.argv.includes('--write') ? 'write' : 'check',
    }),
  )
  if (!process.argv.includes('--write')) return
  // All pages and validations finish BEFORE any file is replaced. CI only publishes
  // a complete commit; a failed run leaves the deployed snapshot untouched.
  const metadata = {
    ...previous,
    rows: result.rows,
    invalidCoordinates: result.invalidCoordinates,
    importedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    apiUrl: API,
    originalFile: 'Taipei official API',
    sourceUpdatedAt: null,
    sha256: createHash('sha256').update(result.csv).digest('hex'),
  }
  await writeFile(new URL('taipei-garbage.csv.tmp', directory), result.csv, 'utf8')
  await writeFile(
    new URL('taipei-garbage-source.json.tmp', directory),
    JSON.stringify(metadata, null, 2) + '\n',
    'utf8',
  )
  await rename(new URL('taipei-garbage.csv.tmp', directory), csvPath)
  await rename(new URL('taipei-garbage-source.json.tmp', directory), metaPath)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
