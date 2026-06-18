const { app, BrowserWindow, protocol, shell, nativeTheme } = require('electron')
const { readFile } = require('node:fs/promises')
const path = require('node:path')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const DIST = path.join(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

// Register a privileged custom scheme so the production build runs from a real,
// secure web origin (so Web Workers, fetch, and WASM behave like a normal site).
if (!DEV_URL) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

function resolveWithinDist(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
  const filePath = path.normalize(path.join(DIST, rel))
  // Guard against path traversal outside the dist directory.
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) return null
  return filePath
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url)
    let filePath = resolveWithinDist(pathname)
    if (!filePath) return new Response('Forbidden', { status: 403 })

    try {
      let data
      try {
        data = await readFile(filePath)
      } catch {
        // SPA fallback: serve index.html for extension-less paths.
        if (!path.extname(filePath)) {
          filePath = path.join(DIST, 'index.html')
          data = await readFile(filePath)
        } else {
          return new Response('Not found', { status: 404 })
        }
      }
      const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

// Headless verification helper: load the app, screenshot the rendered page to a
// file, then exit. Activated only when SMOKE_TEST is set; no-op in production.
function runSmokeTest(win) {
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    console.error(`[smoke] did-fail-load ${code} ${desc} ${url}`)
    if (isMainFrame) app.exit(1)
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 3000))
      const png = (await win.webContents.capturePage()).toPNG()
      const out = process.env.SMOKE_OUT || '/tmp/bgremover-smoke.png'
      require('node:fs').writeFileSync(out, png)
      console.log('[smoke] captured OK ->', out)
      app.exit(0)
    } catch (e) {
      console.error('[smoke] capture failed', e)
      app.exit(1)
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 720,
    minHeight: 600,
    title: 'ERABG',
    // Native macOS look: hide the title bar and let content flow under the
    // inset traffic lights (the in-app top bar provides the drag region).
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0c' : '#f5f5f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open external links (e.g. footer/help URLs) in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (process.env.SMOKE_TEST) runSmokeTest(win)

  if (DEV_URL) {
    win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadURL('app://local/index.html')
  }

  return win
}

app.whenReady().then(() => {
  // Verification helper: force light/dark for screenshots (no-op in production).
  if (process.env.SMOKE_THEME) nativeTheme.themeSource = process.env.SMOKE_THEME
  if (!DEV_URL) registerAppProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
