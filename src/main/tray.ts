import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron'
import { showPromptWindow } from './windows/prompt'
import iconPng from '../../build/icon.png?asset'

export class TrayGenerator {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.createTray()
  }

  private createTray() {
    let icon = nativeImage.createFromPath(iconPng)
    if (process.platform === 'win32') {
      icon = icon.resize({ width: 16, height: 16 })
    }
    this.tray = new Tray(icon)
    this.tray.setToolTip('Dincharya')

    this.tray.on('click', () => {
      this.toggleWindow()
    })

    this.updateContextMenu()
  }

  private toggleWindow() {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide()
    } else {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  private updateContextMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Log Now',
        click: () => {
          showPromptWindow()
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.mainWindow.show()
          this.mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Dincharya',
        click: () => {
          app.quit()
        }
      }
    ])

    this.tray?.setContextMenu(contextMenu)
  }
}
