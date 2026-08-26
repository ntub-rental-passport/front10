import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  buildFieldImageCrops,
  buildOllamaReviewImages,
  calculateFieldCropBox,
  findKeywordAnchor,
} from '../server/vision-field-crops.js'

const words = [
  { text: '第三條', boundingBox: { left: 20, top: 100, right: 80, bottom: 130, width: 60, height: 30 } },
  { text: '租金', boundingBox: { left: 100, top: 100, right: 150, bottom: 130, width: 50, height: 30 } },
  { text: '每個月', boundingBox: { left: 155, top: 100, right: 230, bottom: 130, width: 75, height: 30 } },
]

const anchor = findKeywordAnchor(words, ['租金每個月'])
assert.equal(anchor.keyword, '租金每個月')
assert.equal(anchor.startWordIndex, 1)
assert.equal(anchor.boundingBox.left, 100)
assert.equal(anchor.boundingBox.right, 230)

const cropBox = calculateFieldCropBox(anchor.boundingBox, { width: 1000, height: 1400 }, {
  rightRatio: 0.88,
  bottomRatio: 0.12,
})
assert.equal(cropBox.right, 880)
assert.equal(cropBox.left, 70)
assert.equal(cropBox.bottom >= 220, true)

const imageBuffer = await sharp({
  create: { width: 1000, height: 1400, channels: 3, background: '#ffffff' },
}).png().toBuffer()

const crops = await buildFieldImageCrops(
  [{ pageIndex: 0, sourceFileIndex: 0, width: 1000, height: 1400, words }],
  [{ mimetype: 'image/png', buffer: imageBuffer }],
)
assert.equal(crops.length, 1)
assert.equal(crops[0].cropId, 'rent')
assert.equal(crops[0].base64.length > 0, true)

const reviewImages = await buildOllamaReviewImages([
  crops[0],
  { ...crops[0], cropId: 'deposit', fieldIds: ['deposit'] },
])
assert.equal(reviewImages.length, 1)
const reviewMetadata = await sharp(Buffer.from(reviewImages[0], 'base64')).metadata()
assert.equal(reviewMetadata.width > 0, true)
assert.equal(reviewMetadata.height > 0, true)

console.log('Vision field crop checks passed.')
