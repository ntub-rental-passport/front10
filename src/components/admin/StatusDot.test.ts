import { describe, expect, it } from 'vitest'

import { STATUS_DOT_TONE_CLASS } from './status-dot'

describe('STATUS_DOT_TONE_CLASS', () => {
  it('ok 對到 primary', () => {
    expect(STATUS_DOT_TONE_CLASS.ok).toBe('bg-primary')
  })

  it('warn 對到 accent', () => {
    expect(STATUS_DOT_TONE_CLASS.warn).toBe('bg-accent')
  })

  it('danger 對到 destructive', () => {
    expect(STATUS_DOT_TONE_CLASS.danger).toBe('bg-destructive')
  })

  it('idle 對到 muted-foreground', () => {
    expect(STATUS_DOT_TONE_CLASS.idle).toBe('bg-muted-foreground')
  })

  it('剛好四種狀態，不多不少', () => {
    expect(Object.keys(STATUS_DOT_TONE_CLASS).sort()).toEqual(['danger', 'idle', 'ok', 'warn'])
  })
})
