import { describe, expect, it, vi } from 'vitest'
import { extractUtilityFields, registerUtilityOcr } from './utility-ocr.js'
import express from 'express'
import sharp from 'sharp'

describe('utility OCR extraction', () => {
  it('extracts labelled readings and bill amounts without mixing old readings', () => {
    expect(extractUtilityFields('上期讀數 100\n本期讀數 220\n電號 123456789', 'meter')).toEqual({ current: 220 })
    expect(extractUtilityFields('應繳總金額：1,520\n用電度數 300', 'bill')).toEqual({ amount: 1520 })
    expect(extractUtilityFields('00120.5 kWh', 'meter')).toEqual({ current: 120.5 })
  })
  it('does not guess from ambiguous photos or account numbers', () => {
    expect(extractUtilityFields('電號 123456789\n用電度數 300', 'bill')).toEqual({})
    expect(extractUtilityFields('本期讀數 120\n本期讀數 220', 'meter')).toEqual({})
    expect(extractUtilityFields('電號 123456789\n220 kWh', 'meter')).toEqual({})
  })
  it('checks auth, decodes images, returns extracted fields and handles provider failure', async () => {
    const app = express()
    const recognize = vi.fn().mockResolvedValue([{ fullTextAnnotation: { text: '本期讀數 220' } }])
    const usage = vi.fn()
    registerUtilityOcr(app, { requireAuth: (req, res, next) => req.headers.authorization === 'test' ? next() : res.sendStatus(401), imageClient: { documentTextDetection: recognize }, usageReporter: { record: usage } })
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const url = `http://127.0.0.1:${server.address().port}/api/ocr/utility`
    try {
      expect((await fetch(url, { method: 'POST' })).status).toBe(401)
      const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer()
      const request = async (buffer = png) => {
        const body = new FormData(); body.append('file', new Blob([buffer]), 'meter.png'); body.append('mode', 'meter')
        return fetch(url, { method: 'POST', headers: { Authorization: 'test' }, body })
      }
      expect((await request(Buffer.from('invalid image'))).status).toBe(422)
      expect(recognize).not.toHaveBeenCalled()
      expect((await (await request()).json()).fields).toEqual({ current: 220 })
      expect(usage).toHaveBeenCalledWith(1)
      recognize.mockRejectedValueOnce({ code: 8 })
      const failed = await request()
      expect(failed.status).toBe(503)
      expect((await failed.json()).error).toContain('額度不足')
    } finally { await new Promise(resolve => server.close(resolve)) }
  })
})
