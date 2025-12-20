import { FormEvent, useMemo, useState } from 'react'
import { DailyGoal, DayReviewData, GoalInboxItem, RecurringGoal } from '../../../shared/types'
import { EmptyState, Panel, ProgressBar, SectionHeader } from './DashboardLayout'
import { formatMinutes } from '../lib/utils'
import { cn } from '../lib/utils'

interface GoalsPanelProps {
  today: string
  dailyGoals: DailyGoal[]
  review: DayReviewData | null
  inboxGoals: GoalInboxItem[]
  recurringGoals: RecurringGoal[]
  onAddDailyGoal: (title: string, targetMinutes?: number) => Promise<void>
  onUpdateDailyGoal: (goal: DailyGoal) => Promise<void>
  onAddInboxGoal: (title: string, note?: string) => Promise<void>
  onUpdateInboxGoal: (item: GoalInboxItem) => Promise<void>
  onAddInboxToToday: (item: GoalInboxItem, targetMinutes?: number) => Promise<void>
  onAddRecurringGoal: (
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string
  ) => Promise<void>
  onUpdateRecurringGoal: (goal: RecurringGoal) => Promise<void>
}

type GoalsView = 'today' | 'inbox' | 'recurring'

const TARGET_PRESETS = [
  { label: 'No target', value: 0 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 }
]

function TargetPicker({
  value,
  onChange
}: {
  value?: number
  onChange: (value?: number) => void
}) {
  const [custom, setCustom] = useState('')

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {TARGET_PRESETS.map((target) => (
        <button
          key={target.label}
          type="button"
          onClick={() => {
            setCustom('')
            onChange(target.value || undefined)
          }}
          className={`h-9 rounded-md border text-[12px] font-medium transition-colors ${
            (value || 0) === target.value && !custom
              ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
              : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70'
          }`}
        >
          {target.label}
        </button>
      ))}
      <input
        type="number"
        min={1}
        max={1440}
        value={custom}
        onChange={(event) => {
          setCustom(event.target.value)
          const parsed = parseInt(event.target.value, 10)
          onChange(parsed > 0 ? parsed : undefined)
        }}
        placeholder="Min"
        className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[12px] text-white/75 placeholder:text-white/35 outline-none focus:ring-1 focus:ring-emerald-400/40"
      />
    </div>
  )
}

