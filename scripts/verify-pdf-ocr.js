import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { PDFDocument } from 'pdf-lib'
import { createVisionPagePlaceholder, normalizeVisionAnnotation } from '../server/vision-annotation.js'

// Exercise the actual server functions without starting HTTP/auth or contacting Google.
const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8')
const helpers = source.slice(source.indexOf('function alignVisionPages('), source.indexOf('async function recognizeImage('))
const documentOcr = source.slice(source.indexOf('async function recognizeDocument('), source.indexOf('function roundTimings('))

async function run(buffer, responseForPage) {
  const calls = []
  const progress = []
  const context = vm.createContext({
    PDFDocument, performance, createVisionPagePlaceholder, normalizeVisionAnnotation,
    fileClient: {
      async batchAnnotateFiles({ requests }) {
        assert.equal(requests.length, 1)
        assert.equal(requests[0].pages.length, 1)
        assert.equal(requests[0].inputConfig.content, buffer)
        const page = requests[0].pages[0]
        calls.push(page)
        return [{ responses: [responseForPage(page)] }]
      },
    },
  })
  const recognize = vm.runInContext(`${helpers}\n${documentOcr}\nrecognizeDocument`, context)
  const result = await recognize(buffer, 'application/pdf', ['zh-TW'], 2, (value) => progress.push(value))
  return { result, calls, progress }
}

const fixture = async (count) => {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < count; i++) pdf.addPage()
  return Buffer.from(await pdf.save())
}
const success = (page) => ({ responses: [{ fullTextAnnotation: { text: `page ${page}` } }] })
for (const count of [1, 5, 6, 9, 12]) {
  const { result, calls, progress } = await run(await fixture(count), success)
  assert.deepEqual(calls, Array.from({ length: count }, (_, i) => i + 1))
  assert.equal(result.pageCount, count)
  assert.equal(result.pageTexts[count - 1], `page ${count}`)
  assert.equal(result.visionPages[count - 1].sourcePageIndex, count - 1)
  assert.equal(result.visionPages[count - 1].sourceFileIndex, 2)
  assert.equal(result.warnings.length, 0)
  assert.equal(progress.at(-1), 1)
}
const ninePages = await fixture(9)
for (const failure of [{ error: { code: 13, message: 'failed' } }, { responses: [{ error: { code: 13, message: 'failed' } }] }, { responses: [] }]) {
  await assert.rejects(run(ninePages, (page) => page === 6 ? failure : success(page)), /第 6 頁辨識失敗/)
}
const blank = await run(ninePages, (page) => page === 6 ? { responses: [{}] } : success(page))
assert.equal(blank.result.pageCount, 9)
assert.equal(blank.result.pageTexts[5], '')
assert.match(blank.result.warnings[0], /第 6 頁未辨識到文字/)
assert.equal(blank.result.pageTexts[8], 'page 9')

if (process.argv[2]) {
  const { result } = await run(await readFile(process.argv[2]), success)
  assert.equal(result.pageCount, 9)
  console.log('Provided PDF: all 9 pages requested in order (mock Vision responses).')
}
console.log('PDF OCR regression checks passed.')
