// Headless Chrome smoke test, no additional npm dependencies. Uses an isolated
// profile and intercepts garbage APIs; no real reminders or emails are created.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const origin = process.env.GARBAGE_TEST_ORIGIN || 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'rentmate-garbage-browser-'))
const browser = spawn(
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9337',
    '--user-data-dir=' + profile,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
)
let socket
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  let target
  for (let i = 0; i < 60; i++) {
    try {
      target = (await (await fetch('http://127.0.0.1:9337/json/list')).json()).find(
        (t) => t.type === 'page',
      )
      if (target) break
    } catch {
      /* Chrome is starting. */
    }
    await delay(500)
  }
  assert(target, 'Chrome debugging endpoint unavailable')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let id = 0
  const pending = new Map(),
    exceptions = []
  const networkRequests = new Map(),
    mapFailures = []
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('CDP timeout: ' + method))
      }, 20000)
      pending.set(requestId, {
        resolve: (v) => {
          clearTimeout(timeout)
          resolve(v)
        },
        reject,
      })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
  socket.onmessage = async ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails.text)
    if (message.method === 'Network.requestWillBeSent')
      networkRequests.set(message.params.requestId, message.params.request.url)
    if (message.method === 'Network.loadingFailed') {
      const url = networkRequests.get(message.params.requestId) || ''
      if (url.includes('openfreemap')) mapFailures.push(message.params.errorText)
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      const payload = request.url.endsWith('/vehicles')
        ? {
            status: 'unconfigured',
            message: '車輛 GPS 尚未接通；目前顯示官方表定時間。',
            vehicles: [],
          }
        : request.url.endsWith('/capabilities')
          ? { email: false, push: false, publicKey: '' }
          : []
      await send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      })
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/garbage/*' }] })
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Taipei' })
  await send('Browser.grantPermissions', { origin, permissions: ['geolocation'] })
  await send('Emulation.setGeolocationOverride', {
    latitude: 25.11836,
    longitude: 121.525,
    accuracy: 10,
  })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('rentmate-auth-session-v2', JSON.stringify({userId:'garbage-browser-test',email:'garbage-test@example.com',isAuthenticated:true,role:'tenant',emailVerified:true,nickname:'Browser test',issuedAt:Date.now(),accessToken:'test-only-intercepted'}))`,
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (response.exceptionDetails)
      throw new Error(response.exceptionDetails.text + ': ' + expression)
    return response.result.value
  }
  const until = async (expression) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return
      await delay(500)
    }
    console.log(
      'Page diagnostics:',
      await evaluate(`({url:location.href,text:document.body.innerText.slice(0,2500)})`),
      exceptions,
    )
    throw new Error('Timed out waiting for: ' + expression)
  }
  const clickTab = async (text) => {
    await evaluate(
      `[...document.querySelectorAll('.garbage-tabs button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`,
    )
    await delay(300)
  }
  await send('Page.navigate', { url: origin + '/app/garbage' })
  await until(`document.querySelector('.garbage-footer')?.textContent.includes('4,010')`)

  await until(`document.querySelector('.garbage-map-shell')?.dataset.ready === 'true'`)
  const inspect = async (label) => {
    const dimensions = await evaluate(
      `(() => {const e=document.querySelector('.garbage-map');const c=e.querySelector('canvas');const gl=c.getContext('webgl2');return {container:[e.clientWidth,e.clientHeight],canvas:[c.width,c.height,c.clientWidth,c.clientHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],viewport:[...gl.getParameter(gl.VIEWPORT)],dpr:devicePixelRatio};})()`,
    )
    assert.deepEqual(dimensions.canvas.slice(2), dimensions.container, label + ': CSS canvas size')
    assert.deepEqual(
      dimensions.buffer,
      dimensions.canvas.slice(0, 2),
      label + ': drawing buffer size',
    )
    for (let i = 0; i < 2; i++)
      assert(
        Math.abs(dimensions.canvas[i] - dimensions.container[i] * dimensions.dpr) <= 1,
        label + ': pixel ratio mismatch',
      )
  }
  await inspect('initial')
  for (const ratio of [1, 1.25, 2, 1]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1854,
      height: 847,
      deviceScaleFactor: ratio,
      mobile: false,
    })
    for (const y of [350, 100000, 0]) {
      await evaluate(`document.querySelector('main').scrollTop = ${y}`)
      await delay(500)
      await inspect('dpr ' + ratio + ' scroll ' + y)
    }
  }
  console.log('Map canvas dimensions passed at all scroll positions and pixel ratios (1, 1.25, 2).')
} finally {
  socket?.close()
  browser.kill()
}
