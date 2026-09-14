// Built-page smoke test with isolated Chrome and an in-memory API fixture.
// Does not use the user's running servers, browser profile, accounts, or database.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'

const dist = resolve('dist')
assert(existsSync(join(dist, 'index.html')), 'Run npm run build first')
const notes = []
const requests = []
const group = { id: 'group-1', name: 'Browser group', inviteCode: 'browser-invite', isOwner: true }
const fixtureUser = { userId: 1, email: 'notes-browser@example.com', role: 'tenant', displayName: 'Browser test', avatarUrl: null, accessToken: 'browser-fixture-token' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (path.startsWith('/api/')) {
    requests.push({ path, method: req.method, token: req.headers.authorization })
    const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (path === '/api/auth/me') return json(fixtureUser)
    if (path === '/api/notes') {
      if (req.method === 'GET') return json(notes)
      let body = ''
      for await (const chunk of req) body += chunk
      const note = { ...JSON.parse(body), id: String(notes.length + 1), done: false }
      notes.push(note)
      return json(note, 201)
    }
    if (path === '/api/households') return json([group])
    if (path.endsWith('/members')) return json([{ id: 'member-1', name: 'Browser test', role: '建立者', accent: 'indigo' }])
    if (path.endsWith('/tasks')) return json([])
    return json([])
  }
  const file = resolve(dist, '.' + decodeURIComponent(path))
  if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403); res.end(); return }
  const target = existsSync(file) && extname(file) ? file : join(dist, 'index.html')
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' }
  res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' })
  res.end(readFileSync(target))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = mkdtempSync(join(tmpdir(), 'rentmate-notes-browser-'))
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let port
  for (let attempt = 0; attempt < 80; attempt++) {
    const activePort = join(profile, 'DevToolsActivePort')
    if (existsSync(activePort)) { port = readFileSync(activePort, 'utf8').split('\n')[0]; break }
    await delay(250)
  }
  assert(port, 'Chrome did not start')
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (pending.has(message.id)) {
      const task = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(task.timer)
      if (message.error) task.reject(new Error(JSON.stringify(message.error)))
      else task.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  }
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const until = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(250) }
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('rentmate-auth-session-v2', JSON.stringify({ userId:'1',email:'notes-browser@example.com',role:'tenant',isAuthenticated:true,emailVerified:true,nickname:'Browser test',issuedAt:Date.now(),accessToken:'browser-fixture-token' }))`,
  })
  await send('Page.navigate', { url: origin + '/app/notes' })
  await until(`document.querySelector('.primary-action') && !document.body.innerText.includes('載入記事中')`)
  await evaluate(`document.querySelector('.primary-action').click()`)
  await until(`document.querySelector('[role=dialog] form')`)
  await evaluate(`(() => { const input = document.querySelector('[role=dialog] input'); input.value = 'Browser persistence check'; input.dispatchEvent(new Event('input', {bubbles:true})); })()`)
  await evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`)
  await until(`!document.querySelector('[role=dialog]') && document.body.innerText.includes('Browser persistence check')`)
  assert.equal(notes.length, 1)
  await send('Page.reload')
  await until(`document.body.innerText.includes('Browser persistence check')`)
  await send('Page.navigate', { url: origin + '/app/notes/roommates' })
  await until(`document.body.innerText.includes('Browser group') && !document.body.innerText.includes('載入記事中')`)
  assert(requests.some(item => item.path === '/api/households/group-1/tasks'))
  assert(requests.filter(item => item.path.startsWith('/api/notes') || item.path.startsWith('/api/households')).every(item => item.token === 'Bearer browser-fixture-token'))
  assert.deepEqual(exceptions, [])
  console.log('Notes browser: create, reload persistence, roommate page and authenticated API requests passed')
} finally {
  socket?.close()
  browser.kill()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
