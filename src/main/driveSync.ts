import { shell, ipcMain } from 'electron'
import { google, drive_v3 } from 'googleapis'
import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { IpcChannels, LogEntry, AppSettings, DailyGoal, GoalInboxItem, RecurringGoal } from '../shared/types'
import { GOOGLE_OAUTH, isGoogleOAuthConfigured } from '../shared/config'
import { DataManager } from './dataManager'
import { ReminderScheduler } from './scheduler'



export class DriveSyncManager {
  private dataManager: DataManager
  private scheduler: ReminderScheduler
  private drive: drive_v3.Drive | null = null

  private isSyncing: boolean = false
  private authClient: any = null

  constructor(dataManager: DataManager, scheduler: ReminderScheduler) {
    this.dataManager = dataManager
    this.scheduler = scheduler
    
    this.setupIpc()
    this.initialize()
  }

  private setupIpc() {
    ipcMain.handle(IpcChannels.DriveConnect, async () => {
      return await this.connect()
    })
    ipcMain.handle(IpcChannels.DriveDisconnect, async () => {
      return await this.disconnect()
    })
    ipcMain.handle(IpcChannels.DriveSyncNow, async () => {
      return await this.syncNow()
    })
    ipcMain.handle(IpcChannels.DriveStatus, () => {
      const settings = this.scheduler.getSettings()
      return {
        isConnected: !!settings.driveRefreshToken,
        isSyncing: this.isSyncing
      }
    })
  }

  private async initialize() {
    const settings = this.scheduler.getSettings()
    if (settings.driveRefreshToken) {
      this.initDriveClient(settings.driveRefreshToken)
      if (settings.driveSyncEnabled !== false) {
        // Auto sync on start
        setTimeout(() => this.syncNow(), 5000)
      }
    }
  }

  private initDriveClient(refreshToken: string) {
    if (!isGoogleOAuthConfigured()) {
      console.warn('Google Drive sync is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.')
      return
    }

    this.authClient = new google.auth.OAuth2(
      GOOGLE_OAUTH.clientId,
      GOOGLE_OAUTH.clientSecret,
      GOOGLE_OAUTH.redirectUri
    )
    this.authClient.setCredentials({ refresh_token: refreshToken })
    this.drive = google.drive({ version: 'v3', auth: this.authClient })
  }

