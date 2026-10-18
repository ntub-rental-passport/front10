import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContractCropRegion, ContractOcrResult } from './contract-ocr'
import {
  clampEvidenceCropBox,
  createContractFieldCropUrl,
  findContractFieldCrop,
  rememberContractSourceImages,
} from './contract-field-evidence'

const crop = {
  fieldIds: ['rent', 'deposit'], pageIndex: 1, sourceFileIndex: 1,
  imageBoundingBox: { left: 10, top: 20, width: 100, height: 60 },
} as ContractCropRegion
const result = { fileName: '第一頁.png、第二頁.png', size: 100, cropRegions: [crop] } as ContractOcrResult

afterEach(() => vi.unstubAllGlobals())

describe('契約原文裁切', () => {
  it('依欄位沿用既有裁切資料，一張裁切可對應多個欄位', () => {
    expect(findContractFieldCrop(result, 'rent')).toBe(crop)
    expect(findContractFieldCrop(result, 'deposit')).toBe(crop)
    expect(findContractFieldCrop(result, 'tenant')).toBeUndefined()
    expect(findContractFieldCrop(null, 'rent')).toBeUndefined()
  })

  it('裁切座標限制在原圖範圍內', () => {
    expect(clampEvidenceCropBox(crop.imageBoundingBox, 80, 50))
      .toEqual({ left: 10, top: 20, width: 70, height: 30 })
    expect(clampEvidenceCropBox({ left: -10, top: -20, width: 30, height: 40 }, 80, 50))
      .toEqual({ left: 0, top: 0, width: 20, height: 20 })
  })

  it.each([
    { left: 100, top: 20, width: 10, height: 10 },
    { left: 0, top: 0, width: 0, height: 20 },
    { left: NaN, top: 0, width: 10, height: 20 },
  ])('無效或圖外座標不產生裁切：%j', box => {
    expect(clampEvidenceCropBox(box, 80, 50)).toBeNull()
  })

  it('未保留原圖、缺少裁切或不同契約時回傳原文備援', async () => {
    rememberContractSourceImages([], result)
    expect(await createContractFieldCropUrl(result, 'rent')).toBeNull()
    expect(await createContractFieldCropUrl(result, 'tenant')).toBeNull()
    expect(await createContractFieldCropUrl(null, 'rent')).toBeNull()
    rememberContractSourceImages([new File(['pdf'], '契約.pdf', { type: 'application/pdf' })], result)
    expect(await createContractFieldCropUrl(result, 'rent')).toBeNull()
    expect(await createContractFieldCropUrl({ ...result, fileName: '另一份.png' }, 'rent')).toBeNull()
  })

  it('只在展開時讀取對應原圖，使用既有裁切座標並釋放點陣圖', async () => {
    const first = new File(['first'], '第一頁.png', { type: 'image/png' })
    const second = new File(['second'], '第二頁.png', { type: 'image/png' })
    const bitmap = { width: 200, height: 300, close: vi.fn() }
    const decode = vi.fn().mockResolvedValue(bitmap)
    const drawImage = vi.fn()
    const blob = new Blob(['crop'], { type: 'image/png' })
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (callback: (blob: Blob) => void) => callback(blob) }
    const createObjectURL = vi.fn(() => 'blob:crop')
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
    vi.stubGlobal('URL', { createObjectURL })
    rememberContractSourceImages([first, second], result)
    expect(decode).not.toHaveBeenCalled()
    expect(await createContractFieldCropUrl(result, 'rent')).toBe('blob:crop')
    expect(decode).toHaveBeenCalledWith(second)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 100, 60, 0, 0, 100, 60)
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
