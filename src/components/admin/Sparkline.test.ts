import { describe, expect, it } from 'vitest'

import { buildSparklinePoints } from './sparkline'

describe('buildSparklinePoints', () => {
  it('少於 2 個點時回 null', () => {
    expect(buildSparklinePoints([], 28)).toBeNull()
    expect(buildSparklinePoints([5], 28)).toBeNull()
  })

  it('2 個點畫出頭尾兩個座標', () => {
    expect(buildSparklinePoints([0, 10], 28)).toBe('0,28 100,0')
  })

  it('遞減的資料，y 座標會從小往大走（往下）', () => {
    expect(buildSparklinePoints([10, 0], 28)).toBe('0,0 100,28')
  })

  it('所有值相同時畫置中水平線，不會除以 0', () => {
    expect(buildSparklinePoints([5, 5, 5], 28)).toBe('0,14 50,14 100,14')
  })

  it('負數也能正確算出範圍', () => {
    expect(buildSparklinePoints([-10, 0, 10], 28)).toBe('0,28 50,14 100,0')
  })

  it('高度改變時 y 座標會跟著縮放', () => {
    expect(buildSparklinePoints([0, 10], 32)).toBe('0,32 100,0')
  })
})
