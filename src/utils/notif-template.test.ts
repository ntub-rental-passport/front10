import { describe, expect, it } from 'vitest'
import { extractVariables, renderTemplate } from './notif-template'

describe('extractVariables', () => {
  it('擷取多個變數，依出現順序', () => {
    expect(extractVariables('您好 {{姓名}}，金額 {{金額}} 元')).toEqual(['姓名', '金額'])
  })

  it('重複變數去除重複，保留第一次出現的順序', () => {
    expect(extractVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
  })

  it('容許內側空白並修剪', () => {
    expect(extractVariables('{{ 姓名 }}')).toEqual(['姓名'])
  })

  it('沒有變數回傳空陣列', () => {
    expect(extractVariables('沒有變數的文字')).toEqual([])
  })

  it('空字串回傳空陣列', () => {
    expect(extractVariables('')).toEqual([])
  })

  it('未閉合的大括號回傳空陣列', () => {
    expect(extractVariables('{{abc')).toEqual([])
  })
})

describe('renderTemplate', () => {
  it('替換所有提供的變數，包含重複出現的同一變數', () => {
    expect(renderTemplate('{{姓名}} 好，{{姓名}} 再見', { 姓名: '小艾' })).toBe('小艾 好，小艾 再見')
  })

  it('未提供的變數原樣保留為 {{名稱}}', () => {
    expect(renderTemplate('{{姓名}} 您好，金額 {{金額}} 元', {})).toBe('{{姓名}} 您好，金額 {{金額}} 元')
  })

  it('部分提供：已提供的替換，未提供的保留', () => {
    expect(renderTemplate('{{姓名}} 您好，金額 {{金額}} 元', { 姓名: '小艾' })).toBe('小艾 您好，金額 {{金額}} 元')
  })

  it('內側空白格式 {{ 姓名 }} 在提供 vars["姓名"] 時可被替換', () => {
    expect(renderTemplate('{{ 姓名 }} 您好', { 姓名: '小艾' })).toBe('小艾 您好')
  })

  it('沒有變數的文字保持不變', () => {
    expect(renderTemplate('沒有變數的文字', { 姓名: '小艾' })).toBe('沒有變數的文字')
  })

  it('空字串回傳空字串', () => {
    expect(renderTemplate('', { 姓名: '小艾' })).toBe('')
  })

  it('未閉合的大括號保持不變', () => {
    expect(renderTemplate('{{abc', { abc: 'x' })).toBe('{{abc')
  })

  it('特殊字元的值會被原樣插入，不會被當作取代樣式展開（$&）', () => {
    expect(renderTemplate('價格 {{p}}', { p: '$&100' })).toBe('價格 $&100')
  })

  it('特殊字元的值會被原樣插入，不會被當作取代樣式展開（$1）', () => {
    expect(renderTemplate('價格 {{p}}', { p: '$1abc' })).toBe('價格 $1abc')
  })

  it('明確設為 undefined 的變數視為未提供，保留原樣', () => {
    const vars: Record<string, string> = {}
    vars['姓名'] = undefined as unknown as string
    expect(renderTemplate('{{姓名}} 您好', vars)).toBe('{{姓名}} 您好')
  })
})
