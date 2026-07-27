import sharp from 'sharp'

const FIELD_CROP_DEFINITIONS = [
  {
    cropId: 'landlord',
    fieldIds: ['landlord'],
    label: '出租人姓名手寫欄位',
    keywords: ['出租人姓名', '出租人'],
    rightRatio: 0.68,
    bottomRatio: 0.08,
  },
  {
    cropId: 'tenant',
    fieldIds: ['tenant'],
    label: '承租人姓名手寫欄位',
    keywords: ['承租人姓名', '承租人'],
    rightRatio: 0.68,
    bottomRatio: 0.08,
  },
  {
    cropId: 'date_range',
    fieldIds: ['start_date', 'end_date'],
    label: '租賃起迄日期手寫欄位',
    keywords: ['租賃期限', '租賃期間', '租期自'],
    rightRatio: 0.96,
    bottomRatio: 0.16,
  },
  {
    cropId: 'rent',
    fieldIds: ['rent'],
    label: '每月租金手寫欄位',
    keywords: ['租金每個月', '每月租金', '月租金'],
    rightRatio: 0.88,
    bottomRatio: 0.12,
  },
  {
    cropId: 'deposit',
    fieldIds: ['deposit'],
    label: '押租保證金手寫欄位',
    keywords: ['押租保證金', '押金'],
    rightRatio: 0.88,
    bottomRatio: 0.12,
  },
  {
    cropId: 'address',
    fieldIds: ['address'],
    label: '租賃地址手寫欄位',
    keywords: ['房屋所在地及使用範圍', '租賃住宅地址', '租屋地址', '房屋地址'],
    rightRatio: 0.96,
    bottomRatio: 0.15,
  },
]

const SUPPORTED_CROP_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
])

function unionBoundingBoxes(words) {
  const boxes = words.map((word) => word.boundingBox).filter(Boolean)
  if (!boxes.length) return null

  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function findKeywordAnchor(words, keywords, maxWindowSize = 8) {
  const sortedKeywords = [...keywords].sort((first, second) => second.length - first.length)

  for (const keyword of sortedKeywords) {
    for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
      let combinedText = ''

      for (
        let endIndex = startIndex;
        endIndex < Math.min(words.length, startIndex + maxWindowSize);
        endIndex += 1
      ) {
        combinedText += words[endIndex]?.text ?? ''
        if (!combinedText.startsWith(keyword)) continue

        const matchedWords = words.slice(startIndex, endIndex + 1)
        const boundingBox = unionBoundingBoxes(matchedWords)
        if (!boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) continue

        return {
          keyword,
          startWordIndex: startIndex,
          endWordIndex: endIndex,
          boundingBox,
        }
      }
    }
  }

  return null
}

