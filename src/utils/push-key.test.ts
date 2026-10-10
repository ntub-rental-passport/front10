import { expect, it } from 'vitest'
import { base64UrlToBytes, isSameKey } from './push-key'

it('decodes base64url characters with and without padding', () => {
  expect(base64UrlToBytes('-_8')).toEqual(new Uint8Array([251, 255]))
  expect(base64UrlToBytes('-_8=')).toEqual(new Uint8Array([251, 255]))
  expect(base64UrlToBytes('AQIDBA')).toEqual(new Uint8Array([1, 2, 3, 4]))
})

it('reuses a subscription only when every key byte matches', () => {
  const expected = new Uint8Array([1, 2, 3])
  expect(isSameKey(new Uint8Array([1, 2, 3]).buffer, expected)).toBe(true)
  expect(isSameKey(new Uint8Array([1, 2, 4]).buffer, expected)).toBe(false)
  expect(isSameKey(new Uint8Array([1, 2]).buffer, expected)).toBe(false)
  expect(isSameKey(null, expected)).toBe(false)
})
