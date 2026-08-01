import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpc } from './ipc/handlers'
import { watchManager } from './scanner/watcher'
import { embeddingManager } from './embedding/embeddingManager'
import { initSearchEngine } from './search/engineFactory'
import { scanAll } from './scanner/scanner'

const isDev = !!process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null

// 需要在 app ready 前注册特权协议
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pixmind',
    privileges: { secure: true, standard: false, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#1e1e2e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 注册安全的本地文件协议，供渲染进程加载本地图片（原图与缩略图） */
function registerLocalProtocol(): void {
  protocol.handle('pixmind', (request) => {
    // URL 形如 pixmind://<encodeURIComponent(绝对路径)>
    const encoded = request.url.slice('pixmind://'.length)
    const filePath = decodeURIComponent(encoded)
    return net.fetch(pathToFileURL(filePath).href)
  })
}

app.whenReady().then(async () => {
  registerLocalProtocol()

  // 1. 初始化数据库
  initDatabase()

  // 2. 加载全部 embedding 到内存索引（毫秒级检索基础）
  await initSearchEngine('memory')

  // 3. 注册 IPC
  registerIpc(() => mainWindow)

  // 4. 创建窗口
  createWindow()

  // 5. 启动 embedding worker
  await embeddingManager.start()

  // 6. 启动文件监听 + 增量扫描（后台异步，不阻塞 UI）
  watchManager.start()
  scanAll().then(() => embeddingManager.enqueuePending())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await watchManager.stopAll()
  await embeddingManager.stop()
  closeDatabase()
})
