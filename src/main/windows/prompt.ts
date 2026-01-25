import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcChannels } from '../../shared/types'
import icon from '../../../build/icon.png?asset'

let promptWindow: BrowserWindow | null = null
let ipcRegistered = false

function registerIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on(IpcChannels.RemindSnooze, () => {
    hidePromptWindow()
  })

  ipcMain.on(IpcChannels.RemindSubmit, () => {
    hidePromptWindow()
  })

  ipcMain.on(IpcChannels.PromptResize, (_, height: number) => {
    if (!promptWindow || promptWindow.isDestroyed()) return
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
    const padding = 20
    const windowWidth = 400
    const clampedHeight = Math.max(200, Math.min(500, Math.round(height)))
    const x = screenWidth - windowWidth - padding
    const y = screenHeight - clampedHeight - padding
    promptWindow.setBounds({ x, y, width: windowWidth, height: clampedHeight })
  })
}

export function createPromptWindow(): BrowserWindow {
  if (promptWindow && !promptWindow.isDestroyed()) {
    return promptWindow
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const windowWidth = 400
  const windowHeight = 500
  const padding = 20

  const x = screenWidth - windowWidth - padding
  const y = screenHeight - windowHeight - padding

  promptWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    promptWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/prompt.html`)
  } else {
    promptWindow.loadFile(join(__dirname, '../renderer/prompt.html'))
  }

  promptWindow.on('closed', () => {
    promptWindow = null
  })

  registerIpc()

  return promptWindow
}

export function showPromptWindow() {
  if (!promptWindow || promptWindow.isDestroyed()) {
    createPromptWindow()
  }
  
  if (promptWindow) {
    promptWindow.setAlwaysOnTop(true, 'screen-saver')
    promptWindow.show()

    // Trick to forcefully steal focus on Windows
    if (process.platform === 'win32') {
      promptWindow.setSkipTaskbar(false)
      promptWindow.focus()
      // Put it back to skip taskbar shortly after focus is grabbed
      setTimeout(() => {
        if (promptWindow && !promptWindow.isDestroyed()) {
          promptWindow.setSkipTaskbar(true)
          promptWindow.focus()
        }
      }, 50)
    } else {
      promptWindow.focus()
    }

    promptWindow.webContents.focus()
  }
}

export function hidePromptWindow() {
  promptWindow?.hide()
}