export function calculateFieldCropBox(anchorBox, page, definition) {
  const pageWidth = Number(page.width) || 0
  const pageHeight = Number(page.height) || 0
  if (!pageWidth || !pageHeight) return null

  const left = Math.max(0, anchorBox.left - pageWidth * 0.03)
  const top = Math.max(0, anchorBox.top - Math.max(anchorBox.height * 1.5, pageHeight * 0.025))
  const right = Math.min(
    pageWidth,
    Math.max(anchorBox.right + pageWidth * 0.45, pageWidth * definition.rightRatio),
  )
  const bottom = Math.min(
    pageHeight,
    Math.max(anchorBox.bottom + anchorBox.height * 4, anchorBox.top + pageHeight * definition.bottomRatio),
  )

  if (right - left < 20 || bottom - top < 20) return null
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function scaleCropBox(cropBox, page, imageMetadata) {
  const scaleX = imageMetadata.width / page.width
  const scaleY = imageMetadata.height / page.height
  const left = Math.max(0, Math.floor(cropBox.left * scaleX))
  const top = Math.max(0, Math.floor(cropBox.top * scaleY))
  const right = Math.min(imageMetadata.width, Math.ceil(cropBox.right * scaleX))
  const bottom = Math.min(imageMetadata.height, Math.ceil(cropBox.bottom * scaleY))

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

async function cropImageBuffer(sourceBuffer, page, cropBox) {
  const image = sharp(sourceBuffer, { failOn: 'none' })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || !page.width || !page.height) return null

  const extractBox = scaleCropBox(cropBox, page, metadata)
  if (extractBox.width < 10 || extractBox.height < 10) return null

  const buffer = await image
    .extract(extractBox)
    .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer()

  return { buffer, extractBox }
}

export async function buildFieldImageCrops(visionPages, sourceFiles, options = {}) {
  const maxCrops = Number.isFinite(options.maxCrops) ? Math.max(0, options.maxCrops) : 6
  const targetFieldIds = Array.isArray(options.fieldIds) ? new Set(options.fieldIds) : null
  const crops = []

  for (const definition of FIELD_CROP_DEFINITIONS) {
    if (crops.length >= maxCrops) break
    if (targetFieldIds && !definition.fieldIds.some((fieldId) => targetFieldIds.has(fieldId))) {
      continue
    }

    let selected = null
    for (const page of visionPages) {
      const sourceFile = sourceFiles[page.sourceFileIndex]
      if (!sourceFile || !SUPPORTED_CROP_MIME_TYPES.has(sourceFile.mimetype)) continue

      const anchor = findKeywordAnchor(page.words ?? [], definition.keywords)
      if (!anchor) continue
      const cropBox = calculateFieldCropBox(anchor.boundingBox, page, definition)
      if (!cropBox) continue

      selected = { page, sourceFile, anchor, cropBox }
      break
    }

    if (!selected) continue

    try {
      const cropped = await cropImageBuffer(selected.sourceFile.buffer, selected.page, selected.cropBox)
      if (!cropped) continue

      crops.push({
        cropId: definition.cropId,
        fieldIds: definition.fieldIds,
        label: definition.label,
        pageIndex: selected.page.pageIndex,
        sourceFileIndex: selected.page.sourceFileIndex,
        anchorKeyword: selected.anchor.keyword,
        visionBoundingBox: selected.cropBox,
        imageBoundingBox: cropped.extractBox,
        mimeType: 'image/jpeg',
        base64: cropped.buffer.toString('base64'),
      })
    } catch (error) {
      console.warn(`[AI OCR] Failed to crop ${definition.cropId}:`, error)
    }
  }

  return crops
}

async function createReviewImageTile(crop, index) {
  const source = Buffer.from(crop.base64, 'base64')
  const resized = await sharp(source)
    .resize({ width: 1100, height: 250, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })
  const labelHeight = 12
  const width = resized.info.width
  const height = resized.info.height + labelHeight
  const divider = await sharp({
    create: {
      width,
      height: labelHeight,
      channels: 3,
      background: index % 2 === 0 ? '#4f46e5' : '#8b5cf6',
    },
  })
    .jpeg()
    .toBuffer()

  const buffer = await sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .composite([
      { input: divider, left: 0, top: 0 },
      { input: resized.data, left: 0, top: labelHeight },
    ])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer()

  return { buffer, width, height }
}

/**
 * 將多個欄位裁切圖合併成少量聯絡表，降低本機視覺模型逐張編碼的成本。
 * 個別 crop metadata 仍保留，僅改變送進 Ollama 的圖片封裝方式。
 */
export async function buildOllamaReviewImages(crops, options = {}) {
  if (!crops.length) return []

  const cropsPerSheet = Number.isFinite(options.cropsPerSheet)
    ? Math.max(1, Math.trunc(options.cropsPerSheet))
    : 6
  const sheets = []

  for (let offset = 0; offset < crops.length; offset += cropsPerSheet) {
    const group = crops.slice(offset, offset + cropsPerSheet)
    const tiles = await Promise.all(
      group.map((crop, index) => createReviewImageTile(crop, offset + index)),
    )
    const gap = 12
    const width = Math.max(...tiles.map((tile) => tile.width))
    const height = tiles.reduce((total, tile) => total + tile.height, 0) + gap * (tiles.length - 1)
    let top = 0
    const composite = tiles.map((tile) => {
      const placement = { input: tile.buffer, left: 0, top }
      top += tile.height + gap
      return placement
    })

    const buffer = await sharp({
      create: { width, height, channels: 3, background: '#ffffff' },
    })
      .composite(composite)
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toBuffer()

    sheets.push(buffer.toString('base64'))
  }

  return sheets
}

export function serializeCropMetadata(crops) {
  return crops.map(({ base64: _base64, ...metadata }) => metadata)
}
