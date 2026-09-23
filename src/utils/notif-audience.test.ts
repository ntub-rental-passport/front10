import { describe, expect, it } from 'vitest'

import {
  audiencePreviewText,
  audienceSummary,
  buildAudience,
  matchesAudience,
  namedAudience,
  type AudienceCandidate,
} from './notif-audience'

function candidate(over: Partial<AudienceCandidate> = {}): AudienceCandidate {
  return { email: 'a@example.com', name: '王小明', roles: ['user'], active: true, ...over }
}

const people: AudienceCandidate[] = [
  candidate({ email: 't1@example.com', name: '王小明', roles: ['user'] }),
  candidate({ email: 't2@example.com', name: '李小美', roles: ['user'] }),
  candidate({ email: 'l1@example.com', name: '陳房東', roles: ['landlord'] }),
  candidate({ email: 'a1@example.com', name: '系統管理員', roles: ['admin'] }),
  candidate({ email: 'x1@example.com', name: '停用者', roles: ['user'], active: false }),
]

describe('matchesAudience', () => {
  it('停用的帳號不算 —— 後端 _default_resolve 也是這樣濾的', () => {
    expect(matchesAudience(candidate({ active: false }), 'user')).toBe(false)
    expect(matchesAudience(candidate({ active: false }), 'all')).toBe(false)
  })

  it('管理員永遠不算在廣播對象裡，包含「全部使用者」', () => {
    expect(matchesAudience(candidate({ roles: ['admin'] }), 'all')).toBe(false)
    expect(matchesAudience(candidate({ roles: ['admin'] }), 'user')).toBe(false)
  })

  it('角色要對得上', () => {
    expect(matchesAudience(candidate({ roles: ['user'] }), 'user')).toBe(true)
    expect(matchesAudience(candidate({ roles: ['user'] }), 'landlord')).toBe(false)
    expect(matchesAudience(candidate({ roles: ['landlord'] }), 'landlord')).toBe(true)
  })

  it('一人多角色時，只要有那個角色就算', () => {
    expect(matchesAudience(candidate({ roles: ['user', 'landlord'] }), 'landlord')).toBe(true)
  })
})

describe('buildAudience', () => {
  it('算出人數，排除管理員與停用帳號', () => {
    expect(buildAudience(people, 'all').total).toBe(3)
    expect(buildAudience(people, 'user').total).toBe(2)
    expect(buildAudience(people, 'landlord').total).toBe(1)
  })

  it('沒有暱稱時退回 email，不要顯示成空白', () => {
    const rows = [candidate({ email: 'no-name@example.com', name: null })]
    expect(buildAudience(rows, 'user').preview[0].display).toBe('no-name@example.com')
    expect(buildAudience([candidate({ name: '   ' })], 'user').preview[0].display).toBe(
      'a@example.com',
    )
  })

  it('只回前幾位，其餘算進 rest', () => {
    const many = Array.from({ length: 128 }, (_, i) =>
      candidate({ email: `u${i}@example.com`, name: `租客${i}` }),
    )
    const audience = buildAudience(many, 'user')
    expect(audience.total).toBe(128)
    expect(audience.preview).toHaveLength(10)
    expect(audience.rest).toBe(118)
  })

  it('人數不到 previewSize 時 rest 是 0，不會變負數', () => {
    expect(buildAudience(people, 'landlord').rest).toBe(0)
  })
})

describe('namedAudience', () => {
  it('指定使用者不套角色規則，挑了誰就是誰', () => {
    const audience = namedAudience(['a@example.com', 'b@example.com'], (email) =>
      email === 'a@example.com' ? '王小明' : null,
    )
    expect(audience.total).toBe(2)
    expect(audience.preview.map((m) => m.display)).toEqual(['王小明', 'b@example.com'])
  })
})

describe('摘要文字', () => {
  it('0 人要特別講，否則按下發送什麼都不會發生卻沒有人知道', () => {
    expect(audienceSummary(buildAudience([], 'user'), '全部租客')).toContain('沒有符合的收件人')
  })

  it('有人的時候就講人數', () => {
    expect(audienceSummary(buildAudience(people, 'user'), '全部租客')).toBe('全部租客 · 2 人')
  })

  it('名單在放得下時不寫「等 N 人」', () => {
    expect(audiencePreviewText(buildAudience(people, 'user'))).toBe('王小明、李小美')
  })

  it('超過前 10 位才加「等 N 人」', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate({ email: `u${i}@example.com`, name: `租客${i}` }),
    )
    expect(audiencePreviewText(buildAudience(many, 'user'))).toContain('等 12 人')
  })

  it('沒有人時不回半截文字', () => {
    expect(audiencePreviewText(buildAudience([], 'user'))).toBe('')
  })
})
