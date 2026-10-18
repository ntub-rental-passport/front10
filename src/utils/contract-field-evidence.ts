import type { ContractCropRegion, ContractOcrResult } from './contract-ocr'

let sourceFiles: Array<File | null> = []
let sourceKey = ''

function evidenceKey(result: ContractOcrResult): string {
  return JSON.stringify([result.fileName, result.size, result.aiReview?.jobId ?? ''])
}

// 原圖只保留於目前分頁記憶體；重新整理後以既有 OCR 原文備援。
export function rememberContractSourceImages(files: File[], result: ContractOcrResult): void {
  sourceFiles = files.map(file => file.type.startsWith('image/') ? file : null)
  sourceKey = evidenceKey(result)
}

export function findContractFieldCrop(
  result: ContractOcrResult | null,
  fieldId: string,
): ContractCropRegion | undefined {
  return result?.cropRegions?.find(region => region.fieldIds.includes(fieldId))
}

export function clampEvidenceCropBox(
  box: ContractCropRegion['imageBoundingBox'],
  imageWidth: number,
  imageHeight: number,
): ContractCropRegion['imageBoundingBox'] | null {
  if (![box.left, box.top, box.width, box.height, imageWidth, imageHeight].every(Number.isFinite)) return null
  if (box.width <= 0 || box.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null
  const left = Math.max(0, Math.floor(box.left))
  const top = Math.max(0, Math.floor(box.top))
  const width = Math.min(imageWidth, Math.ceil(box.left + box.width)) - left
  const height = Math.min(imageHeight, Math.ceil(box.top + box.height)) - top
  return width > 0 && height > 0 ? { left, top, width, height } : null
}

export async function createContractFieldCropUrl(
  result: ContractOcrResult | null,
  fieldId: string,
): Promise<string | null> {
  const region = findContractFieldCrop(result, fieldId)
  if (!result || !region || evidenceKey(result) !== sourceKey) return null
  const file = sourceFiles[region.sourceFileIndex]
  if (!file) return null

  const bitmap = await createImageBitmap(file)
  try {
    const box = clampEvidenceCropBox(region.imageBoundingBox, bitmap.width, bitmap.height)
    if (!box) return null
    const canvas = document.createElement('canvas')
    canvas.width = box.width
    canvas.height = box.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    bitmap.close()
  }
}
