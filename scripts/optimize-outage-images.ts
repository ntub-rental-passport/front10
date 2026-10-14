/**
 * 原始 PNG 可從 git commit 8b779a45 取回，例如：
 * git show '8b779a45:src/assets/outage/01 .png' > 'src/assets/outage/01 .png'
 * 刪除 PNG 後仍從該 commit 讀取來源，避免重複壓縮 WebP 造成畫質退化。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const imageDirectory = new URL('../src/assets/outage/', import.meta.url)
const cardImages = [
  '01', '03', '05', '06', '08', '10', '11', '12',
  '13', '14', '15', '16', '17', '18', '23', '24',
]
const decorativeImages = ['outage-hero', 'outage-power', 'outage-water']

for (const name of [...cardImages, ...decorativeImages]) {
  const sourceName = name === '01' ? '01 .png' : `${name}.png`
  const sourcePath = fileURLToPath(new URL(sourceName, imageDirectory))
  const source = existsSync(sourcePath)
    ? readFileSync(sourcePath)
    : execFileSync('git', ['show', `8b779a45:src/assets/outage/${sourceName}`], {
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024,
      })
  const isCard = cardImages.includes(name)
  const image = sharp(source)

  if (isCard) {
    // 保留 3× DPR 所需的像素，小圖則避免放大造成模糊。
    image.resize(384, 384, { fit: 'inside', withoutEnlargement: true })
  }

  await image
    .webp({ quality: isCard ? 80 : 82 })
    .toFile(fileURLToPath(new URL(`${name}.webp`, imageDirectory)))
}
