import { useState, useEffect, useCallback, useRef } from 'react'
import {
  IpcChannels,
  AppSettings,
  LogEntry,
  DailyGoal,
  GoalInboxItem,
  RecurringGoal,
  DayReviewData,
  ReminderStatus,
  localDateStr
} from '../../shared/types'
import { Heatmap } from './components/Heatmap'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { Input } from './components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'
import { TimelineList } from './components/TimelineList'
import { DailyGoalsPanel } from './components/DailyGoalsPanel'
import { DayReviewPanel } from './components/DayReviewPanel'
import { GoalsPanel } from './components/GoalsPanel'
import { MetricCard, PageShell, Panel, SectionHeader } from './components/DashboardLayout'
import { formatTime, formatMinutes } from './lib/utils'

const shiftDate = (date: string, days: number): string => {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

const formatDateHuman = (dateStr: string): string => {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function App(): React.JSX.Element {
  const [interval, setInterval_] = useState(20)
  const [openAtLogin, setOpenAtLogin] = useState(true)
  const [driveRefreshToken, setDriveRefreshToken] = useState<string | undefined>(undefined)
  const [driveSyncEnabled, setDriveSyncEnabled] = useState(false)
  const [driveStatus, setDriveStatus] = useState({ isConnected: false, isSyncing: false })

  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [dataPath, setDataPath] = useState('')
  const [tab, setTab] = useState<'today' | 'goals' | 'review' | 'settings'>('today')
  const [heatmapData, setHeatmapData] = useState<Record<string, number>>({})
  const [todayGoals, setTodayGoals] = useState<DailyGoal[]>([])
  const [inboxGoals, setInboxGoals] = useState<GoalInboxItem[]>([])
  const [recurringGoals, setRecurringGoals] = useState<RecurringGoal[]>([])
  const [todayReview, setTodayReview] = useState<DayReviewData | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState<string>(localDateStr())
  const [selectedDayReview, setSelectedDayReview] = useState<DayReviewData | null>(null)
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null)

  const loadLogs = useCallback(async () => {
    try {
      const today = localDateStr()
      const todayLogs = await window.electron.ipcRenderer.invoke(IpcChannels.GetLogs, {
        date: today
      })
      setLogs(todayLogs || [])
    } catch (err) {
      console.error('Failed to load logs:', err)
    }
  }, [])

  const loadHeatmap = useCallback(async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke(IpcChannels.GetHeatmap)
      setHeatmapData(data || {})
    } catch (err) {
      console.error('Failed to load heatmap:', err)
    }
  }, [])

  const loadDayReview = useCallback(async (date: string) => {
    try {
      const data = await window.electron.ipcRenderer.invoke(IpcChannels.GetDayReview, { date })
      setSelectedDayReview(data)
    } catch (err) {
      console.error('Failed to load day review:', err)
    }
  }, [])

  const loadTodayData = useCallback(async () => {
    try {
      const today = localDateStr()
      await window.electron.ipcRenderer.invoke(IpcChannels.GoalsGenerateToday, { date: today })
      const [goalsData, reviewData] = await Promise.all([
        window.electron.ipcRenderer.invoke(IpcChannels.GetGoals, { date: today }),
        window.electron.ipcRenderer.invoke(IpcChannels.GetDayReview, { date: today })
      ])
      setTodayGoals(goalsData || [])
      setTodayReview(reviewData)
      if (selectedDayDate === today) setSelectedDayReview(reviewData)
    } catch (err) {
      console.error('Failed to load today data:', err)
    }
  }, [selectedDayDate])

  const loadGoalLists = useCallback(async () => {
    try {
      const [inboxData, recurringData] = await Promise.all([
        window.electron.ipcRenderer.invoke(IpcChannels.GoalsGetInbox),
        window.electron.ipcRenderer.invoke(IpcChannels.GoalsGetRecurring)
      ])
      setInboxGoals(inboxData || [])
      setRecurringGoals(recurringData || [])
    } catch (err) {
      console.error('Failed to load goal lists:', err)
    }
  }, [])

  const loadReview = useCallback(async () => {
    await Promise.all([loadHeatmap(), loadDayReview(selectedDayDate)])
  }, [loadHeatmap, loadDayReview, selectedDayDate])

  const loadDriveStatus = useCallback(async () => {
    try {
      const status = await window.electron.ipcRenderer.invoke(IpcChannels.DriveStatus)
      setDriveStatus(status)
    } catch {
      // ignore
    }
  }, [])

  const loadReminderStatus = useCallback(async () => {
    try {
      const status = await window.electron.ipcRenderer.invoke(IpcChannels.RemindGetStatus)
      setReminderStatus(status)
    } catch (err) {
      console.error('Failed to load reminder status:', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      window.electron.ipcRenderer.invoke(IpcChannels.GetSettings),
      window.electron.ipcRenderer.invoke(IpcChannels.GetDataPath)
    ])
      .then(([settings, path]: [AppSettings, string]) => {
        setInterval_(settings.reminderIntervalMinutes)
        setOpenAtLogin(settings.openAtLogin ?? true)
        setDriveRefreshToken(settings.driveRefreshToken)
        setDriveSyncEnabled(settings.driveSyncEnabled || false)
        setDataPath(path)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load:', err)
        setLoading(false)
      })

    loadLogs()
    loadTodayData()
    loadGoalLists()
    loadReminderStatus()
    loadDriveStatus()

    const timer = window.setInterval(() => {
      loadLogs()
      loadTodayData()
      if (tab === 'goals') loadGoalLists()
      if (tab === 'review') loadDayReview(selectedDayDate)
      loadReminderStatus()
      loadDriveStatus()
    }, 10000)
    return () => window.clearInterval(timer)
  }, [
    loadLogs,
    loadTodayData,
    loadGoalLists,
    loadReminderStatus,
    loadDayReview,
    selectedDayDate,
    tab,
    loadDriveStatus
  ])

  // Auto-save settings with debounce
  const settingsInitialized = useRef(false)
  useEffect(() => {
    if (loading) return
    // Skip the first render (initial load from disk)
    if (!settingsInitialized.current) {
      settingsInitialized.current = true
      return
    }
    const timer = setTimeout(async () => {
      const settings: AppSettings = {
        reminderIntervalMinutes: interval,
        openAtLogin,
        driveRefreshToken,
        driveSyncEnabled
      }
      await window.electron.ipcRenderer.invoke(IpcChannels.SetSettings, settings)
      await loadReminderStatus()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, openAtLogin, driveSyncEnabled])

  const handleDriveConnect = async () => {
    const res = await window.electron.ipcRenderer.invoke(IpcChannels.DriveConnect)
    if (res.success) {
      const settings = await window.electron.ipcRenderer.invoke(IpcChannels.GetSettings)
      setDriveRefreshToken(settings.driveRefreshToken)
      setDriveSyncEnabled(settings.driveSyncEnabled || false)
      loadDriveStatus()
    } else {
      alert('Failed to connect: ' + res.error)
    }
  }

  const handleDriveDisconnect = async () => {
    await window.electron.ipcRenderer.invoke(IpcChannels.DriveDisconnect)
    setDriveRefreshToken(undefined)
    setDriveSyncEnabled(false)
    loadDriveStatus()
  }

  const handleDriveSyncNow = async () => {
    setDriveStatus((s) => ({ ...s, isSyncing: true }))
    const res = await window.electron.ipcRenderer.invoke(IpcChannels.DriveSyncNow)
    if (res.success) {
      loadLogs()
      loadTodayData()
    } else {
      alert('Sync failed: ' + res.error)
    }
    loadDriveStatus()
  }

  const handleDayClick = async (dateStr: string) => {
    setSelectedDayDate(dateStr)
    await loadDayReview(dateStr)
  }

  const handleReviewDateChange = async (date: string) => {
    setSelectedDayDate(date)
    await loadDayReview(date)
  }

  const handleAddGoal = async (title: string, targetMinutes?: number) => {
    const today = localDateStr()
    await window.electron.ipcRenderer.invoke(IpcChannels.AddGoal, {
      date: today,
      title,
      targetMinutes
    })
    await Promise.all([loadTodayData(), loadDayReview(selectedDayDate)])
  }

  const handleUpdateGoal = async (goal: DailyGoal) => {
    await window.electron.ipcRenderer.invoke(IpcChannels.UpdateGoal, { date: goal.date, goal })
    await Promise.all([loadTodayData(), loadDayReview(selectedDayDate)])
  }

  const handleAddInboxGoal = async (title: string, note?: string) => {
    await window.electron.ipcRenderer.invoke(IpcChannels.GoalsAddInbox, { title, note })
    await loadGoalLists()
  }

  const handleUpdateInboxGoal = async (item: GoalInboxItem) => {
    await window.electron.ipcRenderer.invoke(IpcChannels.GoalsUpdateInbox, { item })
    await loadGoalLists()
  }

  const handleAddInboxToToday = async (item: GoalInboxItem, targetMinutes?: number) => {
    const today = localDateStr()
    await window.electron.ipcRenderer.invoke(IpcChannels.GoalsAddInboxToToday, {
      inboxGoalId: item.id,
      date: today,
      targetMinutes
    })
    await loadTodayData()
  }

  const handleAddRecurringGoal = async (
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string
  ) => {
    await window.electron.ipcRenderer.invoke(IpcChannels.GoalsAddRecurring, {
      title,
      targetMinutes,
      startsOn,
      endsOn
    })
    await Promise.all([loadGoalLists(), loadTodayData()])
  }

  const handleUpdateRecurringGoal = async (goal: RecurringGoal) => {
    await window.electron.ipcRenderer.invoke(IpcChannels.GoalsUpdateRecurring, { goal })
    await Promise.all([loadGoalLists(), loadTodayData()])
  }

  const handleCarryGoal = async (goal: DailyGoal) => {
    try {
      const today = localDateStr()
      await window.electron.ipcRenderer.invoke(IpcChannels.CarryGoal, {
        fromDate: goal.date,
        toDate: today,
        goalId: goal.id
      })
      await loadTodayData()
    } catch (e) {
      console.error('Failed to carry goal:', e)
    }
  }

  const presets = [20, 40, 60]
  const activeTodayGoals = todayGoals.filter(
    (goal) => goal.status === 'planned' || goal.status === 'done'
  )
  const productiveToday = todayReview?.totalProductiveMinutes || 0
  const plannedGoals = activeTodayGoals.filter((goal) => goal.status === 'planned').length
  const completedGoals = activeTodayGoals.filter((goal) => goal.status === 'done').length

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0f] text-white/50">
        <div className="animate-pulse text-[14px]">Loading...</div>
      </div>
    )
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v as 'today' | 'goals' | 'review' | 'settings')
        if (v === 'today') {
          loadLogs()
          loadTodayData()
        }
        if (v === 'goals') {
          loadTodayData()
          loadGoalLists()
        }
        if (v === 'review') loadReview()
      }}
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b0b11] font-sans text-white/90"
    >
      <div
        className="absolute left-0 right-0 top-0 z-50 h-[30px]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 pb-5 pt-12">
        <h1 className="text-[23px] font-semibold tracking-tight text-white/90">Dincharya</h1>
        <TabsList className="h-10 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          {[
            ['today', 'Today'],
            ['goals', 'Goals'],
            ['review', 'Review'],
            ['settings', 'Settings']
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md px-4 text-[13px] font-medium text-white/50 data-[state=active]:bg-emerald-400/12 data-[state=active]:text-emerald-300"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
        <TabsContent
          value="today"
          className="h-full mt-0 data-[state=inactive]:hidden outline-none"
        >
          <PageShell className="overflow-y-auto custom-scrollbar lg:overflow-hidden lg:flex lg:flex-col">
            <div className="grid gap-3 md:grid-cols-3 shrink-0">
              <MetricCard
                label="Productive Today"
                value={formatMinutes(productiveToday)}
                accent={productiveToday > 0}
                hint={
                  completedGoals === 0 && plannedGoals === 0
                    ? 'No goals planned yet'
                    : `${completedGoals} done, ${plannedGoals} planned`
                }
              />
              <MetricCard
                label="Current Block"
                value={`${formatTime(reminderStatus?.currentBlockStartedAt)} – now`}
                hint={`Check in every ${reminderStatus?.intervalMinutes || interval}m`}
              />
              <MetricCard
                label="Next Check-in"
                value={formatTime(reminderStatus?.nextPromptTime)}
                accent={!!reminderStatus?.nextPromptTime}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:flex-1 lg:min-h-0">
              <DailyGoalsPanel
                goals={activeTodayGoals}
                review={todayReview}
                onAddGoal={handleAddGoal}
                onUpdateGoal={handleUpdateGoal}
              />

              <Panel className="flex flex-col overflow-hidden min-h-0 lg:h-full p-4">
                <SectionHeader
                  title="Recent Logs"
                  subtitle="Time blocks recorded today."
                  action={
                    <button
                      onClick={loadLogs}
                      className="text-[12px] font-medium text-white/45 hover:text-white/70"
                    >
                      Refresh
                    </button>
                  }
                />
                <div className="mt-4 flex-1 overflow-y-auto custom-scrollbar min-h-0 rounded-lg border border-white/10 bg-white/[0.02]">
                  <TimelineList logs={logs} emptyMessage="No logs recorded today." />
                </div>
              </Panel>
            </div>
          </PageShell>
        </TabsContent>

        <TabsContent
          value="goals"
          className="h-full mt-0 data-[state=inactive]:hidden outline-none"
        >
          <PageShell className="overflow-y-auto custom-scrollbar">
            <GoalsPanel
              today={localDateStr()}
              dailyGoals={todayGoals}
              review={todayReview}
              inboxGoals={inboxGoals}
              recurringGoals={recurringGoals}
              onAddDailyGoal={handleAddGoal}
              onUpdateDailyGoal={handleUpdateGoal}
              onAddInboxGoal={handleAddInboxGoal}
              onUpdateInboxGoal={handleUpdateInboxGoal}
              onAddInboxToToday={handleAddInboxToToday}
              onAddRecurringGoal={handleAddRecurringGoal}
              onUpdateRecurringGoal={handleUpdateRecurringGoal}
            />
          </PageShell>
        </TabsContent>

        <TabsContent
          value="review"
          className="h-full mt-0 data-[state=inactive]:hidden outline-none"
        >
          <PageShell className="overflow-y-auto custom-scrollbar">
            {/* Date navigation bar */}
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewDateChange(shiftDate(selectedDayDate, -1))}
                    className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[14px] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
                  >
                    ←
                  </button>
                  <div className="text-center px-3">
                    <div className="text-[16px] font-semibold text-white/90">
                      {selectedDayDate === localDateStr()
                        ? 'Today'
                        : formatDateHuman(selectedDayDate)}
                    </div>
                    {selectedDayDate !== localDateStr() && (
                      <div className="text-[12px] text-white/35 mt-0.5">{selectedDayDate}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleReviewDateChange(shiftDate(selectedDayDate, 1))}
                    disabled={selectedDayDate >= localDateStr()}
                    className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[14px] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors disabled:opacity-35 disabled:hover:bg-white/5"
                  >
                    →
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[16px] font-semibold text-emerald-300">
                      {formatMinutes(selectedDayReview?.totalProductiveMinutes || 0)}
                      <span className="text-[12px] font-medium text-white/40 ml-1.5">
                        productive
                      </span>
                    </div>
                    <div className="text-[12px] text-white/35 mt-0.5">
                      {selectedDayReview?.logs.length || 0}{' '}
                      {(selectedDayReview?.logs.length || 0) === 1 ? 'log' : 'logs'} ·{' '}
                      {selectedDayReview?.goals.length || 0}{' '}
                      {(selectedDayReview?.goals.length || 0) === 1 ? 'goal' : 'goals'}
                    </div>
                  </div>
                  {selectedDayDate !== localDateStr() && (
                    <button
                      onClick={() => handleReviewDateChange(localDateStr())}
                      className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-400/15 transition-colors"
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>
            </Panel>

            {/* Heatmap — full width */}
            <Panel className="mt-4 p-4">
              <div className="mb-3 flex items-center justify-between">
                <SectionHeader title="Activity Heatmap" subtitle="Click any day to review it." />
                <button
                  onClick={loadReview}
                  className="text-[12px] font-medium text-white/45 hover:text-white/70"
                >
                  Refresh
                </button>
              </div>
              <Heatmap data={heatmapData} onDayClick={handleDayClick} />
            </Panel>

            {/* Day Review — full width */}
            <Panel className="mt-4 min-h-[340px] overflow-hidden">
              <DayReviewPanel
                review={selectedDayReview}
                today={localDateStr()}
                onCarryGoal={handleCarryGoal}
              />
            </Panel>
          </PageShell>
        </TabsContent>

        <TabsContent
          value="settings"
          className="h-full mt-0 data-[state=inactive]:hidden outline-none"
        >
          <PageShell className="overflow-y-auto custom-scrollbar">
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Left column */}
              <div className="space-y-4 min-w-0">
                <Panel className="p-5">
                  <SectionHeader
                    title="Check-in"
                    subtitle="Dincharya asks what you worked on at this interval while the app is running."
                  />
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {presets.map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setInterval_(mins)}
                        className={`h-10 rounded-md border text-[14px] font-medium transition-colors ${
                          interval === mins
                            ? 'border-emerald-400/25 bg-emerald-400/12 text-emerald-300'
                            : 'border-white/10 bg-white/5 text-white/55 hover:text-white/80'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-[13px] text-white/50">Custom</span>
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={interval}
                      onChange={(e) =>
                        setInterval_(Math.max(1, Math.min(480, parseInt(e.target.value) || 1)))
                      }
                      className="flex-1 bg-white/5 border-white/10 text-white/80"
                    />
                    <span className="text-[13px] text-white/50">minutes</span>
                  </div>
                </Panel>

                <Panel className="p-5">
                  <SectionHeader title="Startup" />
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3">
                    <div>
                      <div className="text-[14px] font-medium text-white/75">
                        Start Dincharya on login
                      </div>
                      <div className="mt-1 text-[12px] text-white/40">
                        Open in the background when your computer starts.
                      </div>
                    </div>
                    <Switch checked={openAtLogin} onCheckedChange={setOpenAtLogin} />
                  </div>
                </Panel>
              </div>

              {/* Right column */}
              <div className="space-y-4 min-w-0">
                <Panel className="p-5">
                  <SectionHeader
                    title="Sync"
                    subtitle={
                      driveStatus.isConnected
                        ? 'Google Drive sync is connected.'
                        : 'Sync logs and goals through Google Drive app data.'
                    }
                    action={
                      driveStatus.isConnected && (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[12px] text-emerald-300">
                          Connected
                        </span>
                      )
                    }
                  />
                  {!driveStatus.isConnected ? (
                    <Button
                      variant="outline"
                      onClick={handleDriveConnect}
                      className="mt-4 w-full rounded-md bg-white/5 border-white/10 py-5 text-[14px] text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      Connect with Google
                    </Button>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3">
                        <div>
                          <div className="text-[14px] font-medium text-white/75">
                            Background sync
                          </div>
                          <div className="mt-1 text-[12px] text-white/40">
                            {driveStatus.isSyncing ? 'Syncing now...' : 'Ready'}
                          </div>
                        </div>
                        <Switch checked={driveSyncEnabled} onCheckedChange={setDriveSyncEnabled} />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={handleDriveSyncNow}
                          disabled={!driveSyncEnabled || driveStatus.isSyncing}
                          className="flex-1 bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 h-10"
                        >
                          {driveStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDriveDisconnect}
                          className="flex-1 h-10"
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </Panel>

                <Panel className="p-5">
                  <SectionHeader title="Data Location" />
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3">
                    <span className="flex-1 truncate font-mono text-[13px] text-white/55">
                      {dataPath}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(dataPath)}
                      className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </Panel>
              </div>
            </div>

            {saved && (
              <div className="text-center text-[12px] text-emerald-400/70 py-2 mt-2 animate-pulse">
                ✓ Settings saved
              </div>
            )}
          </PageShell>
        </TabsContent>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </Tabs>
  )
}

export default App