export function GoalsPanel({
  today,
  dailyGoals,
  review,
  inboxGoals,
  recurringGoals,
  onAddDailyGoal,
  onUpdateDailyGoal,
  onAddInboxGoal,
  onUpdateInboxGoal,
  onAddInboxToToday,
  onAddRecurringGoal,
  onUpdateRecurringGoal
}: GoalsPanelProps) {
  const [view, setView] = useState<GoalsView>('today')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [targetMinutes, setTargetMinutes] = useState<number | undefined>(undefined)
  const [endsOn, setEndsOn] = useState('')
  const [inboxTargetFor, setInboxTargetFor] = useState<string | null>(null)
  const [inboxTargetMinutes, setInboxTargetMinutes] = useState<number | undefined>(undefined)

  const productiveByGoal = useMemo(() => {
    const map = new Map<string, number>()
    review?.goalBreakdown.forEach((goal) => map.set(goal.goalId, goal.productiveMinutes))
    return map
  }, [review])

  const activeDailyGoals = dailyGoals.filter((goal) => goal.status === 'planned' || goal.status === 'done')
  const activeInboxGoals = inboxGoals.filter((item) => item.status === 'active')
  const visibleRecurringGoals = recurringGoals.filter((goal) => goal.status !== 'archived' && goal.status !== 'deleted')

  const resetForm = () => {
    setTitle('')
    setNote('')
    setTargetMinutes(undefined)
    setEndsOn('')
    setShowForm(false)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    if (view === 'today') await onAddDailyGoal(trimmed, targetMinutes)
    if (view === 'inbox') await onAddInboxGoal(trimmed, note)
    if (view === 'recurring') await onAddRecurringGoal(trimmed, targetMinutes, today, endsOn || undefined)
    resetForm()
  }

  const updateDailyStatus = async (goal: DailyGoal, status: DailyGoal['status']) => {
    const now = new Date().toISOString()
    await onUpdateDailyGoal({
      ...goal,
      status,
      completedAt: status === 'done' ? goal.completedAt || now : undefined,
      skippedAt: status === 'skipped' ? goal.skippedAt || now : undefined,
      archivedAt: status === 'archived' ? goal.archivedAt || now : undefined
    })
  }

  const updateRecurringStatus = async (goal: RecurringGoal, status: RecurringGoal['status']) => {
    const now = new Date().toISOString()
    await onUpdateRecurringGoal({
      ...goal,
      status,
      pausedAt: status === 'paused' ? goal.pausedAt || now : goal.pausedAt,
      archivedAt: status === 'archived' ? goal.archivedAt || now : goal.archivedAt,
      deletedAt: status === 'deleted' ? goal.deletedAt || now : goal.deletedAt
    })
  }

  const viewMeta = {
    today: {
      title: 'Today',
      subtitle: "Goals that appear in today's check-in prompt.",
      action: 'Add goal',
      placeholder: "What will you focus on today?"
    },
    inbox: {
      title: 'Backlog',
      subtitle: 'Save ideas here for later.',
      action: 'Add to backlog',
      placeholder: 'Capture a goal for later...'
    },
    recurring: {
      title: 'Routines',
      subtitle: 'Daily routines added to Today automatically.',
      action: 'Add routine',
      placeholder: 'Add a daily routine...'
    }
  }[view]

  const tabs = [
    { id: 'today' as GoalsView, label: 'Today', count: activeDailyGoals.length },
    { id: 'inbox' as GoalsView, label: 'Backlog', count: activeInboxGoals.length },
    { id: 'recurring' as GoalsView, label: 'Routines', count: visibleRecurringGoals.length }
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontal tab bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id)
                resetForm()
              }}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium transition-colors',
                view === item.id
                  ? 'bg-emerald-400/12 text-emerald-300'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/75'
              )}
            >
              <span>{item.label}</span>
              {item.count > 0 && (
                <span className={cn(
                  'text-[11px] min-w-[18px] text-center rounded-full px-1.5 py-0.5',
                  view === item.id ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-white/35'
                )}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm((open) => !open)}
          className={cn(
            'rounded-md px-4 py-2 text-[13px] font-medium transition-colors',
            showForm
              ? 'border border-white/10 bg-white/5 text-white/60 hover:text-white/80'
              : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15'
          )}
        >
          {showForm ? 'Cancel' : viewMeta.action}
        </button>
      </div>

      {/* Content panel */}
      <Panel className="overflow-hidden p-5">
        <SectionHeader
          title={viewMeta.title}
          subtitle={viewMeta.subtitle}
        />

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-emerald-400/15 bg-white/[0.025] p-4 space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={viewMeta.placeholder}
              autoFocus
              className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-[14px] text-white/80 placeholder:text-white/35 outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
            {view === 'inbox' && (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note..."
                rows={2}
                className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white/80 placeholder:text-white/35 outline-none focus:ring-1 focus:ring-emerald-400/40"
              />
            )}
            {view !== 'inbox' && <TargetPicker value={targetMinutes} onChange={setTargetMinutes} />}
            {view === 'recurring' && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-white/45">Until</span>
                <input
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                  className="h-10 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-[14px] text-white/75 outline-none focus:ring-1 focus:ring-emerald-400/40"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={!title.trim()}
              className="w-full h-10 rounded-md bg-gradient-to-r from-emerald-600 to-emerald-500 text-[13px] font-semibold text-white shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {view === 'today' ? 'Add Goal' : view === 'inbox' ? 'Save to Backlog' : 'Add Routine'}
            </button>
          </form>
        )}

        <div className="mt-4 max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {view === 'today' && (
            activeDailyGoals.length === 0 ? (
              <EmptyState title="No goals for today yet" description="Add one to track your focus during check-ins." />
            ) : (
              activeDailyGoals.map((goal) => {
                const actual = productiveByGoal.get(goal.id) || 0
                const target = goal.targetMinutes || 0
                const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
                const done = goal.status === 'done'
                return (
                  <div key={goal.id} className={cn(
                    'group rounded-lg border border-white/10 bg-white/[0.025] p-3 border-l-2',
                    done
                      ? 'border-l-emerald-400/50'
                      : actual > 0
                        ? 'border-l-amber-400/50'
                        : 'border-l-white/15'
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={cn('truncate text-[14px] font-medium', done ? 'text-white/35 line-through' : 'text-white/80')}>{goal.title}</div>
                        <div className="mt-1 text-[12px] text-white/45">
                          {goal.sourceRecurringGoalId ? '🔁 Routine' : goal.sourceInboxGoalId ? '📥 Backlog' : '✏️ Manual'}
                          {' · '}
                          {target > 0 ? `${formatMinutes(actual)} / ${formatMinutes(target)}` : `${formatMinutes(actual)} productive`}
                        </div>
                      </div>
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        done ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/45'
                      )}>
                        {done ? 'Done' : 'Planned'}
                      </span>
                    </div>
                    {target > 0 && <ProgressBar value={pct} className="mt-3" />}
                    <div className="mt-3 flex gap-3 items-center">
                      <button onClick={() => updateDailyStatus(goal, done ? 'planned' : 'done')} className="text-[12px] font-medium text-emerald-300/80 hover:text-emerald-200">
                        {done ? 'Mark planned' : '✓ Done'}
                      </button>
                      <button onClick={() => updateDailyStatus(goal, 'skipped')} className="text-[12px] font-medium text-amber-300/75 hover:text-amber-200 opacity-0 group-hover:opacity-100 transition-opacity">Skip today</button>
                      <button onClick={() => updateDailyStatus(goal, 'archived')} className="text-[12px] font-medium text-white/40 hover:text-white/65 opacity-0 group-hover:opacity-100 transition-opacity">Archive</button>
                    </div>
                  </div>
                )
              })
            )
          )}

          {view === 'inbox' && (
            activeInboxGoals.length === 0 ? (
              <EmptyState title="Your backlog is empty" description="Save ideas here for later — promote them to Today when you're ready." />
            ) : (
              activeInboxGoals.map((item) => (
                <div key={item.id} className="group rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <div className="text-[14px] font-medium text-white/80">{item.title}</div>
                  {item.note && <div className="mt-1 text-[12px] leading-relaxed text-white/45">{item.note}</div>}
                  {inboxTargetFor === item.id && (
                    <div className="mt-3">
                      <TargetPicker value={inboxTargetMinutes} onChange={setInboxTargetMinutes} />
                    </div>
                  )}
                  <div className="mt-3 flex gap-3 items-center">
                    <button
                      onClick={async () => {
                        if (inboxTargetFor !== item.id) {
                          setInboxTargetFor(item.id)
                          setInboxTargetMinutes(undefined)
                          return
                        }
                        await onAddInboxToToday(item, inboxTargetMinutes)
                        setInboxTargetFor(null)
                      }}
                      className="text-[12px] font-medium text-emerald-300/80 hover:text-emerald-200"
                    >
                      {inboxTargetFor === item.id ? 'Confirm today' : 'Add to Today'}
                    </button>
                    <button onClick={() => onUpdateInboxGoal({ ...item, status: 'archived', archivedAt: new Date().toISOString() })} className="text-[12px] font-medium text-white/40 hover:text-white/65 opacity-0 group-hover:opacity-100 transition-opacity">Archive</button>
                  </div>
                </div>
              ))
            )
          )}

          {view === 'recurring' && (
            visibleRecurringGoals.length === 0 ? (
              <EmptyState title="No routines set up" description="Create daily habits that automatically appear in Today." />
            ) : (
              visibleRecurringGoals.map((goal) => (
                <div key={goal.id} className={cn(
                  'group rounded-lg border border-white/10 bg-white/[0.025] p-3 border-l-2',
                  goal.status === 'active' ? 'border-l-emerald-400/50'
                    : goal.status === 'paused' ? 'border-l-amber-400/50'
                    : 'border-l-white/15'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-white/80">{goal.title}</div>
                      <div className="mt-1 text-[12px] text-white/45">
                        Daily{goal.targetMinutes ? ` · ${formatMinutes(goal.targetMinutes)}` : ''}
                        {goal.endsOn ? ` · until ${goal.endsOn}` : ''}
                      </div>
                    </div>
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] capitalize',
                      goal.status === 'active' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/45'
                    )}>{goal.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 items-center">
                    <button onClick={() => updateRecurringStatus(goal, goal.status === 'paused' ? 'active' : 'paused')} className="text-[12px] font-medium text-emerald-300/80 hover:text-emerald-200">
                      {goal.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button onClick={() => updateRecurringStatus(goal, 'archived')} className="text-[12px] font-medium text-white/40 hover:text-white/65 opacity-0 group-hover:opacity-100 transition-opacity">Archive</button>
                    <button onClick={() => updateRecurringStatus(goal, 'deleted')} className="text-[12px] font-medium text-red-300/50 hover:text-red-300/80 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </Panel>
    </div>
  )
}
