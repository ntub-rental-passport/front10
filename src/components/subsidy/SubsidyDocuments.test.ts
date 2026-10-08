import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, nextTick, ssrContextKey } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SubsidyDocuments from './SubsidyDocuments.vue'
import type { SubsidyDocType, SubsidyFile } from '@/src/services/subsidyFileApi'

const api = vi.hoisted(() => ({
  listSubsidyFiles: vi.fn(),
  uploadSubsidyFile: vi.fn(),
  fetchSubsidyFileBlob: vi.fn(),
  deleteSubsidyFile: vi.fn(),
}))
const contracts = vi.hoisted(() => ({ listStoredContracts: vi.fn() }))
vi.mock('@/src/services/subsidyFileApi', () => api)
vi.mock('@/src/services/contractApi', () => contracts)

interface Handlers {
  loadFiles: () => Promise<void>
  loadRentals: () => Promise<void>
  removeFile: (file: SubsidyFile) => Promise<void>
  preview: (file: SubsidyFile) => Promise<void>
  download: (file: SubsidyFile) => Promise<void>
  upload: () => Promise<void>
  onPickFile: (event: Event) => void
  clearBlobUrls: () => void
  docType: SubsidyDocType | ''
  rentalId: number | ''
  fileInput: { value: string } | null
  previewId: number | null
}

function file(
  id: number,
  docType: SubsidyDocType = 'other',
  contentType: SubsidyFile['contentType'] = 'application/pdf',
): SubsidyFile {
  return {
    id,
    docType,
    contentType,
    name: `文件${id}.pdf`,
    size: 2048,
    rentalId: null,
    createdAt: '2026-10-08T00:00:00Z',
    expiresAt: '2027-04-06T16:00:00Z',
    url: `/api/subsidy/files/${id}`,
  }
}
async function mount(load = true) {
  let handlers!: Handlers
  const app = createSSRApp(SubsidyDocuments)
  app.mixin({
    created() {
      handlers = (this.$ as unknown as { setupState: Handlers }).setupState
    },
  })
  await renderToString(app)
  // SSR 不執行 mounted，沿用元件狀態手動載入並驗證渲染與事件。
  if (load) await Promise.all([handlers.loadFiles(), handlers.loadRentals()])
  await nextTick()
  return handlers
}
const snapshot = (handlers: Handlers) =>
  renderToString(createSSRApp({ ...SubsidyDocuments, setup: () => handlers }))
function button(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([value]) => value)
    .find((value) => value.replace(/<[^>]*>/g, '').trim() === label)
}
const confirm = vi.fn()
const open = vi.fn()
const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()

