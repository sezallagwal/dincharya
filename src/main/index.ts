import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import { DataManager } from './dataManager'
import { ReminderScheduler } from './scheduler'
import { TrayGenerator } from './tray'
import { DriveSyncManager } from './driveSync'
import {
  IpcChannels,
  AppendLogPayload,
  GetLogsPayload,
  GetGoalsPayload,
  SetGoalsPayload,
  AddGoalPayload,
  UpdateGoalPayload,
  CarryGoalPayload,
  GetDayReviewPayload,
  AddInboxPayload,
  UpdateInboxPayload,
  AddInboxToTodayPayload,
  AddRecurringPayload,
  UpdateRecurringPayload,
  GenerateTodayPayload,
  localDateStr
} from '../shared/types'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 520,
    minWidth: 500,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#e4e4e7',
      height: 30
    },
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.dincharya.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  let dataManager: DataManager
  try {
    dataManager = new DataManager()
    console.log('DataManager initialized')
  } catch (error) {
    console.error('Failed to initialize DataManager:', error)
    return
  }

  const scheduler = new ReminderScheduler()
  dataManager.generateTodayGoals(localDateStr()).catch((error) => {
    console.error('Failed to generate recurring goals for today:', error)
  })

  ipcMain.handle(IpcChannels.GetLogs, async (_, { date }: GetLogsPayload) => {
    return await dataManager.getLogs(date)
  })

  ipcMain.handle(IpcChannels.AppendLog, async (_, { date, entry }: AppendLogPayload) => {
    console.log('IPC: AppendLog', date, entry.text)
    const timedEntry = scheduler.enrichLogWithCurrentBlock(entry)
    const result = await dataManager.appendLog(date, timedEntry)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return result
  })

  ipcMain.handle(IpcChannels.GetDataPath, () => {
    return dataManager.getDataPath()
  })

  ipcMain.handle(IpcChannels.GetHeatmap, async () => {
    return await dataManager.getHeatmapData()
  })

  ipcMain.handle(IpcChannels.GetAnalytics, async () => {
    return await dataManager.getAnalytics()
  })

  ipcMain.handle(IpcChannels.GetGoals, async (_, { date }: GetGoalsPayload) => {
    await dataManager.generateTodayGoals(date)
    return await dataManager.getGoals(date)
  })

  ipcMain.handle(IpcChannels.SetGoals, async (_, { date, goals }: SetGoalsPayload) => {
    return await dataManager.setGoals(date, goals)
  })

  ipcMain.handle(IpcChannels.AddGoal, async (_, { date, title, targetMinutes }: AddGoalPayload) => {
    const goal = await dataManager.addGoal(date, title, targetMinutes)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return goal
  })

  ipcMain.handle(IpcChannels.UpdateGoal, async (_, { date, goal }: UpdateGoalPayload) => {
    const updatedGoal = await dataManager.updateGoal(date, goal)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return updatedGoal
  })

  ipcMain.handle(IpcChannels.CarryGoal, async (_, { fromDate, toDate, goalId }: CarryGoalPayload) => {
    const goal = await dataManager.carryGoal(fromDate, toDate, goalId)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return goal
  })

  ipcMain.handle(IpcChannels.GetDayReview, async (_, { date }: GetDayReviewPayload) => {
    if (date === localDateStr()) {
      await dataManager.generateTodayGoals(date)
    }
    return await dataManager.getDayReview(date)
  })

  ipcMain.handle(IpcChannels.GoalsGetInbox, async () => {
    return await dataManager.getInboxGoals()
  })

  ipcMain.handle(IpcChannels.GoalsAddInbox, async (_, { title, note }: AddInboxPayload) => {
    const item = await dataManager.addInboxGoal(title, note)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return item
  })

  ipcMain.handle(IpcChannels.GoalsUpdateInbox, async (_, { item }: UpdateInboxPayload) => {
    const updatedItem = await dataManager.updateInboxGoal(item)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return updatedItem
  })

  ipcMain.handle(IpcChannels.GoalsAddInboxToToday, async (_, { inboxGoalId, date, targetMinutes }: AddInboxToTodayPayload) => {
    const goal = await dataManager.addInboxGoalToToday(inboxGoalId, date, targetMinutes)
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return goal
  })

  ipcMain.handle(IpcChannels.GoalsGetRecurring, async () => {
    return await dataManager.getRecurringGoals()
  })

  ipcMain.handle(IpcChannels.GoalsAddRecurring, async (_, { title, targetMinutes, startsOn, endsOn }: AddRecurringPayload) => {
    const goal = await dataManager.addRecurringGoal(title, targetMinutes, startsOn, endsOn)
    await dataManager.generateTodayGoals(localDateStr())
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return goal
  })

  ipcMain.handle(IpcChannels.GoalsUpdateRecurring, async (_, { goal }: UpdateRecurringPayload) => {
    const updatedGoal = await dataManager.updateRecurringGoal(goal)
    await dataManager.generateTodayGoals(localDateStr())
    if (driveSyncManager) {
      driveSyncManager.syncNow().catch((e) => console.error('Background sync failed:', e))
    }
    return updatedGoal
  })

  ipcMain.handle(IpcChannels.GoalsGenerateToday, async (_, { date }: GenerateTodayPayload) => {
    return await dataManager.generateTodayGoals(date)
  })

  const mainWindow = createWindow()
  const driveSyncManager = new DriveSyncManager(dataManager, scheduler)
  new TrayGenerator(mainWindow)

  let isQuitting = false
  app.on('before-quit', () => {
    isQuitting = true
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      return false
    }
    return true
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
