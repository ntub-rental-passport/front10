// Uses scripts/password-preview.py on 8012 and Vite on 5182. Never connects to team data.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const target = await (await fetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
const errors = []
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data)
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text)
  if (data.id) {
    const entry = pending.get(data.id)
    pending.delete(data.id)
    if (data.error) entry.reject(data.error)
    else entry.resolve(data.result)
  }
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id
    pending.set(key, { resolve, reject })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function waitFor(expression) {
  for (let i = 0; i < 180; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw Error(`Timed out: ${expression}`)
}
async function fill(selector, value) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}
async function submit() { await evaluate(`document.querySelector('form').requestSubmit()`) }
async function navigate(path) {
  await send('Page.navigate', { url: 'http://127.0.0.1:5182' + path })
}
async function screenshot(name) {
  await new Promise(resolve => setTimeout(resolve, 400))
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await fs.writeFile(`outputs/password-${name}.png`, Buffer.from(result.data, 'base64'))
}
async function viewport(width) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 })
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await viewport(1440)
  await navigate('/login?role=landlord')
  await waitFor(`!!document.querySelector('a[href*="forgot-password"]')`)
  await evaluate(`document.querySelector('a[href*="forgot-password"]').click()`)
  await waitFor(`!!document.querySelector('#reset-email')`)
  assert.match(await evaluate('location.search'), /landlord/)
  await screenshot('desktop-email')
  await fill('#reset-email', 'not-an-email')
  await submit()
  await waitFor(`!!document.querySelector('[role="alert"]')`)
  await fill('#reset-email', 'password-browser@example.com')
  await submit()
  await waitFor(`!!document.querySelector('#reset-code')`)
  const code = (await (await fetch('http://127.0.0.1:8012/api/test/password-code')).json()).code
  assert.match(code, /^\d{6}$/)
  assert.equal(await evaluate(`document.querySelector('.password-resend button').disabled`), true)
  await fill('#reset-code', '000000' === code ? '111111' : '000000')
  await fill('#new-password', 'Replacement-pass-2')
  await fill('#confirm-password', 'Mismatch-pass-3')
  await submit()
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('不一致')`)
  await fill('#confirm-password', 'Replacement-pass-2')
  await submit()
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('驗證碼不正確')`)
  await fill('#reset-code', code)
  for (const width of [1440, 768, 390, 320]) {
    await viewport(width)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= ${width}`), true, `No horizontal overflow at ${width}`)
    const rect = await evaluate(`(() => { const r = document.querySelector('button[type="submit"]').getBoundingClientRect(); return { left:r.left, right:r.right }; })()`)
    assert.ok(rect.left >= 0 && rect.right <= width)
    await screenshot(`code-${width}`)
  }
  await submit()
  await waitFor(`!!document.querySelector('.password-success')`)
  await screenshot('success-mobile')
  assert.match(await evaluate(`document.querySelector('.password-success a').getAttribute('href')`), /role=landlord/)
  const oldLogin = await fetch('http://127.0.0.1:8012/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'password-browser@example.com', password: 'Original-pass-1', role: 'tenant' }) })
  assert.equal(oldLogin.status, 401)
  await viewport(1440)
  await navigate('/login?role=landlord&redirect=/change-password')
  await waitFor(`!!document.querySelector('#login-email')`)
  await fill('#login-email', 'password-browser@example.com')
  await fill('#login-password', 'Replacement-pass-2')
  await submit()
  await waitFor(`!!document.querySelector('#current-password')`)
  await screenshot('change-desktop')
  await fill('#current-password', 'Wrong-pass-1')
  await fill('#new-password', 'Changed-pass-3')
  await fill('#confirm-password', 'Changed-pass-3')
  await submit()
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('目前密碼不正確')`)
  await fill('#current-password', 'Replacement-pass-2')
  await viewport(390)
  await screenshot('change-mobile')
  await submit()
  await waitFor(`!!document.querySelector('.password-success')`)
  const newLogin = await fetch('http://127.0.0.1:8012/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'password-browser@example.com', password: 'Changed-pass-3', role: 'tenant' }) })
  assert.equal(newLogin.status, 200)
  assert.deepEqual(errors, [])
  console.log('PASS: real API reset/change/login, invalid email/code/password, resend cooldown, role preservation, 1440/768/390/320 layouts; email captured locally.')
} finally {
  await send('Page.close').catch(() => {})
  socket.close()
}