function mountClient() {
  interface Node {
    children: Node[]
  }
  const node = (): Node => ({ children: [] })
  const renderer = createRenderer<Node, Node>({
    createElement: node,
    createText: node,
    createComment: node,
    insert: (child, parent) => {
      parent.children.push(child)
    },
    remove: () => {},
    setText: () => {},
    setElementText: () => {},
    patchProp: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let handlers!: Handlers
  const app = renderer.createApp({ ...SubsidyDocuments, render: () => null })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mixin({
    created() {
      handlers = (this.$ as unknown as { setupState: Handlers }).setupState
    },
  })
  app.mount(node())
  return { handlers, unmount: () => app.unmount() }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.listSubsidyFiles.mockResolvedValue({ files: [], count: 0, limit: 20 })
  contracts.listStoredContracts.mockResolvedValue([])
  api.fetchSubsidyFileBlob.mockResolvedValue(new Blob(['image']))
  createObjectURL.mockReturnValue('blob:subsidy-test')
  vi.stubGlobal('window', { confirm, open })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('我的補助文件', () => {
  it('依契約順序渲染非空組別、計數、檔案資訊與隱私文字', async () => {
    api.listSubsidyFiles.mockResolvedValue({
      files: [file(3), file(2, 'lease_copy'), file(1, 'identity')],
      count: 3,
      limit: 20,
    })
    const handlers = await mount()
    const html = await snapshot(handlers)
    expect(html).toContain('3 / 20')
    expect(html).toContain('只有你看得到，系統管理員也無法查看。')
    expect(html).toContain('上傳後 180 天自動刪除，到期前 14 天會通知你。')
    expect(html).toContain('文件2.pdf')
    expect(html).toContain('2.0 KB')
    expect(html).toContain('上傳於 2026/10/8')
    expect(html).toContain('將於 2027-04-07 自動刪除')
    expect([...html.matchAll(/<h3\b[^>]*>(.*?)<\/h3>/g)].map(([, label]) => label)).toEqual([
      '身分證明',
      '租約影本',
      '其他',
    ])
    expect(html).not.toContain('<img ')
    expect(api.fetchSubsidyFileBlob).not.toHaveBeenCalled()
  })
  it('滿額停用上傳並顯示原因', async () => {
    api.listSubsidyFiles.mockResolvedValue({ files: [file(1)], count: 20, limit: 20 })
    const handlers = await mount()
    const html = await snapshot(handlers)
    expect(button(html, '上傳文件')).toMatch(/\sdisabled(?:=|\s|>)/)
    expect(html).toContain('最多可存 20 份文件，請先刪除不需要的文件。')
    await handlers.upload()
    expect(api.uploadSubsidyFile).not.toHaveBeenCalled()
  })
  it.each([401, 403])('%i 顯示租客登入提示並隱藏表單', async (status) => {
    api.listSubsidyFiles.mockRejectedValue(Object.assign(new Error('unauthorized'), { status }))
    const html = await snapshot(await mount())
    expect(html).toContain('登入租客帳號後，可以在這裡保存補助文件。')
    expect(html).not.toContain('<form')
  })
  it('載入中、空清單、503 原文與重試', async () => {
    const handlers = await mount(false)
    expect(await snapshot(handlers)).toContain('正在讀取補助文件…')
    const detail = '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'
    api.listSubsidyFiles.mockRejectedValueOnce(new Error(detail))
    await handlers.loadFiles()
    expect(await snapshot(handlers)).toContain(detail)
    expect(button(await snapshot(handlers), '重試')).toBeDefined()
    await handlers.loadFiles()
    expect(await snapshot(handlers)).toContain('還沒有存任何補助文件。')
  })
  it('刪除先確認，取消不呼叫 API，確認後刪除並重新載入', async () => {
    const target = file(1)
    api.listSubsidyFiles.mockResolvedValue({ files: [target], count: 1, limit: 20 })
    const handlers = await mount()
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    await handlers.removeFile(target)
    expect(confirm).toHaveBeenCalledWith('確定刪除「文件1.pdf」？刪除後無法復原。')
    expect(api.deleteSubsidyFile).not.toHaveBeenCalled()
    api.listSubsidyFiles.mockResolvedValue({ files: [], count: 0, limit: 20 })
    await handlers.removeFile(target)
    expect(api.deleteSubsidyFile).toHaveBeenCalledWith(1)
    expect(api.listSubsidyFiles).toHaveBeenCalledTimes(2)
    expect(await snapshot(handlers)).toContain('0 / 20')
  })
  it('租約可選，失敗時隱藏選單；上傳預檢後帶入租約並重載', async () => {
    contracts.listStoredContracts.mockRejectedValueOnce(new Error('offline'))
    const handlers = await mount()
    expect(await snapshot(handlers)).not.toContain('關聯租約')
    contracts.listStoredContracts.mockResolvedValue([
      { rental_id: 42, contract_tag: '台北租約', address: '台北市' },
    ])
    await handlers.loadRentals()
    expect(await snapshot(handlers)).toContain('台北租約')
    const upload = new File(['%PDF-'], '租約.pdf')
    handlers.onPickFile({ target: { files: [upload] } } as unknown as Event)
    await handlers.upload()
    expect(await snapshot(handlers)).toContain('請選擇文件類型。')
    handlers.docType = 'lease_copy'
    handlers.rentalId = 42
    handlers.fileInput = { value: '租約.pdf' }
    let resolveUpload!: () => void
    api.uploadSubsidyFile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpload = resolve
      }),
    )
    const pending = handlers.upload()
    expect(button(await snapshot(handlers), '上傳中…')).toMatch(/\sdisabled(?:=|\s|>)/)
    resolveUpload()
    await pending
    expect(api.uploadSubsidyFile).toHaveBeenCalledWith(upload, 'lease_copy', 42)
    expect(handlers.fileInput.value).toBe('')
    expect(api.listSubsidyFiles).toHaveBeenCalledTimes(2)
  })
  it('不符副檔名的文件不送出', async () => {
    const handlers = await mount()
    handlers.docType = 'other'
    handlers.onPickFile({ target: { files: [new File(['gif'], 'image.gif')] } } as unknown as Event)
    await handlers.upload()
    expect(await snapshot(handlers)).toContain('只收 PDF、JPG、PNG 檔案。')
    expect(api.uploadSubsidyFile).not.toHaveBeenCalled()
  })
  it('圖片預覽使用 blob，重複預覽共用網址，重新載入釋放舊網址', async () => {
    const image = file(1, 'identity', 'image/png')
    api.listSubsidyFiles.mockResolvedValue({ files: [image], count: 1, limit: 20 })
    const handlers = await mount()
    await handlers.preview(image)
    expect(api.fetchSubsidyFileBlob).toHaveBeenCalledWith(image)
    expect(await snapshot(handlers)).toContain('src="blob:subsidy-test"')
    await handlers.preview(image)
    expect(createObjectURL).toHaveBeenCalledOnce()
    await handlers.loadFiles()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:subsidy-test')
    expect(await snapshot(handlers)).not.toContain('<img ')
    await handlers.preview(image)
    handlers.clearBlobUrls()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })
  it('PDF 先開分頁再讀 blob，503 原文並關閉空分頁', async () => {
    const tab = { opener: {}, location: { href: 'about:blank' }, close: vi.fn() }
    open.mockReturnValue(tab)
    const handlers = await mount()
    await handlers.preview(file(1))
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.location.href).toBe('blob:subsidy-test')
    const detail = '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'
    api.fetchSubsidyFileBlob.mockRejectedValueOnce(new Error(detail))
    await handlers.preview(file(2))
    expect(tab.close).toHaveBeenCalledOnce()
    expect(await snapshot(handlers)).toContain(detail)
    handlers.clearBlobUrls()
  })
  it('下載以 blob 與原始檔名觸發', async () => {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const appendChild = vi.fn()
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild } })
    const handlers = await mount()
    await handlers.download(file(1))
    expect(link.href).toBe('blob:subsidy-test')
    expect(link.download).toBe('文件1.pdf')
    expect(appendChild).toHaveBeenCalledWith(link)
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    handlers.clearBlobUrls()
  })

  it('卸載釋放已建立網址，卸載後才完成的讀取不再建立網址', async () => {
    const client = mountClient()
    await nextTick()
    await client.handlers.preview(file(1, 'identity', 'image/png'))
    let resolveBlob!: (blob: Blob) => void
    api.fetchSubsidyFileBlob.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveBlob = resolve
      }),
    )
    const pending = client.handlers.preview(file(2, 'identity', 'image/png'))
    client.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:subsidy-test')
    resolveBlob(new Blob(['image']))
    await pending
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(api.listSubsidyFiles).toHaveBeenCalledOnce()
    expect(contracts.listStoredContracts).toHaveBeenCalledOnce()
  })
})
