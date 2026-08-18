import { describe, expect, it } from 'vitest'
import { confirmSendCopy } from './notif-confirm'

describe('confirmSendCopy', () => {
  it('角色群發只顯示人數', () => {
    expect(confirmSendCopy({ kind: 'role', count: 57 })).toBe(
      '即將發送給 57 位使用者，此操作無法復原。',
    )
  })

  it('指定 1 位使用者時列出名字', () => {
    expect(confirmSendCopy({ kind: 'users', names: ['王小明'] })).toBe(
      '即將發送給 王小明，此操作無法復原。',
    )
  })

  it('指定多位（未達 5 位）使用者時列出所有名字', () => {
    expect(confirmSendCopy({ kind: 'users', names: ['王小明', '李小華', '陳大同'] })).toBe(
      '即將發送給 王小明、李小華、陳大同，此操作無法復原。',
    )
  })

  it('剛好 5 位使用者仍列出名字', () => {
    const names = ['王小明', '李小華', '陳大同', '林美玲', '張志豪']
    expect(confirmSendCopy({ kind: 'users', names })).toBe(
      `即將發送給 ${names.join('、')}，此操作無法復原。`,
    )
  })

  it('超過 5 位使用者時回到人數', () => {
    const names = ['王小明', '李小華', '陳大同', '林美玲', '張志豪', '黃淑芬']
    expect(confirmSendCopy({ kind: 'users', names })).toBe('即將發送給 6 位使用者，此操作無法復原。')
  })
})
