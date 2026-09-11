import { readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseNewTaipeiStops, NEW_TAIPEI_DISTRICTS, validPoint } from '../src/utils/garbage'

export const API = 'https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/json'
export async function fetchNewTaipeiRows(fetcher: typeof fetch = fetch) {
  const rows: unknown[] = []
  for (let page = 0; page < 50; page++) {
    const response = await fetcher(`${API}?page=${page}&size=1000`, {
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`New Taipei API HTTP ${response.status}`)
    const batch = await response.json()
    if (!Array.isArray(batch) || batch.length > 1000) throw new Error('Invalid New Taipei API page')
    rows.push(...batch)
    if (batch.length < 1000) return rows
  }
  throw new Error('New Taipei pagination limit reached; refusing incomplete data')
}
export function validateNewTaipeiRows(rows: unknown[], previousCount = 26655) {
  if (rows.length < previousCount * 0.8 || rows.length > previousCount * 1.2)
    throw new Error('New Taipei count changed over 20%; review required')
  const stops = parseNewTaipeiStops(rows)
  if (new Set(stops.map((s) => s.id)).size !== stops.length)
    throw new Error('Duplicate New Taipei IDs')
  if (NEW_TAIPEI_DISTRICTS.some((d) => !stops.some((s) => s.district === d)))
    throw new Error('Missing New Taipei districts')
  const invalidCoordinates = stops.filter((s) => !validPoint(s)).length
  if (invalidCoordinates > rows.length * 0.01)
    throw new Error('Over 1% invalid New Taipei coordinates')
  return { rows: stops.length, districts: NEW_TAIPEI_DISTRICTS.length, invalidCoordinates }
}
async function main() {
  const directory = new URL('../public/data/', import.meta.url)
  const dataPath = new URL('new-taipei-garbage.json', directory)
  const metaPath = new URL('new-taipei-garbage-source.json', directory)
  const previous = await readFile(metaPath, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  const rows = process.argv.includes('--validate-local')
    ? JSON.parse(await readFile(dataPath, 'utf8'))
    : await fetchNewTaipeiRows()
  const result = validateNewTaipeiRows(rows, previous?.rows)
  console.log(
    JSON.stringify({ ...result, mode: process.argv.includes('--write') ? 'write' : 'check' }),
  )
  if (!process.argv.includes('--write')) return
  const json = JSON.stringify(rows)
  const metadata = {
    ...result,
    apiUrl: API,
    importedAt: new Date().toISOString(),
    sourceUpdatedAt: null,
    sha256: createHash('sha256').update(json).digest('hex'),
  }
  await writeFile(new URL('new-taipei-garbage.json.tmp', directory), json, 'utf8')
  await writeFile(
    new URL('new-taipei-garbage-source.json.tmp', directory),
    JSON.stringify(metadata, null, 2) + '\n',
    'utf8',
  )
  await rename(new URL('new-taipei-garbage.json.tmp', directory), dataPath)
  await rename(new URL('new-taipei-garbage-source.json.tmp', directory), metaPath)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
