// Composition root: the only module that imports electron broadly.
// Never gate security on is.dev / !app.isPackaged: both are true when E2E runs out/.
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  powerSaveBlocker,
  protocol,
  safeStorage,
  session,
  systemPreferences
} from 'electron'
import { join } from 'node:path'
import { applyE2ESwitches } from './e2e'
import { APP_SCHEME_PRIVILEGES, registerAppProtocol } from './appProtocol'
import { isAppOrigin } from './protocol'
import { registerIpc } from './ipc'
import { compose } from './compose'
import { log } from './log'
import { createAwake } from './power'
import { ensureMediaAccess } from './media'
import { createKeyStore } from './keys/keyStore'
import { createSafeStorageCipher } from './keys/cipher'
import { probeKey } from './keys/probe'
import { resolveDotenvPath } from './keys/dotenv'
import type { TtsMode } from '../shared/ipc'

// Before ready: Chromium switches and scheme privileges are read at startup.
const e2e = applyE2ESwitches(app, process.env)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: APP_SCHEME_PRIVILEGES }])
process.on('uncaughtException', (e) => log.error('uncaught', e))
process.on('unhandledRejection', (e) => log.error('unhandled', e))

const devUrl = process.env.ELECTRON_RENDERER_URL

function createWindow(e2e: boolean, tts: TtsMode): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    backgroundColor: '#0B0F14',
    title: 'Mock Case Proctor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      // Spike-proven: lets the first interviewer line play without a user gesture.
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [...(e2e ? ['--e2e'] : []), `--tts=${tts}`]
    }
  })
  win.on('ready-to-show', () => {
    if (!e2e) win.show()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (ev, url) => {
    if (!isAppOrigin(url, devUrl)) ev.preventDefault()
  })
  void win.loadURL(devUrl ?? 'app://bundle/index.html')
  return win
}

let win: BrowserWindow | null = null

app.whenReady().then(async () => {
  const core = compose(process.env, {
    userData: app.getPath('userData'),
    log,
    send: (ch, p) => {
      if (win && !win.isDestroyed()) win.webContents.send(ch, p)
    },
    awake: createAwake(powerSaveBlocker, log)
  })
  const roots = {
    bundle: join(__dirname, '../renderer'),
    assets: join(app.getAppPath(), 'resources', 'assets')
  }
  registerAppProtocol(protocol, net, roots, core.casePdf)
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, d) =>
    cb(perm === 'media' && isAppOrigin(d.requestingUrl, devUrl))
  )
  session.defaultSession.setPermissionCheckHandler(
    (_wc, perm, origin) => perm === 'media' && isAppOrigin(origin, devUrl)
  )

  const keyStore = createKeyStore({
    cipher: createSafeStorageCipher(safeStorage),
    file: join(app.getPath('userData'), 'anthropic-key.enc'),
    env: process.env,
    dotenvPath: resolveDotenvPath({
      env: process.env,
      isPackaged: app.isPackaged,
      appPath: app.getAppPath()
    }),
    // No baseURL: the SDK reads ANTHROPIC_BASE_URL (the replay server under E2E).
    probe: (k) => probeKey(k),
    log
  })
  const status = await keyStore.init()
  log.info('key status', status)

  registerIpc(
    ipcMain,
    { keyStore, runner: core.runner, library: core.library, e2eSay: core.e2eSay },
    devUrl
  )
  // No View menu: its Cmd+= / Cmd+- page zoom and reload would fight the deck viewer's zoom keys.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
  )
  // Non-blocking TCC prompt; a denial degrades to Camera off / mic unavailable, never a crash.
  void ensureMediaAccess({ platform: process.platform, e2e, prefs: systemPreferences, log })
  win = createWindow(e2e, core.config.tts)
})

app.on('window-all-closed', () => app.quit())
