import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import sharp from 'sharp'
import Actions from './actions.vue'
import OutageIndex from './index.vue'
import OutageShell from './OutageShell.vue'
import { useOutageData } from './useOutageData'

describe('停電停水圖片載入', () => {
  it('僅保留 19 張 WebP，符合尺寸、透明度與檔案大小上限', async () => {
    const directory = join(fileURLToPath(new URL('../../assets/', import.meta.url)), 'outage')
    const files = readdirSync(directory)
    const decorativeSizes: Record<string, [number, number]> = {
      'outage-hero.webp': [666, 375],
      'outage-power.webp': [577, 433],
      'outage-water.webp': [577, 433],
    }

    expect(files).toHaveLength(19)
    expect(files.every(file => file.endsWith('.webp'))).toBe(true)
    expect(files.reduce((total, file) => total + statSync(join(directory, file)).size, 0))
      .toBeLessThan(700_000)

    for (const file of files) {
      const path = join(directory, file)
      const metadata = await sharp(path).metadata()
      expect(metadata.format).toBe('webp')
      if (file.startsWith('outage-')) {
        expect([metadata.width, metadata.height]).toEqual(decorativeSizes[file])
        expect(metadata.hasAlpha).toBe(true)
      } else {
        expect([metadata.width, metadata.height]).toEqual([384, 384])
        expect(statSync(path).size).toBeLessThan(45_000)
      }
    }
  })

  it.each(['power', 'water'] as const)('%s 準備卡片延後載入並預留圖片尺寸', async (guide) => {
    const app = createSSRApp(defineComponent({
      setup() {
        const { activePrepGuide } = useOutageData()
        activePrepGuide.value = guide
        return () => h(Actions)
      },
    }))
    const images = (await renderToString(app)).match(/<img\b[^>]*>/g) ?? []

    expect(images).toHaveLength(9)
    for (const image of images) {
      expect(image).toMatch(/src="[^"]+\.webp"/)
      expect(image).toContain('loading="lazy"')
      expect(image).toContain('decoding="async"')
      expect(image).toContain('width="384"')
      expect(image).toContain('height="384"')
      expect(image).toContain('max-h-[128px] w-auto max-w-[188px] object-contain')
    }
  })

  it('首頁兩張裝飾圖延後載入', async () => {
    const images = (await renderToString(createSSRApp(OutageIndex))).match(/<img\b[^>]*>/g) ?? []

    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image).toMatch(/src="[^"]+outage-(power|water)\.webp"/)
      expect(image).toContain('loading="lazy"')
    }
  })

  it('首屏 hero 圖維持立即載入', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/app/outage')
    const app = createSSRApp(OutageShell)
    app.use(router)
    const images = (await renderToString(app)).match(/<img\b[^>]*>/g) ?? []

    expect(images).toHaveLength(1)
    expect(images[0]).toMatch(/src="[^"]+outage-hero\.webp"/)
    expect(images[0]).not.toContain('loading="lazy"')
  })
})
