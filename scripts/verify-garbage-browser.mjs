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
  assert.equal(await evaluate(`document.querySelectorAll('.garbage-tabs button').length`), 7)
  assert.equal(
    await evaluate(`document.querySelectorAll('.map-filter-summary, .nearby-empty').length`),
    0,
    'Map mode should omit redundant location panels',
  )
  assert(
    await evaluate(
      `[...document.querySelectorAll('.map-tools button')].every(b => !b.textContent.trim() && b.getAttribute('aria-label') && b.querySelector('svg'))`,
    ),
    'Map tools should be labeled icon-only buttons',
  )
  assert(
    await evaluate(
      `document.querySelector('.garbage-page--map').getBoundingClientRect().width >= document.querySelector('main').clientWidth - 40`,
    ),
    'Map should use nearly all of the layout width',
  )
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.station-table, .results-heading, .pagination').length`,
    ),
    0,
    'Map mode should not render the station list',
  )
  assert.equal(await evaluate(`document.querySelectorAll('.filter-panel').length`), 0)
  assert(
    await evaluate(
      `document.querySelector('.wide-map').getBoundingClientRect().width >= document.querySelector('.query-layout').getBoundingClientRect().width - 2`,
    ),
  )
  await evaluate(`document.querySelector('.map-query-button').click()`)
  await until(`document.querySelector('[role=dialog] .filter-panel')`)
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await until(`!document.querySelector('[role=dialog]')`)
  await evaluate(`document.querySelector('.map-query-button').click()`)
  await until(`document.querySelector('[role=dialog] .filter-panel')`)
  await evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`)
  await until(`!document.querySelector('[role=dialog]')`)
  await evaluate(`document.querySelector('.station-detail .detail-close')?.click()`)
  console.log('Full-width map and filter dialog: passed')
  assert.equal(await evaluate(`document.querySelectorAll('.schedule-clock, .subtitle').length`), 0)
  assert(
    await evaluate(`(() => {
    const title = document.querySelector('.garbage-header').getBoundingClientRect();
    const tabs = document.querySelector('.garbage-tabs').getBoundingClientRect();
    const city = document.querySelector('.garbage-sticky-header .coverage').getBoundingClientRect();
    return title.right <= tabs.left && tabs.right <= city.left && Math.abs(title.top + title.height / 2 - tabs.top - tabs.height / 2) < 2;
  })()`),
    'Title, tabs and city selector should share one desktop row',
  )
  assert.equal(await evaluate(`document.querySelectorAll('.status-filters button').length`), 5)
  assert(
    await evaluate(`(() => {
    const map = document.querySelector('.map-query-stage').getBoundingClientRect();
    const filters = document.querySelector('.status-filters').getBoundingClientRect();
    const live = document.querySelector('.live-section').getBoundingClientRect();
    return live.bottom <= filters.top && filters.bottom <= map.top;
  })()`),
    'Quick filters should be between the map and dashboard',
  )
  await evaluate(`document.querySelector('main').scrollTop = 500`)
  await delay(200)
  assert(
    await evaluate(
      `Math.abs(document.querySelector('.garbage-sticky-header').getBoundingClientRect().top - document.querySelector('main').getBoundingClientRect().top) < 2`,
    ),
    'Title and tabs should stay at the top while scrolling',
  )
  await evaluate(`document.querySelector('main').scrollTop = 0`)
  await evaluate(`document.querySelectorAll('.status-filters button')[2].click()`)
  await until(
    `document.querySelectorAll('.status-filters button')[2].getAttribute('aria-pressed') === 'true'`,
  )
  await evaluate(`document.querySelector('.status-filters button').click()`)
  await clickTab('列表查詢')
  assert.equal(await evaluate(`document.querySelectorAll('.live-section').length`), 0)
  // A known collection day makes this check independent of today's weekday.
  await evaluate(
    `(()=>{const e=document.querySelector('.filter-panel input[type=date]');e.value='2026-09-08';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  )
  await until(`document.querySelectorAll('.station-table tbody tr').length === 20`)
  assert.equal(
    await evaluate(`document.querySelectorAll('.station-table .collection-countdown').length`),
    20,
  )
  await evaluate(
    `(()=>{const e=document.querySelectorAll('.filter-panel select')[1];e.value='士林區';e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  )
  await until(`document.querySelector('.result-count')?.textContent === '654'`)
  await evaluate(`document.querySelector('.station-table .favorite-button').click()`)
  await clickTab('我的收藏')
  await until(`document.querySelectorAll('.station-table tbody tr').length === 1`)
  await send('Page.reload')
  await until(
    `performance.getEntriesByType('navigation')[0]?.type === 'reload' && document.readyState === 'complete'`,
  )
  await until(`document.querySelector('.garbage-footer')?.textContent.includes('4,010')`)
  await clickTab('我的收藏')
  await until(`document.querySelectorAll('.station-table tbody tr').length === 1`)
  await clickTab('附近查詢')
  await until(`document.querySelectorAll('.station-table tbody tr').length > 0`)
  assert.equal(await evaluate(`document.querySelectorAll('.live-section').length`), 0)
  assert.deepEqual(
    await evaluate(
      `[...document.querySelector('.nearby-controls select').options].map(o => +o.value)`,
    ),
    [100, 200, 300, 400, 500],
  )
  for (const radius of [100, 200, 300, 400, 500]) {
    await evaluate(
      `(() => { const select = document.querySelector('.nearby-controls select'); select.value = '${radius}'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`,
    )
    await delay(200)
    assert(
      await evaluate(
        `[...document.querySelectorAll('.station-table tbody tr td:first-child small')].every(e => {const m=e.textContent.match(/([0-9]+) m/);return m && +m[1]<=${radius}})`,
      ),
      `Nearby results should stay within ${radius} metres`,
    )
  }
  assert(
    await evaluate(
      `[...document.querySelectorAll('.station-table tbody tr td:first-child small')].every(e=>{const m=e.textContent.match(/([0-9]+) m/);return m && +m[1]<=500})`,
    ),
  )
  await clickTab('手動定位')
  await until(`document.querySelector('.garbage-map-shell')?.dataset.ready === 'true'`)
  await evaluate(
    `document.querySelector('.maplibregl-canvas').scrollIntoView({block:'center',behavior:'instant'})`,
  )
  await delay(600)
  const rect = await evaluate(
    `(()=>{const r=document.querySelector('.maplibregl-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  )
  console.log(
    'Map click target:',
    await evaluate(
      `(()=>{const r=document.querySelector('.maplibregl-canvas').getBoundingClientRect();return {top:r.top,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className}})()`,
    ),
  )
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rect })
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...rect,
    button: 'left',
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...rect,
    button: 'left',
    clickCount: 1,
  })
  await until(`document.querySelector('.manual-location')`)
  assert(
    await evaluate(
      `[...document.querySelectorAll('.tracker-card footer span')].every(e => {const m=e.textContent.match(/([0-9]+) m/);return m && +m[1]<=200})`,
    ),
    'Manual dashboard must use a 200 metre radius',
  )
  assert.equal(
    await evaluate(`document.querySelectorAll('.nearby-empty, .results-column .notice').length`),
    0,
  )
  const disclosure = await evaluate(`document.querySelector('.tracker-card details') !== null`)
  if (disclosure) {
    assert.equal(await evaluate(`document.querySelector('.tracker-card details').open`), false)
    await evaluate(`document.querySelector('.tracker-card summary').click()`)
    assert.equal(await evaluate(`document.querySelector('.tracker-card details').open`), true)
    await evaluate(`document.querySelector('.tracker-card summary').click()`)
  }
  console.log('manual map click: passed')
  const firstManualCards = await evaluate(
    `[...document.querySelectorAll('.tracker-card .station-title')].map(e => e.textContent).join('|')`,
  )
  const movedPoint = { x: rect.x + 180, y: rect.y }
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...movedPoint,
    button: 'left',
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...movedPoint,
    button: 'left',
    clickCount: 1,
  })
  await delay(500)
  assert.notEqual(
    await evaluate(
      `[...document.querySelectorAll('.tracker-card .station-title')].map(e => e.textContent).join('|')`,
    ),
    firstManualCards,
    'Moving the manual center should update dashboard stations instead of using GPS',
  )
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...rect,
    button: 'left',
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...rect,
    button: 'left',
    clickCount: 1,
  })
  await until(`document.querySelector('.tracker-card footer button')`)
  await evaluate(`document.querySelector('.tracker-card footer button').click()`)
  await until(`document.querySelector('.weekly-schedule')`)
  assert.equal(await evaluate(`document.querySelectorAll('.weekly-schedule tbody tr').length`), 7)
  assert(
    await evaluate(
      `document.querySelector('.garbage-tabs button[aria-current=page]').textContent.includes('列表查詢')`,
    ),
  )
  await evaluate(`document.querySelector('.weekly-schedule button').click()`)
  await clickTab('提醒設定')
  assert.equal(await evaluate(`document.querySelectorAll('.channel input:disabled').length`), 2)
  await clickTab('操作指引')
  assert.equal(await evaluate(`document.querySelectorAll('.guide-card').length`), 6)
  await clickTab('地圖查詢')
  await until(`document.querySelector('.garbage-map-shell')?.dataset.ready === 'true'`)
  await evaluate(`document.querySelector('.map-tools button').click()`)
  await until(`document.querySelector('.route-drawer select')?.options.length > 1`)
  await evaluate(
    `(()=>{const s=document.querySelector('.route-drawer select');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  )
  await evaluate(`(async () => {
    const source = await (await fetch('/src/components/garbage/GarbageMap.vue')).text();
    const moduleUrl = source.match(/from "([^"]*maplibre-gl\\.js[^"]*)"/)[1];
    const Map = (await import(moduleUrl)).default.Map;
    const getSource = Map.prototype.getSource;
    Map.prototype.getSource = function(...args) {
      window.__garbageTestMap = this;
      return getSource.apply(this, args);
    };
  })()`)
  await until(`document.querySelectorAll('.route-drawer li').length > 0`)
  assert(
    await evaluate(
      `[...document.querySelectorAll('.route-sequence')].every((e, i) => +e.textContent === i + 1)`,
    ),
    'Route rows should have visible sequential numbers',
  )
  await evaluate(
    `(() => {const input = document.querySelector('.route-drawer input'); input.value = 'nonexistent-route-xyz'; input.dispatchEvent(new Event('input', {bubbles:true}));})()`,
  )
  await until(`document.querySelector('.route-drawer p[role=status]')`)
  await evaluate(
    `(() => {const input = document.querySelector('.route-drawer input'); input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true}));})()`,
  )
  await until(`!document.querySelector('.route-drawer p[role=status]')`)
  await evaluate(`document.querySelector('.route-drawer li button').click()`)
  await until(`document.querySelector('.detail-route-link')`)
  const routeBeforeLink = await evaluate(`document.querySelector('.route-drawer select').value`)
  await evaluate(
    `document.querySelector('.route-drawer header button').click(); document.querySelector('.detail-route-link').click()`,
  )
  await until(
    `document.querySelector('.route-drawer li') && !document.querySelector('.station-detail')`,
  )
  assert.equal(
    await evaluate(`document.querySelector('.route-drawer select').value`),
    routeBeforeLink,
    'Details link should open the same route',
  )
  await delay(800)
  await evaluate(
    `document.querySelector('.route-drawer select').dispatchEvent(new Event('change', {bubbles:true}))`,
  )
  const routeGeometry = `window.__garbageTestMap.getSource('route-order')._data.geojson.geometry.coordinates.length`
  const routeLabels = `window.__garbageTestMap.getSource('route-times')._data.geojson.features.length`
  assert(await evaluate(routeGeometry + ' > 0'), 'Selected route should be drawn')
  await evaluate(`document.querySelector('.route-actions button').click()`)
  await until(`document.querySelector('.route-actions button').textContent.includes('顯示路線')`)
  assert.equal(await evaluate(routeGeometry), 0, 'Hide should remove route geometry')
  assert.equal(await evaluate(routeLabels), 0, 'Hide should remove route numbers')
  assert(
    await evaluate(`document.querySelectorAll('.route-drawer li').length > 0`),
    'Hide should preserve the route list',
  )
  await evaluate(`document.querySelector('.route-actions button').click()`)
  await until(routeGeometry + ' > 0')
  const dragStart = await evaluate(
    `(() => {const r = document.querySelector('.route-drawer header').getBoundingClientRect(); return {x:r.left + 30, y:r.top + r.height / 2};})()`,
  )
  const drawerLeft = await evaluate(`document.querySelector('.route-drawer').offsetLeft`)
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...dragStart,
    button: 'left',
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: dragStart.x + 100,
    y: dragStart.y + 30,
    button: 'left',
    buttons: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: dragStart.x + 100,
    y: dragStart.y + 30,
    button: 'left',
    clickCount: 1,
  })
  assert(
    await evaluate(`document.querySelector('.route-drawer').offsetLeft > ${drawerLeft} + 50`),
    'Route card should move when dragged',
  )
  await evaluate(`document.querySelectorAll('.map-tools button')[1].click()`)
  await until(`document.querySelector('.garbage-map-shell').dataset.layer === 'aerial'`)
  await delay(1500)
  assert(
    await evaluate(`document.querySelectorAll('.route-drawer li').length > 0`),
    'Route should survive layer changes',
  )
  await evaluate(
    `document.querySelector('.map-query-stage').scrollIntoView({block:'start',behavior:'instant'})`,
  )
  const aerial = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(profile, 'aerial.png'), Buffer.from(aerial.data, 'base64'))
  await evaluate(
    `document.querySelectorAll('.map-tools button')[1].click();document.querySelector('.route-drawer header button').click()`,
  )
  await until(`document.querySelector('.garbage-map-shell').dataset.layer === 'street'`)
  assert.equal(await evaluate(routeGeometry), 0, 'Close should clear route geometry')
  assert.equal(await evaluate(routeLabels), 0, 'Close should clear route numbers')
  await evaluate(`document.querySelector('.garbage-footer button').click()`)
  await until(`document.querySelector('[role=dialog] textarea')`)
  await evaluate(
    `(()=>{const e=document.querySelector('[role=dialog] textarea');e.value='測試回報：站點地址與實際位置不符';e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  )
  await until(`document.querySelector('[role=dialog] a.primary-button')`)
  assert(
    await evaluate(
      `document.querySelector('[role=dialog] a.primary-button').href.startsWith('https://github.com/ntub-rental-passport/front10/issues/new?')`,
    ),
  )
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await until(`!document.querySelector('[role=dialog]')`)
  console.log('Route list, aerial switch and report draft: passed (no issue submitted)')
  const chooseCity = async (city) => {
    await evaluate(
      `(()=>{const s=document.querySelector('select[aria-label="清運縣市"]');s.value=${JSON.stringify(city)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    )
    await until(
      `document.querySelector('h1')?.textContent.includes(${JSON.stringify(city)}) && !document.querySelector('.notice[role=status]')`,
    )
  }
  await chooseCity('新北市')
  await until(`document.querySelector('.garbage-footer')?.textContent.includes('26,655')`)
  assert.equal(await evaluate(`document.querySelector('.gps-status')`), null)
  await clickTab('列表查詢')
  assert.equal(
    await evaluate(`document.querySelectorAll('.filter-panel select')[1].options.length`),
    30,
  )
  await evaluate(
    `(()=>{const s=document.querySelectorAll('.filter-panel select')[1];s.value='板橋區';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  )
  await until(`document.querySelectorAll('.station-table tbody tr').length === 20`)
  assert(
    await evaluate(
      `[...document.querySelectorAll('.station-table .station-title')].every(e=>e.textContent.includes('新北市板橋區'))`,
    ),
  )
  await evaluate(`document.querySelector('.station-table .favorite-button').click()`)
  await clickTab('我的收藏')
  await until(`document.querySelectorAll('.station-table tbody tr').length === 1`)
  assert(
    await evaluate(
      `document.querySelector('.station-table .station-title').textContent.includes('新北市')`,
    ),
  )
  await chooseCity('臺北市')
  await until(`document.querySelector('.garbage-footer')?.textContent.includes('4,010')`)
  await until(`document.querySelectorAll('.station-table tbody tr').length === 1`)
  assert(
    await evaluate(
      `!document.querySelector('.station-table .station-title').textContent.includes('新北市')`,
    ),
  )
  await chooseCity('新北市')
  await until(`document.querySelector('.garbage-footer')?.textContent.includes('26,655')`)
  await send('Emulation.setGeolocationOverride', {
    latitude: 25.012,
    longitude: 121.462,
    accuracy: 10,
  })
  await clickTab('附近查詢')
  await until(`document.querySelectorAll('.station-table tbody tr').length > 0`)
  assert.equal(await evaluate(`document.querySelectorAll('.live-section').length`), 0)
  assert(
    await evaluate(
      `[...document.querySelectorAll('.station-table tbody tr td:first-child small')].every(e=>{const m=e.textContent.match(/([0-9]+) m/);return m && +m[1]<=500})`,
    ),
  )
  await clickTab('地圖查詢')
  await until(`document.querySelector('.garbage-map-shell')?.dataset.ready === 'true'`)
  console.log(
    'New Taipei city switch, 29 districts, filtered stations and city-separated favorites: passed',
  )
  await evaluate(
    `window.scrollTo(0,0); document.querySelector('.garbage-header').scrollIntoView({block:'start'})`,
  )
  await delay(10000)
  const desktop = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(profile, 'desktop.png'), Buffer.from(desktop.data, 'base64'))
  await evaluate(`document.querySelector('.map-query-button').click()`)
  await until(`document.querySelector('[role=dialog] .filter-panel')`)
  await delay(400)
  const popup = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(profile, 'filters.png'), Buffer.from(popup.data, 'base64'))
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await until(`!document.querySelector('[role=dialog]')`)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await delay(700)
  assert(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`),
    'Mobile viewport has horizontal overflow',
  )
  await evaluate(
    `document.querySelector('.map-query-stage').scrollIntoView({block:'start',behavior:'instant'})`,
  )
  await delay(500)
  const mobile = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(profile, 'mobile.png'), Buffer.from(mobile.data, 'base64'))
  assert.deepEqual(exceptions, [], 'Unexpected browser runtime exceptions')
  console.log('Browser smoke checks passed. Screenshots:', profile)
  console.log('Map network failures:', [...new Set(mapFailures)])
} finally {
  socket?.close()
  browser.kill()
}
