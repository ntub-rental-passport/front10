import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import DesktopOnlyNotice from './DesktopOnlyNotice.vue'

vi.mock('@/src/composables/useAuth', () => ({ signOut: vi.fn() }))

type NoticeProps = InstanceType<typeof DesktopOnlyNotice>['$props']

async function render(props: NoticeProps = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  const app = createSSRApp(DesktopOnlyNotice, props)
  app.use(router)
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

function rootClasses(html: string) {
  return html.match(/^<div\b[^>]*class="([^"]*)"/)![1].split(/\s+/)
}

describe('桌面限定提示', () => {
  it('不傳 prop 時保留原本的管理後台文案、登出按鈕與整頁高度', async () => {
    const html = await render()
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(html).toMatch(/<h1\b[^>]*>後台僅支援桌面瀏覽器<\/h1>/)
    expect(html).toMatch(/<p\b[^>]*>[^<]*審核補助申請[^<]*<\/p>/)
    expect(buttons.filter((button) => button.includes('登出'))).toHaveLength(1)
    expect(html).not.toContain('返回首頁')
    expect(rootClasses(html)).toContain('min-h-[100dvh]')
    expect(rootClasses(html)).not.toContain('min-h-full')
  })

  it('空字串說明不渲染說明段，也不留下空的段落', async () => {
    const html = await render({ description: '' })
    const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g)
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs![0]).toMatch(/>請在電腦上開啟同一個網址。<\/p>/)
    expect(html).not.toContain('審核補助申請')
    expect(html).not.toMatch(/<p\b[^>]*>\s*<\/p>/)
  })

  it('關閉登出選項時不渲染登出按鈕', async () => {
    const html = await render({ showSignOut: false })
    expect(html).not.toContain('登出')
    expect(html).toContain('複製目前網址')
  })

  it('提供首頁路徑時渲染指向該路徑的返回首頁連結', async () => {
    const html = await render({ homePath: '/app' })
    expect(html).toMatch(/<a\b[^>]*href="\/app"[^>]*>\s*返回首頁\s*<\/a>/)
  })

  it('首頁路徑為空字串時不渲染返回首頁連結', async () => {
    const html = await render({ homePath: '' })
    expect(html).not.toContain('返回首頁')
    expect(html).not.toMatch(/<a\b/)
  })

  it('嵌入頁面時根元素使用容器高度而非整個視窗高度', async () => {
    const html = await render({ fullHeight: false })
    expect(rootClasses(html)).toContain('min-h-full')
    expect(rootClasses(html)).not.toContain('min-h-[100dvh]')
  })

  it('可替換標題與說明以供租客或房東頁面使用', async () => {
    const html = await render({ title: '這一頁請用電腦開', description: '請使用桌面瀏覽器操作。' })
    expect(html).toMatch(/<h1\b[^>]*>這一頁請用電腦開<\/h1>/)
    expect(html).toMatch(/<p\b[^>]*>請使用桌面瀏覽器操作。<\/p>/)
    expect(html).not.toContain('後台僅支援桌面瀏覽器')
    expect(html).not.toContain('審核補助申請')
  })

  it.each<{ label: string; props: NoticeProps }>([
    { label: '預設選項', props: {} },
    { label: '自訂標題與說明', props: { title: '這一頁請用電腦開', description: '自訂說明' } },
    { label: '隱藏說明', props: { description: '' } },
    { label: '隱藏登出', props: { showSignOut: false } },
    { label: '提供首頁連結', props: { homePath: '/app' } },
    { label: '嵌入容器', props: { fullHeight: false } },
    {
      label: '租客頁面選項組合',
      props: {
        title: '這一頁請用電腦開',
        description: '',
        showSignOut: false,
        homePath: '/app',
        fullHeight: false,
      },
    },
  ])('$label 仍顯示在電腦上開啟同一網址的提示', async ({ props }) => {
    const html = await render(props)
    expect(html).toContain('請在電腦上開啟同一個網址。')
  })
})
