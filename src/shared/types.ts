export type LogEntry = {
  id: string
  timestamp: string
  text: string
  startedAt?: string
  endedAt?: string
  goalId?: string
  goalTitle?: string
  note?: string
  productivity?: ProductivityLevel
  durationMinutes?: number
  productiveMinutes?: number
}

export type ProductivityLevel = 'productive' | 'partial' | 'unproductive' | 'break'

export type DailyGoal = {
  id: string
  date: string
  title: string
  status: 'planned' | 'done' | 'skipped' | 'archived'
  targetMinutes?: number
  sourceInboxGoalId?: string
  sourceRecurringGoalId?: string
  createdAt: string
  completedAt?: string
  skippedAt?: string
  archivedAt?: string
  carriedFromDate?: string
}

export type GoalInboxItem = {
  id: string
  title: string
  note?: string
  status: 'active' | 'archived'
  createdAt: string
  archivedAt?: string
}

export type RecurringGoal = {
  id: string
  title: string
  targetMinutes?: number
  frequency: 'daily'
  startsOn: string
  endsOn?: string
  status: 'active' | 'paused' | 'archived' | 'deleted'
  createdAt: string
  pausedAt?: string
  archivedAt?: string
  deletedAt?: string
}

export type GoalBreakdown = {
  goalId: string
  title: string
  productiveMinutes: number
  targetMinutes?: number
  logs: LogEntry[]
  status: 'planned' | 'done' | 'skipped' | 'archived'
}

export type DayReviewData = {
  date: string
  goals: DailyGoal[]
  logs: LogEntry[]
  totalProductiveMinutes: number
  goalBreakdown: GoalBreakdown[]
  otherProductiveMinutes: number
  unclassifiedLogs: LogEntry[]
}

export type AnalyticsData = {
  totalEntries: number
  totalActiveDays: number
  totalTrackedDays: number
  currentStreak: number
  longestStreak: number
  hourDistribution: number[]
  weekdayDistribution: number[]
  peakHour: number
  peakWeekday: string
  avgPerActiveDay: number
  weeklyTrend: { week: string; count: number }[]
}

export type AppSettings = {
  reminderIntervalMinutes: number
  openAtLogin: boolean
  driveRefreshToken?: string
  driveSyncEnabled?: boolean
  lastUpdated?: number
}

export type ReminderStatus = {
  intervalMinutes: number
  currentBlockStartedAt: string
  nextPromptTime: string
  isPendingPrompt: boolean
}

export enum IpcChannels {
  GetLogs = 'data:get-logs',
  AppendLog = 'data:append-log',
  DataUpdated = 'data:updated',
  RemindSnooze = 'remind:snooze',
  RemindSubmit = 'remind:submit',
  RemindGetStatus = 'remind:get-status',
  GetSettings = 'settings:get',
  SetSettings = 'settings:set',
  GetDataPath = 'data:get-path',
  DriveConnect = 'drive:connect',
  DriveDisconnect = 'drive:disconnect',
  DriveSyncNow = 'drive:sync-now',
  DriveStatus = 'drive:status',
  GetHeatmap = 'data:get-heatmap',
  GetAnalytics = 'data:get-analytics',
  GetGoals = 'data:get-goals',
  SetGoals = 'data:set-goals',
  AddGoal = 'data:add-goal',
  UpdateGoal = 'data:update-goal',
  CarryGoal = 'data:carry-goal',
  GetDayReview = 'data:get-day-review',
  GoalsGetInbox = 'goals:get-inbox',
  GoalsAddInbox = 'goals:add-inbox',
  GoalsUpdateInbox = 'goals:update-inbox',
  GoalsAddInboxToToday = 'goals:add-inbox-to-today',
  GoalsGetRecurring = 'goals:get-recurring',
  GoalsAddRecurring = 'goals:add-recurring',
  GoalsUpdateRecurring = 'goals:update-recurring',
  GoalsGenerateToday = 'goals:generate-today',
  PromptResize = 'prompt:resize'
}

export type GetLogsPayload = {
  date: string
}

export type AppendLogPayload = {
  date: string
  entry: LogEntry
}

export type GetGoalsPayload = {
  date: string
}

export type SetGoalsPayload = {
  date: string
  goals: DailyGoal[]
}

export type AddGoalPayload = {
  date: string
  title: string
  targetMinutes?: number
}

export type UpdateGoalPayload = {
  date: string
  goal: DailyGoal
}

export type CarryGoalPayload = {
  fromDate: string
  toDate: string
  goalId: string
}

export type GetDayReviewPayload = {
  date: string
}

export type AddInboxPayload = {
  title: string
  note?: string
}

export type UpdateInboxPayload = {
  item: GoalInboxItem
}

export type AddInboxToTodayPayload = {
  inboxGoalId: string
  date: string
  targetMinutes?: number
}

export type AddRecurringPayload = {
  title: string
  targetMinutes?: number
  startsOn: string
  endsOn?: string
}

export type UpdateRecurringPayload = {
  goal: RecurringGoal
}

export type GenerateTodayPayload = {
  date: string
}

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
