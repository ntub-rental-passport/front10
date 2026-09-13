import assert from 'node:assert/strict'
import { normalizeVisionAnnotation } from '../server/vision-annotation.js'

const annotation = {
  text: '租金 伍仟元',
  pages: [
    {
      width: 1000,
      height: 1400,
      confidence: 0.91,
      blocks: [
        {
          confidence: 0.88,
          boundingBox: { vertices: [{}, { x: 300 }, { x: 300, y: 120 }, { y: 120 }] },
          paragraphs: [
            {
              confidence: 0.87,
              words: [
                {
                  confidence: 0.96,
                  boundingBox: {
                    vertices: [{ x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 60 }, { x: 10, y: 60 }],
                  },
                  symbols: [
                    { text: '租', confidence: 0.97 },
                    {
                      text: '金',
                      confidence: 0.95,
                      property: { detectedBreak: { type: 'SPACE' } },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const result = normalizeVisionAnnotation(annotation, { sourceFileIndex: 2 })
assert.equal(result.text, '租金 伍仟元')
assert.equal(result.pages[0].sourceFileIndex, 2)
assert.equal(result.pages[0].width, 1000)
assert.equal(result.pages[0].words[0].text, '租金')
assert.equal(result.pages[0].words[0].symbols[1].detectedBreak.text, ' ')
assert.deepEqual(result.pages[0].blocks[0].boundingBox.vertices[0], { x: 0, y: 0 })
assert.equal(result.pages[0].blocks[0].boundingBox.width, 300)
assert.equal(result.pages[0].blocks[0].boundingBox.height, 120)

console.log('Vision fullTextAnnotation normalization checks passed.')
