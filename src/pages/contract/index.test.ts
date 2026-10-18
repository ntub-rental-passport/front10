import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, type Ref, type SetupContext } from 'vue'
import { renderToString } from 'vue/server-renderer'
import Scanner from './index.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/src/utils/contract-ocr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/utils/contract-ocr')>()),
  clearContractOcrResult: vi.fn(),
}))

type ScannerState = {
  selectedFiles: Ref<File[]>
  manuallyReordered: Ref<boolean>
  uploadError: Ref<string>
  prepareFiles: (files: File[]) => void
  appendFiles: (files: File[]) => void
  reorderSelectedFile: (from: number, to: number) => void
  removeSelectedFile: (index: number) => void
  clearAllFiles: () => void
  startOcrRecognition: () => Promise<void>
}

async function scanner() {
  let state!: ScannerState
  await renderToString(
    createSSRApp({
      ...Scanner,
      setup(props: Record<string, unknown>, context: SetupContext) {
        state = (
          Scanner.setup as (props: Record<string, unknown>, context: SetupContext) => ScannerState
        )(props, context)
        return state
      },
    }),
  )
  return state
}

const files = (...numbers: number[]) =>
  numbers.map(
    (number) => new File(['image'], `頁${number}.png`, { type: 'image/png', lastModified: 1 }),
  )
const names = (state: ScannerState) => state.selectedFiles.value.map((file) => file.name)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('測試不連線')))
})
afterEach(() => vi.unstubAllGlobals())

describe('契約上傳頁序', () => {
  it('預設依檔名排序，手動調整後保留頁序並將排序過的新頁追加到最後', async () => {
    const state = await scanner()
    state.prepareFiles(files(10, 2))
    state.appendFiles(files(1))
    expect(names(state)).toEqual(['頁1.png', '頁2.png', '頁10.png'])
    state.reorderSelectedFile(2, 0)
    state.appendFiles(files(4, 3))
    expect(names(state)).toEqual(['頁10.png', '頁1.png', '頁2.png', '頁3.png', '頁4.png'])
    await state.startOcrRecognition()
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData
    expect((body.getAll('files') as File[]).map((file) => file.name)).toEqual(names(state))
  })

  it('移除頁面仍保留手動排序狀態，重新選取或清空才重設', async () => {
    const state = await scanner()
    state.prepareFiles(files(1, 2, 3))
    state.reorderSelectedFile(2, 0)
    state.removeSelectedFile(1)
    state.appendFiles(files(0))
    expect(names(state)).toEqual(['頁3.png', '頁2.png', '頁0.png'])
    state.prepareFiles(files(10, 2))
    expect(state.manuallyReordered.value).toBe(false)
    state.appendFiles(files(1))
    expect(names(state)).toEqual(['頁1.png', '頁2.png', '頁10.png'])
    state.reorderSelectedFile(2, 0)
    state.clearAllFiles()
    expect(state.manuallyReordered.value).toBe(false)
    expect(names(state)).toEqual([])
  })

  it('移除全部頁面後恢復預設排序，重複加入的檔案不會新增', async () => {
    const state = await scanner()
    state.prepareFiles(files(1, 2))
    state.reorderSelectedFile(1, 0)
    state.appendFiles(files(1))
    expect(names(state)).toEqual(['頁2.png', '頁1.png'])
    state.removeSelectedFile(0)
    state.removeSelectedFile(0)
    expect(state.manuallyReordered.value).toBe(false)
    state.prepareFiles(files(10, 2))
    state.appendFiles(files(1))
    expect(names(state)).toEqual(['頁1.png', '頁2.png', '頁10.png'])
  })

  it('追加 PDF 或超過 20 張時保留原清單與手動頁序', async () => {
    const state = await scanner()
    state.prepareFiles(files(1, 2))
    state.reorderSelectedFile(1, 0)
    state.appendFiles([new File(['pdf'], '契約.pdf', { type: 'application/pdf' })])
    expect(state.uploadError.value).toContain('PDF 請單獨上傳')
    expect(names(state)).toEqual(['頁2.png', '頁1.png'])
    state.appendFiles(files(...Array.from({ length: 19 }, (_, index) => index + 3)))
    expect(state.uploadError.value).toContain('最多上傳 20 張')
    expect(names(state)).toEqual(['頁2.png', '頁1.png'])
    expect(state.manuallyReordered.value).toBe(true)
  })
})
