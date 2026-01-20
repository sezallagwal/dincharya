import { powerMonitor, ipcMain, app } from 'electron'
import Store from 'electron-store'
import { showPromptWindow } from './windows/prompt'
import { IpcChannels, AppSettings, LogEntry, ReminderStatus } from '../shared/types'
import { execSync } from 'child_process'


type SettingsSchema = {
  settings: AppSettings
}

const APP_NAME = 'Dincharya'

export class ReminderScheduler {
  private intervalId: NodeJS.Timeout | null = null
  private nextPromptTime: number = 0
  private currentBlockStartedAt: number = 0
  private isPendingPrompt: boolean = false
  private gracePeriodMs: number = 30 * 1000 // 30 seconds
  private idleThresholdSec: number = 5 * 60 // 5 minutes
  private store: Store<SettingsSchema>
  constructor() {
    this.store = new Store<SettingsSchema>({
      defaults: {
        settings: {
          reminderIntervalMinutes: 20,
          openAtLogin: true
        }
      }
    })

    const currentSettings = this.store.get('settings')
    if (currentSettings.openAtLogin === undefined) {
      currentSettings.openAtLogin = true
      this.store.set('settings', currentSettings)
    }

    this.setAutoLaunch(currentSettings.openAtLogin)

    this.setupPowerMonitor()
    this.setupIpc()
    this.startTimer()
  }

  public getSettings(): AppSettings {
    return this.store.get('settings')
  }

  public setSettings(settings: AppSettings, updateTimestamp: boolean = true): void {
    if (updateTimestamp) {
      settings.lastUpdated = Date.now()
    }
    this.store.set('settings', settings)
    this.rescheduleNextPrompt()
    this.isPendingPrompt = false
    if (!this.intervalId) {
      this.startTimer()
    }

    this.setAutoLaunch(settings.openAtLogin)
  }

  public getStatus(): ReminderStatus {
    this.ensureBlockStarted()
    if (!this.nextPromptTime) {
      this.rescheduleNextPrompt()
    }

    return {
      intervalMinutes: this.frequencyMinutes,
      currentBlockStartedAt: new Date(this.currentBlockStartedAt).toISOString(),
      nextPromptTime: new Date(this.nextPromptTime).toISOString(),
      isPendingPrompt: this.isPendingPrompt
    }
  }

  public enrichLogWithCurrentBlock(entry: LogEntry): LogEntry {
    this.ensureBlockStarted()
    const endedAt = Date.now()
    const durationMinutes = Math.max(0, Math.round((endedAt - this.currentBlockStartedAt) / 60000))
    const productivity = entry.productivity
    const productiveMinutes =
      productivity === 'productive'
        ? durationMinutes
        : productivity === 'partial'
          ? Math.round(durationMinutes / 2)
          : 0

    return {
      ...entry,
      timestamp: entry.timestamp || new Date(endedAt).toISOString(),
      startedAt: new Date(this.currentBlockStartedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMinutes,
      productiveMinutes
    }
  }



  private setAutoLaunch(enabled: boolean): void {
    if (process.platform === 'win32') {
      // On Windows with NSIS, app.setLoginItemSettings doesn't support args.
      // Write the registry entry directly with --hidden flag.
      const exePath = app.getPath('exe')
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      try {
        if (enabled) {
          execSync(`reg add "${regKey}" /v "${APP_NAME}" /t REG_SZ /d "\\"${exePath}\\" --hidden" /f`, { stdio: 'ignore' })
        } else {
          execSync(`reg delete "${regKey}" /v "${APP_NAME}" /f`, { stdio: 'ignore' })
        }
      } catch {
        // Fallback: ignore errors (e.g. entry doesn't exist when deleting)
      }
      // Also clean up any old entry from app.setLoginItemSettings (keyed by exe path)
      try {
        execSync(`reg delete "${regKey}" /v "${exePath}" /f`, { stdio: 'ignore' })
      } catch {
        // ignore
      }
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
        args: ['--hidden']
      })
    }
  }

  private get frequencyMinutes(): number {
    return this.store.get('settings').reminderIntervalMinutes
  }

  private setupPowerMonitor() {
    powerMonitor.on('suspend', () => {
      console.log('System suspended. Pausing timer.')
      this.stopTimer()
    })

    powerMonitor.on('resume', () => {
      console.log('System resumed. Recalculating next prompt.')
      this.handleResume()
    })

    powerMonitor.on('lock-screen', () => {
      console.log('Screen locked.')
    })

    powerMonitor.on('unlock-screen', () => {
      console.log('Screen unlocked.')
      this.handleResume()
    })
  }

  private setupIpc() {
    ipcMain.on(IpcChannels.RemindSnooze, () => {
      this.resetBlockAndTimer()
    })

    ipcMain.on(IpcChannels.RemindSubmit, () => {
      this.resetBlockAndTimer()
    })

    ipcMain.handle(IpcChannels.RemindGetStatus, () => {
      return this.getStatus()
    })

    ipcMain.handle(IpcChannels.GetSettings, () => {
      return this.getSettings()
    })

    ipcMain.handle(IpcChannels.SetSettings, (_, settings: AppSettings) => {
      this.setSettings(settings)
    })
  }

  public startTimer() {
    if (this.intervalId) return

    this.ensureBlockStarted()
    this.rescheduleNextPrompt()

    // Check every minute
    this.intervalId = setInterval(() => {
      this.checkTimer()
    }, 60 * 1000)
  }

  public stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private resetTimer() {
    this.rescheduleNextPrompt()
    this.isPendingPrompt = false
    console.log(`Timer reset. Next prompt at: ${new Date(this.nextPromptTime).toLocaleTimeString()}`)
  }

  private ensureBlockStarted() {
    if (!this.currentBlockStartedAt) {
      this.currentBlockStartedAt = Date.now()
    }
  }

  private resetBlockAndTimer() {
    this.currentBlockStartedAt = Date.now()
    this.resetTimer()
  }

  private rescheduleNextPrompt() {
    this.nextPromptTime = Date.now() + this.frequencyMinutes * 60 * 1000
  }

  private checkTimer() {
    const now = Date.now()
    if (now >= this.nextPromptTime) {
      this.tryTriggerPrompt()
    }
  }

  private tryTriggerPrompt() {
    const idleState = powerMonitor.getSystemIdleState(this.idleThresholdSec)
    console.log(`Idle state: ${idleState}`)

    if (idleState === 'active') {
      console.log('User is active. Triggering prompt.')
      showPromptWindow()
      this.nextPromptTime = Date.now() + 60 * 1000 // Retry in 1 min if ignored
    } else {
      console.log('User is idle. Deferring prompt.')
      this.isPendingPrompt = true
      this.currentBlockStartedAt = Date.now()
      this.nextPromptTime = Date.now() + 60 * 1000
    }
  }

  private handleResume() {
    setTimeout(() => {
      this.currentBlockStartedAt = Date.now()
      this.startTimer()

      if (this.isPendingPrompt) {
        console.log('Pending prompt on resume. Triggering.')
        this.tryTriggerPrompt()
      } else if (Date.now() > this.nextPromptTime) {
        this.tryTriggerPrompt()
      }
    }, this.gracePeriodMs)
  }
}
