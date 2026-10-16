import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import InfoTip from './InfoTip.vue'

const state = vi.hoisted(() => ({ open: false }))

// SSR has no mounted portal target. Render it inline so open-content assertions
// exercise the real reka-ui content and its accessibility markup as well.
vi.mock('reka-ui', async (original) => {
  const reka = await original<typeof import('reka-ui')>()
  return {
    ...reka,
    TooltipRoot: defineComponent({
      setup(_, { slots }) {
        return () => h(reka.TooltipRoot, { open: state.open }, slots)
      },
    }),
    TooltipPortal: defineComponent({
      setup(_, { slots }) {
        return () => h(reka.TooltipPortal, { forceMount: true, disabled: true }, slots)
      },
    }),
  }
})

async function render(props: { text: string; label?: string }, slot?: () => ReturnType<typeof h>) {
  return renderToString(createSSRApp({
    render: () => h(InfoTip, props, slot ? { default: slot } : undefined),
  }))
}

describe('InfoTip', () => {
  it('renders a focusable button with the default accessible label', async () => {
    state.open = false
    const html = await render({ text: '規則說明' })
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="說明"/)
    expect(html).not.toContain('tabindex="-1"')
    expect(html).toContain('focus-visible:ring-2')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('規則說明')
    expect(html).not.toContain('role="tooltip"')
  })

  it('uses a custom accessible label', async () => {
    state.open = false
    expect(await render({ text: '規則說明', label: '登入保護說明' }))
      .toContain('aria-label="登入保護說明"')
  })

  it('renders the text when open without injecting a style element', async () => {
    state.open = true
    const html = await render({ text: '規則說明' })
    expect(html).toContain('規則說明')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('data-side="top"')
    expect(html).not.toMatch(/<style[\s>]/)
  })

  it('prefers the default slot over the text prop', async () => {
    state.open = true
    const html = await render({ text: '備用說明' }, () => h('strong', '插槽說明'))
    expect(html).toContain('<strong>插槽說明</strong>')
    expect(html).not.toContain('備用說明')
    expect(html).not.toMatch(/<style[\s>]/)
  })
})
