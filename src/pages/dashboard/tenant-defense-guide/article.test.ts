import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import Article from './article.vue'

it('法條逐筆保留名稱、連結與兩欄內容，手機小標沿用表頭', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/app/contract')
  const app = createSSRApp(Article)
  app.use(router)
  const html = await renderToString(app)
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/)?.[0] ?? ''
  const headings = [...table.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(([, text]) => text)
  expect(headings).toEqual(['法條', '重點', '可怎麼用'])
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
  expect(rows).toHaveLength(4)
  const expected = [
    [
      '住宅租賃定型化契約應記載事項第 14 點',
      'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
      '任意終止、通知與違約金',
      '租約約定得終止時，至少提前一個月通知；未先期通知而逕行終止，違約金最高不得超過一個月租金。',
    ],
    [
      '消費者保護法第 17 條',
      'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&amp;flno=17',
      '公告應記載事項的效力',
      '企業經營者使用的定型化契約違反公告事項時，相關條款可能無效；漏載的應記載事項仍構成契約內容。',
    ],
    [
      '民法第 252 條',
      'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&amp;flno=252',
      '違約金過高可請求法院酌減',
      '即使個案仍有爭議，也可作為請求降低違約金的備援主張。',
    ],
    [
      '民法第 247 條之 1、消保法第 12 條',
      'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&amp;flno=247-1',
      '定型化契約顯失公平',
      '若房東預先擬定條款、加重租客責任，可主張條款無效。',
    ],
  ]
  rows.forEach(([, row], index) => {
    const cells = [...row!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell!)
    expect(cells).toHaveLength(3)
    const [name, href, point, usage] = expected[index]!
    expect(cells[0]).toContain(`href="${href}"`)
    expect(cells[0]).toContain(`>${name}</a>`)
    expect(cells[0]).toContain('target="_blank" rel="noreferrer"')
    expect(cells[1]!.replace(/<[^>]*>/g, '').trim()).toBe(`${headings[1]} ${point}`)
    expect(cells[2]!.replace(/<[^>]*>/g, '').trim()).toBe(`${headings[2]} ${usage}`)
    expect(table.split(`>${name}</a>`)).toHaveLength(2)
  })
})
