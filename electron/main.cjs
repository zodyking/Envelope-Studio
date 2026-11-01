const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.map': 'application/json',
}

function startStatic(root) {
  const base = path.normalize(root)
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        let rel = decodeURIComponent(url.pathname)
        if (rel.endsWith('/')) rel += 'index.html'
        const file = path.normalize(path.join(base, rel))
        if (!file.startsWith(base)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        fs.readFile(file, (error, data) => {
          if (error) {
            fs.readFile(path.join(base, 'index.html'), (fallbackError, html) => {
              if (fallbackError) {
                res.writeHead(404)
                res.end('Not found')
                return
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(html)
            })
            return
          }
          const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
          res.writeHead(200, { 'Content-Type': type })
          res.end(data)
        })
      } catch {
        res.writeHead(400)
        res.end('Bad request')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

function projectFile() {
  return path.join(app.getPath('userData'), 'envelope-project.json')
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'Envelope Studio',
    backgroundColor: '#185ABD',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)
  if (process.env.ELECTRON_DEV) {
    await win.loadURL(process.env.ELECTRON_URL || 'http://127.0.0.1:3000')
    return
  }
  const root = path.join(__dirname, '..', '.output', 'public')
  const port = await startStatic(root)
  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(() => { void createWindow() })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('save-file', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win || undefined, {
    defaultPath: payload.name,
    filters: [{ name: 'Envelope project', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, payload.content)
  return true
})

ipcMain.handle('open-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win || undefined, {
    filters: [{ name: 'Envelope project', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return fs.readFileSync(result.filePaths[0], 'utf8')
})

ipcMain.handle('load-auto', () => {
  try { return fs.readFileSync(projectFile(), 'utf8') } catch { return null }
})

ipcMain.handle('save-auto', (_event, content) => {
  fs.mkdirSync(path.dirname(projectFile()), { recursive: true })
  fs.writeFileSync(projectFile(), content)
})

ipcMain.handle('list-printers', async (event) => {
  const printers = await event.sender.getPrintersAsync()
  return printers.map(printer => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
  }))
})

ipcMain.handle('print-document', (event, options) => {
  const copies = Math.max(1, Math.min(99, Math.round(Number(options?.copies) || 1)))
  const duplexMode = ['simplex', 'shortEdge', 'longEdge'].includes(options?.duplexMode) ? options.duplexMode : 'simplex'
  const paper = options?.paper === 'A4' || options?.paper === 'Letter' ? options.paper : 'custom'
  const pageSize = paper === 'custom'
    ? {
        width: Math.max(1000, Math.round(Number(options?.widthMicrons) || 215900)),
        height: Math.max(1000, Math.round(Number(options?.heightMicrons) || 279400)),
      }
    : paper
  const ranges = Array.isArray(options?.pageRanges)
    ? options.pageRanges
        .map(range => ({
          from: Math.max(0, Math.round(Number(range?.from) || 0)),
          to: Math.max(0, Math.round(Number(range?.to) || 0)),
        }))
        .filter(range => range.to >= range.from)
    : []
  const settings = {
    silent: true,
    printBackground: true,
    deviceName: options?.deviceName || '',
    copies,
    color: options?.color !== false,
    collate: options?.collate !== false,
    duplexMode,
    landscape: !!options?.landscape,
    margins: { marginType: 'none' },
    scaleFactor: 100,
    pageSize,
    header: '',
    footer: '',
  }
  if (ranges.length) settings.pageRanges = ranges
  return new Promise((resolve) => {
    event.sender.print(settings, (success, failureReason) => {
      resolve({ success: !!success, failureReason: failureReason || '' })
    })
  })
})