  public async connect(): Promise<{ success: boolean; error?: string }> {
    if (!isGoogleOAuthConfigured()) {
      return {
        success: false,
        error: 'Google Drive sync is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.'
      }
    }

    const settings = this.scheduler.getSettings()

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH.clientId,
      GOOGLE_OAUTH.clientSecret,
      GOOGLE_OAUTH.redirectUri
    )

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.appdata'],
      prompt: 'consent' // Force refresh token
    })

    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        try {
          if (req.url?.startsWith('/oauth2callback')) {
            const url = new URL(req.url, 'http://localhost:3456')
            const code = url.searchParams.get('code')
            
            if (code) {
              res.end('Authentication successful! You can close this tab and return to Dincharya.')
              server.close()
              
              const { tokens } = await oauth2Client.getToken(code)
              if (tokens.refresh_token) {
                // Save token
                settings.driveRefreshToken = tokens.refresh_token
                settings.driveSyncEnabled = true
                this.scheduler.setSettings(settings, false)
                
                this.initDriveClient(tokens.refresh_token)
                
                // Initial sync
                this.syncNow()
                resolve({ success: true })
              } else {
                resolve({ success: false, error: 'No refresh token received' })
              }
            } else {
              res.end('Authentication failed!')
              server.close()
              resolve({ success: false, error: 'No code received' })
            }
          }
        } catch (e: any) {
          res.end('Error during authentication')
          server.close()
          resolve({ success: false, error: e.message })
        }
      }).listen(3456, () => {
        shell.openExternal(authUrl)
      })
      
      // Timeout after 3 minutes
      setTimeout(() => {
        server.close()
        resolve({ success: false, error: 'Timeout waiting for authentication' })
      }, 3 * 60 * 1000)
    })
  }

  public async disconnect(): Promise<void> {
    const settings = this.scheduler.getSettings()
    settings.driveRefreshToken = undefined
    settings.driveSyncEnabled = false
    this.scheduler.setSettings(settings, false)
    this.drive = null
  }

  public async syncNow(): Promise<{ success: boolean; error?: string }> {
    if (!this.drive || this.isSyncing) return { success: false, error: 'Cannot sync right now' }
    
    const settings = this.scheduler.getSettings()
    if (!settings.driveSyncEnabled) return { success: false, error: 'Sync is disabled' }

    this.isSyncing = true
    try {
      // List remote files
      const remoteRes = await this.drive.files.list({
        q: `'appDataFolder' in parents and trashed=false`,
        spaces: 'appDataFolder',
        fields: 'files(id, name)'
      })
      const remoteFiles = remoteRes.data.files || []
      
      const ext = 'json'
      const logFilePattern = /^\d{4}-\d{2}-\d{2}\.json$/
      const goalFilePattern = /^goals-\d{4}-\d{2}-\d{2}\.json$/

      // List local files
      const localPath = this.dataManager.getDataPath()
      const localFilesRaw = await fs.readdir(localPath).catch(() => [])
      const localFiles = localFilesRaw.filter(f => f.endsWith(`.${ext}`) && !f.startsWith('temp_'))
      
      // Dates to check
      const allDates = new Set<string>()
      remoteFiles.forEach(f => {
        if (f.name && logFilePattern.test(f.name)) allDates.add(f.name.replace(`.${ext}`, ''))
      })
      localFiles.forEach(f => {
        if (logFilePattern.test(f)) allDates.add(f.replace(`.${ext}`, ''))
      })

      for (const date of allDates) {
        const remoteFile = remoteFiles.find(f => f.name === `${date}.${ext}`)
        let localData: LogEntry[] = []
        try {
          localData = await this.dataManager.getLogs(date)
        } catch {}

        if (remoteFile) {
          // Download remote
          const res = await this.drive.files.get({ fileId: remoteFile.id!, alt: 'media' }, { responseType: 'stream' })
          
          const remoteDataRaw = await new Promise<string>((resolve, reject) => {
            let data = ''
            res.data.on('data', chunk => data += chunk)
            res.data.on('end', () => resolve(data))
            res.data.on('error', reject)
          })
          
          let remoteData: LogEntry[] = []
          try {
            const parsed = JSON.parse(remoteDataRaw)
            if (Array.isArray(parsed)) {
              remoteData = parsed
            }
          } catch {}

          // Merge by ID
          const mergedMap = new Map<string, LogEntry>()
          localData.forEach(entry => mergedMap.set(entry.id, entry))
          remoteData.forEach(entry => {
            if (!mergedMap.has(entry.id)) {
              mergedMap.set(entry.id, entry)
            }
          })
          
          const mergedData = Array.from(mergedMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          
          // If merged is different from local, save local
          if (mergedData.length > localData.length) {
            const filePath = path.join(localPath, `${date}.${ext}`)
            const outContent = JSON.stringify(mergedData, null, 2)
            await fs.writeFile(filePath, outContent, 'utf-8')
          }
          
          // If merged is different from remote, upload to remote
          if (mergedData.length > remoteData.length) {
            const media = {
              mimeType: 'application/json',
              body: JSON.stringify(mergedData, null, 2)
            }
            await this.drive.files.update({
              fileId: remoteFile.id!,
              media: media
            })
          }
        } else {
          // Upload local to remote
          const media = {
            mimeType: 'application/json',
            body: JSON.stringify(localData, null, 2)
          }
          await this.drive.files.create({
            requestBody: {
              name: `${date}.${ext}`,
              parents: ['appDataFolder']
            },
            media: media,
            fields: 'id'
          })
        }
      }

      // Sync goal files separately so they are not treated as date log files.
      const allGoalFiles = new Set<string>()
      remoteFiles.forEach(f => {
        if (f.name && goalFilePattern.test(f.name)) allGoalFiles.add(f.name)
      })
      localFiles.forEach(f => {
        if (goalFilePattern.test(f)) allGoalFiles.add(f)
      })

      for (const fileName of allGoalFiles) {
        const remoteFile = remoteFiles.find(f => f.name === fileName)
        const filePath = path.join(localPath, fileName)
        let localData: DailyGoal[] = []
        try {
          const raw = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            localData = parsed
          }
        } catch {}

        if (remoteFile) {
          const res = await this.drive.files.get({ fileId: remoteFile.id!, alt: 'media' }, { responseType: 'stream' })
          const remoteDataRaw = await new Promise<string>((resolve, reject) => {
            let data = ''
            res.data.on('data', chunk => data += chunk)
            res.data.on('end', () => resolve(data))
            res.data.on('error', reject)
          })

          let remoteData: DailyGoal[] = []
          try {
            const parsed = JSON.parse(remoteDataRaw)
            if (Array.isArray(parsed)) {
              remoteData = parsed
            }
          } catch {}

          const mergedMap = new Map<string, DailyGoal>()
          localData.forEach(goal => mergedMap.set(goal.id, goal))
          remoteData.forEach(goal => {
            const existing = mergedMap.get(goal.id)
            if (!existing || this.lifecycleTime(goal) > this.lifecycleTime(existing)) {
              mergedMap.set(goal.id, goal)
            }
          })

          const mergedData = Array.from(mergedMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

          if (mergedData.length > localData.length || JSON.stringify(mergedData) !== JSON.stringify(localData)) {
            await fs.writeFile(filePath, JSON.stringify(mergedData, null, 2), 'utf-8')
          }

          if (mergedData.length > remoteData.length || JSON.stringify(mergedData) !== JSON.stringify(remoteData)) {
            await this.drive.files.update({
              fileId: remoteFile.id!,
              media: {
                mimeType: 'application/json',
                body: JSON.stringify(mergedData, null, 2)
              }
            })
          }
        } else {
          await this.drive.files.create({
            requestBody: {
              name: fileName,
              parents: ['appDataFolder']
            },
            media: {
              mimeType: 'application/json',
              body: JSON.stringify(localData, null, 2)
            },
            fields: 'id'
          })
        }
      }

      const listFiles = ['goal-inbox.json', 'recurring-goals.json']
      for (const fileName of listFiles) {
        const remoteFile = remoteFiles.find(f => f.name === fileName)
        const filePath = path.join(localPath, fileName)
        let localData: Array<GoalInboxItem | RecurringGoal> = []
        try {
          const raw = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            localData = parsed
          }
        } catch {}

        if (remoteFile) {
          const res = await this.drive.files.get({ fileId: remoteFile.id!, alt: 'media' }, { responseType: 'stream' })
          const remoteDataRaw = await new Promise<string>((resolve, reject) => {
            let data = ''
            res.data.on('data', chunk => data += chunk)
            res.data.on('end', () => resolve(data))
            res.data.on('error', reject)
          })

          let remoteData: Array<GoalInboxItem | RecurringGoal> = []
          try {
            const parsed = JSON.parse(remoteDataRaw)
            if (Array.isArray(parsed)) {
              remoteData = parsed
            }
          } catch {}

          const mergedMap = new Map<string, GoalInboxItem | RecurringGoal>()
          localData.forEach(item => mergedMap.set(item.id, item))
          remoteData.forEach(item => {
            const existing = mergedMap.get(item.id)
            if (!existing || this.lifecycleTime(item) > this.lifecycleTime(existing)) {
              mergedMap.set(item.id, item)
            }
          })

          const mergedData = Array.from(mergedMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          if (JSON.stringify(mergedData) !== JSON.stringify(localData)) {
            await fs.writeFile(filePath, JSON.stringify(mergedData, null, 2), 'utf-8')
          }
          if (JSON.stringify(mergedData) !== JSON.stringify(remoteData)) {
            await this.drive.files.update({
              fileId: remoteFile.id!,
              media: {
                mimeType: 'application/json',
                body: JSON.stringify(mergedData, null, 2)
              }
            })
          }
        } else if (localData.length > 0) {
          await this.drive.files.create({
            requestBody: {
              name: fileName,
              parents: ['appDataFolder']
            },
            media: {
              mimeType: 'application/json',
              body: JSON.stringify(localData, null, 2)
            },
            fields: 'id'
          })
        }
      }
      
      // Sync settings
      const settingsFile = remoteFiles.find(f => f.name === 'settings.json')
      const localSettings = this.scheduler.getSettings()
      
      if (settingsFile) {
        // Download remote settings
        const res = await this.drive.files.get({ fileId: settingsFile.id!, alt: 'media' }, { responseType: 'stream' })
        const remoteDataRaw = await new Promise<string>((resolve, reject) => {
          let data = ''
          res.data.on('data', chunk => data += chunk)
          res.data.on('end', () => resolve(data))
          res.data.on('error', reject)
        })
        
        try {
          const remoteSettings = JSON.parse(remoteDataRaw)
          const localLastUpdated = localSettings.lastUpdated || 0
          const remoteLastUpdated = remoteSettings.lastUpdated || 0
          
          if (remoteLastUpdated > localLastUpdated) {
            // Apply remote settings
            const newSettings: AppSettings = {
              ...remoteSettings,
              driveRefreshToken: localSettings.driveRefreshToken,
              driveSyncEnabled: localSettings.driveSyncEnabled
            }
            this.scheduler.setSettings(newSettings, false)
          } else if (localLastUpdated > remoteLastUpdated) {
            // Upload local settings
            const uploadSettings = {
              reminderIntervalMinutes: localSettings.reminderIntervalMinutes,
              openAtLogin: localSettings.openAtLogin,
              lastUpdated: localSettings.lastUpdated
            }
            await this.drive.files.update({
              fileId: settingsFile.id!,
              media: {
                mimeType: 'application/json',
                body: JSON.stringify(uploadSettings, null, 2)
              }
            })
          }
        } catch (e) {
          console.error('Failed to parse remote settings:', e)
        }
      } else {
        // Upload local settings for the first time
        const uploadSettings = {
          reminderIntervalMinutes: localSettings.reminderIntervalMinutes,
          openAtLogin: localSettings.openAtLogin,
          lastUpdated: localSettings.lastUpdated || Date.now()
        }
        await this.drive.files.create({
          requestBody: {
            name: 'settings.json',
            parents: ['appDataFolder']
          },
          media: {
            mimeType: 'application/json',
            body: JSON.stringify(uploadSettings, null, 2)
          },
          fields: 'id'
        })
      }

      this.isSyncing = false
      return { success: true }
    } catch (error: any) {
      console.error('Sync error:', error)
      this.isSyncing = false
      return { success: false, error: error.message }
    }
  }

  private lifecycleTime(item: GoalInboxItem | RecurringGoal | DailyGoal): number {
    const dates = [
      item.createdAt,
      'archivedAt' in item ? item.archivedAt : undefined,
      'completedAt' in item ? item.completedAt : undefined,
      'skippedAt' in item ? item.skippedAt : undefined,
      'pausedAt' in item ? item.pausedAt : undefined,
      'deletedAt' in item ? item.deletedAt : undefined
    ].filter(Boolean) as string[]
    return Math.max(...dates.map((date) => new Date(date).getTime()))
  }
}
