import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  LogEntry,
  AnalyticsData,
  localDateStr,
  DailyGoal,
  GoalInboxItem,
  RecurringGoal,
  DayReviewData,
  GoalBreakdown
} from '../shared/types'

export class DataManager {
  private dataPath: string
  private ready: Promise<void>

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'dincharya-logs')
    // Store the promise so we can await it before any operation
    this.ready = this.ensureDataPath().then(() => this.migrateTimezoneEntries())
  }

  /**
   * One-time migration: moves log entries that were saved to the wrong date file
   * due to the old UTC bug (toISOString gave UTC date instead of local date).
   */
  private async migrateTimezoneEntries(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath)
      const moves: Map<string, LogEntry[]> = new Map() // correctDate -> entries to add
      const updates: Map<string, LogEntry[]> = new Map() // file date -> entries to keep

      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('temp_')) continue
        const fileDate = file.replace('.json', '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fileDate)) continue

        try {
          const content = await fs.readFile(path.join(this.dataPath, file), 'utf-8')
          const entries: LogEntry[] = JSON.parse(content)
          if (!Array.isArray(entries)) continue

          const keep: LogEntry[] = []
          let hasMisplaced = false

          for (const entry of entries) {
            const correctDate = localDateStr(new Date(entry.timestamp))
            if (correctDate !== fileDate) {
              hasMisplaced = true
              const existing = moves.get(correctDate) || []
              existing.push(entry)
              moves.set(correctDate, existing)
            } else {
              keep.push(entry)
            }
          }

          if (hasMisplaced) {
            updates.set(fileDate, keep)
          }
        } catch {
          // skip unreadable files
        }
      }

      if (moves.size === 0) return // nothing to migrate

      console.log(`Timezone migration: moving entries across ${moves.size} date(s)`)

      // Write moved entries to their correct files
      for (const [date, newEntries] of moves) {
        const filePath = path.join(this.dataPath, `${date}.json`)
        let existing: LogEntry[] = []
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          existing = JSON.parse(content)
          if (!Array.isArray(existing)) existing = []
        } catch {
          // file doesn't exist yet, start fresh
        }
        existing.push(...newEntries)
        existing.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8')
      }

      // Update source files (remove moved entries)
      for (const [date, keepEntries] of updates) {
        const filePath = path.join(this.dataPath, `${date}.json`)
        if (keepEntries.length === 0) {
          await fs.unlink(filePath)
        } else {
          await fs.writeFile(filePath, JSON.stringify(keepEntries, null, 2), 'utf-8')
        }
      }

      console.log('Timezone migration complete')
    } catch (error) {
      console.error('Timezone migration failed (non-fatal):', error)
    }
  }

  public getDataPath(): string {
    return this.dataPath
  }

  private async ensureDataPath(): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true })
      console.log(`Data path ready: ${this.dataPath}`)
    } catch (error) {
      console.error(`Failed to create data path: ${this.dataPath}`, error)
    }
  }

  public async getLogs(date: string): Promise<LogEntry[]> {
    await this.ready // Ensure directory exists first
    const filePath = path.join(this.dataPath, `${date}.json`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)
      if (Array.isArray(data)) {
        return data
      }
      return []
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Fallback to checking for old .enc files just in case the user disabled encryption?
        // Actually, the request says "remove encyrpted logs completely".
        // I will not implement fallback here.
        return []
      }
      console.error(`Error reading logs for ${date}:`, error)
      throw error
    }
  }

  private getGoalsFilePath(date: string): string {
    return path.join(this.dataPath, `goals-${date}.json`)
  }

  private getInboxFilePath(): string {
    return path.join(this.dataPath, 'goal-inbox.json')
  }

  private getRecurringFilePath(): string {
    return path.join(this.dataPath, 'recurring-goals.json')
  }

  public async getGoals(date: string): Promise<DailyGoal[]> {
    await this.ready
    const filePath = this.getGoalsFilePath(date)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)
      if (Array.isArray(data)) {
        return data.filter((goal): goal is DailyGoal => {
          return (
            goal &&
            typeof goal.id === 'string' &&
            typeof goal.date === 'string' &&
            typeof goal.title === 'string' &&
            ['planned', 'done', 'skipped', 'archived'].includes(goal.status || 'planned')
          )
        }).map((goal) => ({
          ...goal,
          status: goal.status || 'planned'
        }))
      }
      return []
    } catch (error: any) {
      if (error.code === 'ENOENT') return []
      console.error(`Error reading goals for ${date}:`, error)
      throw error
    }
  }

  public async setGoals(date: string, goals: DailyGoal[]): Promise<void> {
    await this.ready
    const filePath = this.getGoalsFilePath(date)
    const tempFilePath = path.join(this.dataPath, `temp_goals-${date}.json`)

    try {
      const outContent = JSON.stringify(goals, null, 2)
      await fs.writeFile(tempFilePath, outContent, 'utf-8')
      await fs.rename(tempFilePath, filePath)
    } catch (error) {
      console.error(`Failed to write goals to ${filePath}`, error)
      try {
        await fs.unlink(tempFilePath)
      } catch {}
      throw error
    }
  }

  public async getInboxGoals(): Promise<GoalInboxItem[]> {
    await this.ready
    try {
      const content = await fs.readFile(this.getInboxFilePath(), 'utf-8')
      const data = JSON.parse(content)
      if (!Array.isArray(data)) return []
      return data.filter((item): item is GoalInboxItem => {
        return item && typeof item.id === 'string' && typeof item.title === 'string'
      })
    } catch (error: any) {
      if (error.code === 'ENOENT') return []
      console.error('Error reading goal inbox:', error)
      throw error
    }
  }

  public async setInboxGoals(items: GoalInboxItem[]): Promise<void> {
    await this.ready
    await this.writeJsonAtomic(this.getInboxFilePath(), 'temp_goal-inbox.json', items)
  }

  public async addInboxGoal(title: string, note?: string): Promise<GoalInboxItem> {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Inbox goal title is required')

    const items = await this.getInboxGoals()
    const item: GoalInboxItem = {
      id: randomUUID(),
      title: trimmed,
      note: note?.trim() || undefined,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    items.push(item)
    await this.setInboxGoals(items)
    return item
  }

  public async updateInboxGoal(item: GoalInboxItem): Promise<GoalInboxItem> {
    const items = await this.getInboxGoals()
    const nextItem: GoalInboxItem = {
      ...item,
      title: item.title.trim(),
      note: item.note?.trim() || undefined,
      archivedAt: item.status === 'archived' ? item.archivedAt || new Date().toISOString() : undefined
    }
    const nextItems = items.map((existing) => (existing.id === nextItem.id ? nextItem : existing))
    if (!items.some((existing) => existing.id === nextItem.id)) {
      nextItems.push(nextItem)
    }
    await this.setInboxGoals(nextItems)
    return nextItem
  }

  public async addInboxGoalToToday(
    inboxGoalId: string,
    date: string,
    targetMinutes?: number
  ): Promise<DailyGoal> {
    const inboxGoals = await this.getInboxGoals()
    const inboxGoal = inboxGoals.find((item) => item.id === inboxGoalId)
    if (!inboxGoal) throw new Error('Inbox goal not found')

    return await this.addGoal(date, inboxGoal.title, targetMinutes, {
      sourceInboxGoalId: inboxGoal.id
    })
  }

  public async getRecurringGoals(): Promise<RecurringGoal[]> {
    await this.ready
    try {
      const content = await fs.readFile(this.getRecurringFilePath(), 'utf-8')
      const data = JSON.parse(content)
      if (!Array.isArray(data)) return []
      return data.filter((goal): goal is RecurringGoal => {
        return goal && typeof goal.id === 'string' && typeof goal.title === 'string'
      })
    } catch (error: any) {
      if (error.code === 'ENOENT') return []
      console.error('Error reading recurring goals:', error)
      throw error
    }
  }

  public async setRecurringGoals(goals: RecurringGoal[]): Promise<void> {
    await this.ready
    await this.writeJsonAtomic(this.getRecurringFilePath(), 'temp_recurring-goals.json', goals)
  }

  public async addRecurringGoal(
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string
  ): Promise<RecurringGoal> {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Recurring goal title is required')

    const goals = await this.getRecurringGoals()
    const goal: RecurringGoal = {
      id: randomUUID(),
      title: trimmed,
      targetMinutes: targetMinutes && targetMinutes > 0 ? Math.round(targetMinutes) : undefined,
      frequency: 'daily',
      startsOn,
      endsOn: endsOn || undefined,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    goals.push(goal)
    await this.setRecurringGoals(goals)
    return goal
  }

  public async updateRecurringGoal(goal: RecurringGoal): Promise<RecurringGoal> {
    const goals = await this.getRecurringGoals()
    const now = new Date().toISOString()
    const nextGoal: RecurringGoal = {
      ...goal,
      title: goal.title.trim(),
      targetMinutes: goal.targetMinutes && goal.targetMinutes > 0 ? Math.round(goal.targetMinutes) : undefined,
      frequency: 'daily',
      pausedAt: goal.status === 'paused' ? goal.pausedAt || now : goal.pausedAt,
      archivedAt: goal.status === 'archived' ? goal.archivedAt || now : goal.archivedAt,
      deletedAt: goal.status === 'deleted' ? goal.deletedAt || now : goal.deletedAt
    }
    const nextGoals = goals.map((existing) => (existing.id === nextGoal.id ? nextGoal : existing))
    if (!goals.some((existing) => existing.id === nextGoal.id)) {
      nextGoals.push(nextGoal)
    }
    await this.setRecurringGoals(nextGoals)
    return nextGoal
  }

  public async generateTodayGoals(date: string): Promise<DailyGoal[]> {
    const [recurringGoals, dailyGoals] = await Promise.all([
      this.getRecurringGoals(),
      this.getGoals(date)
    ])
    const nextDailyGoals = [...dailyGoals]
    let changed = false

    for (const recurringGoal of recurringGoals) {
      if (recurringGoal.status !== 'active') continue
      if (recurringGoal.startsOn && date < recurringGoal.startsOn) continue
      if (recurringGoal.endsOn && date > recurringGoal.endsOn) continue

      const alreadyHandled = nextDailyGoals.some((goal) => {
        return goal.sourceRecurringGoalId === recurringGoal.id
      })
      if (alreadyHandled) continue

      nextDailyGoals.push({
        id: randomUUID(),
        date,
        title: recurringGoal.title,
        status: 'planned',
        targetMinutes: recurringGoal.targetMinutes,
        sourceRecurringGoalId: recurringGoal.id,
        createdAt: new Date().toISOString()
      })
      changed = true
    }

    if (changed) {
      await this.setGoals(date, nextDailyGoals)
    }
    return nextDailyGoals
  }

  private async writeJsonAtomic(filePath: string, tempFileName: string, data: unknown): Promise<void> {
    const tempFilePath = path.join(this.dataPath, tempFileName)
    try {
      await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2), 'utf-8')
      await fs.rename(tempFilePath, filePath)
    } catch (error) {
      try {
        await fs.unlink(tempFilePath)
      } catch {}
      throw error
    }
  }

  public async addGoal(
    date: string,
    title: string,
    targetMinutes?: number,
    source?: Pick<DailyGoal, 'sourceInboxGoalId' | 'sourceRecurringGoalId'>
  ): Promise<DailyGoal> {
    const trimmed = title.trim()
    if (!trimmed) {
      throw new Error('Goal title is required')
    }

    const goals = await this.getGoals(date)
    const now = new Date().toISOString()
    const goal: DailyGoal = {
      id: randomUUID(),
      date,
      title: trimmed,
      status: 'planned',
      targetMinutes: targetMinutes && targetMinutes > 0 ? Math.round(targetMinutes) : undefined,
      sourceInboxGoalId: source?.sourceInboxGoalId,
      sourceRecurringGoalId: source?.sourceRecurringGoalId,
      createdAt: now
    }

    goals.push(goal)
    await this.setGoals(date, goals)
    return goal
  }

  public async updateGoal(date: string, goal: DailyGoal): Promise<DailyGoal> {
    const goals = await this.getGoals(date)
    const nextGoal: DailyGoal = {
      ...goal,
      date,
      title: goal.title.trim(),
      targetMinutes:
        goal.targetMinutes && goal.targetMinutes > 0 ? Math.round(goal.targetMinutes) : undefined,
      completedAt: goal.status === 'done' ? goal.completedAt || new Date().toISOString() : undefined,
      skippedAt: goal.status === 'skipped' ? goal.skippedAt || new Date().toISOString() : undefined,
      archivedAt: goal.status === 'archived' ? goal.archivedAt || new Date().toISOString() : undefined
    }

    const nextGoals = goals.map((existing) => (existing.id === nextGoal.id ? nextGoal : existing))
    if (!goals.some((existing) => existing.id === nextGoal.id)) {
      nextGoals.push(nextGoal)
    }

    await this.setGoals(date, nextGoals)
    return nextGoal
  }

  public async carryGoal(fromDate: string, toDate: string, goalId: string): Promise<DailyGoal> {
    const sourceGoals = await this.getGoals(fromDate)
    const sourceGoal = sourceGoals.find((goal) => goal.id === goalId)
    if (!sourceGoal) {
      throw new Error('Goal not found')
    }

    const targetGoals = await this.getGoals(toDate)
    const now = new Date().toISOString()
    const carriedGoal: DailyGoal = {
      id: randomUUID(),
      date: toDate,
      title: sourceGoal.title,
      status: 'planned',
      targetMinutes: sourceGoal.targetMinutes,
      createdAt: now,
      carriedFromDate: fromDate
    }

    targetGoals.push(carriedGoal)
    await this.setGoals(toDate, targetGoals)
    return carriedGoal
  }

  private productiveMinutes(log: LogEntry): number {
    if (typeof log.productiveMinutes === 'number') {
      return Math.max(0, Math.round(log.productiveMinutes))
    }

    if (log.productivity === 'productive') {
      return Math.max(0, Math.round(log.durationMinutes || 0))
    }

    if (log.productivity === 'partial') {
      return Math.max(0, Math.round((log.durationMinutes || 0) / 2))
    }

    return 0
  }

  public async getDayReview(date: string): Promise<DayReviewData> {
    await this.ready
    const [goals, logs] = await Promise.all([this.getGoals(date), this.getLogs(date)])
    const goalMap = new Map<string, GoalBreakdown>()

    for (const goal of goals) {
      goalMap.set(goal.id, {
        goalId: goal.id,
        title: goal.title,
        productiveMinutes: 0,
        targetMinutes: goal.targetMinutes,
        logs: [],
        status: goal.status
      })
    }

    let otherProductiveMinutes = 0
    const unclassifiedLogs: LogEntry[] = []

    for (const log of logs) {
      const productiveMinutes = this.productiveMinutes(log)
      if (!log.productivity) {
        unclassifiedLogs.push(log)
      }

      if (log.goalId) {
        const existing = goalMap.get(log.goalId)
        if (existing) {
          existing.logs.push(log)
          existing.productiveMinutes += productiveMinutes
        } else {
          goalMap.set(log.goalId, {
            goalId: log.goalId,
            title: log.goalTitle || 'Unknown goal',
            productiveMinutes,
            targetMinutes: undefined,
            logs: [log],
            status: 'planned'
          })
        }
      } else {
        otherProductiveMinutes += productiveMinutes
      }
    }

    const goalBreakdown = Array.from(goalMap.values())
    const totalProductiveMinutes =
      goalBreakdown.reduce((sum, goal) => sum + goal.productiveMinutes, 0) +
      otherProductiveMinutes

    return {
      date,
      goals,
      logs,
      totalProductiveMinutes,
      goalBreakdown,
      otherProductiveMinutes,
      unclassifiedLogs
    }
  }

  public async appendLog(date: string, entry: LogEntry): Promise<void> {
    await this.ready // Ensure directory exists first
    const fileName = `${date}.json`
    const filePath = path.join(this.dataPath, fileName)
    const tempFilePath = path.join(this.dataPath, `temp_${fileName}`)

    console.log(`Appending log to ${filePath}:`, entry.text)

    // 1. Read existing logs
    let logs: LogEntry[] = []
    try {
      logs = await this.getLogs(date)
    } catch {
      // Start with empty array
    }

    // 2. Append new entry
    logs.push(entry)

    // 3. Atomic write: temp file then rename
    try {
      const outContent = JSON.stringify(logs, null, 2)
      await fs.writeFile(tempFilePath, outContent, 'utf-8')
      await fs.rename(tempFilePath, filePath)
      console.log(`Log saved successfully. Total entries today: ${logs.length}`)
    } catch (error) {
      console.error(`Failed to write logs to ${filePath}`, error)
      try {
        await fs.unlink(tempFilePath)
      } catch {}
      throw error
    }
  }

  public async getHeatmapData(): Promise<Record<string, number>> {
    await this.ready // Ensure directory exists first
    const heatmap: Record<string, number> = {}

    try {
      const files = await fs.readdir(this.dataPath)
      
      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('temp_')) {
          continue
        }
        
        const dateStr = file.replace('.json', '')
        // Validate date string roughly (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          continue
        }

        try {
          const content = await fs.readFile(path.join(this.dataPath, file), 'utf-8')
          const data = JSON.parse(content)
          if (Array.isArray(data)) {
            heatmap[dateStr] = data.length
          }
        } catch (err) {
          console.error(`Failed to read logs for heatmap from ${file}:`, err)
        }
      }
    } catch (error) {
      console.error('Failed to generate heatmap data:', error)
    }

    return heatmap
  }

  public async getAnalytics(): Promise<AnalyticsData> {
    await this.ready

    const hourDist = new Array(24).fill(0)
    const weekdayDist = new Array(7).fill(0)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    let totalEntries = 0
    const activeDateSet = new Set<string>()

    // Weekly trend: last 12 weeks
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekBuckets: { week: string; count: number }[] = []
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay() - w * 7)
      const label = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      weekBuckets.push({ week: label, count: 0 })
    }

    try {
      const files = await fs.readdir(this.dataPath)

      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('temp_')) continue
        const dateStr = file.replace('.json', '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

        try {
          const content = await fs.readFile(path.join(this.dataPath, file), 'utf-8')
          const data = JSON.parse(content)
          if (!Array.isArray(data)) continue

          if (data.length > 0) activeDateSet.add(dateStr)
          totalEntries += data.length

          for (const entry of data as LogEntry[]) {
            const ts = new Date(entry.timestamp)
            hourDist[ts.getHours()]++
            weekdayDist[ts.getDay()]++

            // Assign to weekly trend bucket
            const entryDate = new Date(dateStr + 'T00:00:00')
            for (let w = 0; w < weekBuckets.length; w++) {
              const bucketStart = new Date(today)
              bucketStart.setDate(today.getDate() - today.getDay() - (11 - w) * 7)
              const bucketEnd = new Date(bucketStart)
              bucketEnd.setDate(bucketStart.getDate() + 7)
              if (entryDate >= bucketStart && entryDate < bucketEnd) {
                weekBuckets[w].count += 1
                break
              }
            }
          }
        } catch (err) {
          console.error(`Analytics: failed to read ${file}:`, err)
        }
      }
    } catch (error) {
      console.error('Failed to compute analytics:', error)
    }

    // Sorted active dates for streak calc
    const sortedDates = [...activeDateSet].sort()

    // Current streak
    let currentStreak = 0
    const check = new Date(today)
    while (true) {
      const ds = localDateStr(check)
      if (activeDateSet.has(ds)) {
        currentStreak++
        check.setDate(check.getDate() - 1)
      } else {
        break
      }
    }

    // Longest streak
    let longestStreak = 0
    let temp = 0
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        temp = 1
      } else {
        const prev = new Date(sortedDates[i - 1])
        const curr = new Date(sortedDates[i])
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000)
        temp = diff === 1 ? temp + 1 : 1
      }
      longestStreak = Math.max(longestStreak, temp)
    }

    // Total tracked days (from first log to today)
    const totalTrackedDays = sortedDates.length > 0
      ? Math.round((today.getTime() - new Date(sortedDates[0]).getTime()) / 86400000) + 1
      : 0

    // Peak hour
    const peakHour = hourDist.indexOf(Math.max(...hourDist))

    // Peak weekday
    const peakWeekdayIdx = weekdayDist.indexOf(Math.max(...weekdayDist))

    return {
      totalEntries,
      totalActiveDays: activeDateSet.size,
      totalTrackedDays,
      currentStreak,
      longestStreak,
      hourDistribution: hourDist,
      weekdayDistribution: weekdayDist,
      peakHour,
      peakWeekday: dayNames[peakWeekdayIdx],
      avgPerActiveDay: activeDateSet.size > 0
        ? Math.round((totalEntries / activeDateSet.size) * 10) / 10
        : 0,
      weeklyTrend: weekBuckets
    }
  }
}
