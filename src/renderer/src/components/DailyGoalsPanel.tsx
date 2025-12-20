import { FormEvent, useMemo, useState } from 'react'
import { DailyGoal, DayReviewData } from '../../../shared/types'
import { EmptyState, Panel, ProgressBar, SectionHeader } from './DashboardLayout'
import { formatMinutes } from '../lib/utils'
import { cn } from '../lib/utils'

interface DailyGoalsPanelProps {
  goals: DailyGoal[]
  review: DayReviewData | null
  onAddGoal: (title: string) => Promise<void>
  onUpdateGoal: (goal: DailyGoal) => Promise<void>
}



const sourceLabel = (goal: DailyGoal) => {
  if (goal.sourceRecurringGoalId) return 'Routine'
  if (goal.sourceInboxGoalId) return 'Inbox'
  return 'Manual'
}

export function DailyGoalsPanel({ goals, review, onAddGoal, onUpdateGoal }: DailyGoalsPanelProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const productiveByGoal = useMemo(() => {
    const map = new Map<string, number>()
    review?.goalBreakdown.forEach((goal) => map.set(goal.goalId, goal.productiveMinutes))
    return map
  }, [review])

  const updateStatus = async (goal: DailyGoal, status: DailyGoal['status']) => {
    const now = new Date().toISOString()
    await onUpdateGoal({
      ...goal,
      status,
      completedAt: status === 'done' ? goal.completedAt || now : undefined,
      skippedAt: status === 'skipped' ? goal.skippedAt || now : undefined,
      archivedAt: status === 'archived' ? goal.archivedAt || now : undefined
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    setSaving(true)
    try {
      await onAddGoal(trimmed)
      setTitle('')
      setQuickAddOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="p-4 overflow-hidden flex flex-col lg:h-full">
      <SectionHeader
        title="Today's Focus"
        subtitle="Goals that appear in the check-in prompt."
        action={
          <button
            onClick={() => setQuickAddOpen((open) => !open)}
            className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-400/15"
          >
            Quick add
          </button>
        }
      />

      {quickAddOpen && (
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a simple goal for today..."
            className="h-9 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-[14px] text-white/80 placeholder:text-white/35 outline-none focus:ring-1 focus:ring-emerald-400/40"
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="h-9 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-4 text-[13px] font-semibold text-emerald-300 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}

      <div className="mt-4 space-y-2 overflow-y-auto custom-scrollbar flex-1 min-h-0">
        {goals.length === 0 ? (
          <EmptyState
            title="What will you focus on today?"
            description="Plan your day by adding a goal."
            action={
              <button
                onClick={() => setQuickAddOpen(true)}
                className="mt-1 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[13px] font-medium text-emerald-300 hover:bg-emerald-400/15"
              >
                + Add a goal
              </button>
            }
          />
        ) : (
          goals.map((goal) => {
            const actual = productiveByGoal.get(goal.id) || 0
            const target = goal.targetMinutes || 0
            const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
            const done = goal.status === 'done'

            return (
              <div key={goal.id} className={cn(
                'group rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 border-l-2',
                done
                  ? 'border-l-emerald-400/50'
                  : actual > 0
                    ? 'border-l-amber-400/50'
                    : 'border-l-white/15'
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[14px] font-medium ${done ? 'text-white/35 line-through' : 'text-white/80'}`}>
                      {goal.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-white/45">
                      <span>{sourceLabel(goal)}</span>
                      <span>{target > 0 ? `${formatMinutes(actual)} / ${formatMinutes(target)}` : `${formatMinutes(actual)} productive`}</span>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    done ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/45'
                  }`}>
                    {done ? 'Done' : 'Planned'}
                  </span>
                </div>

                {target > 0 && <ProgressBar value={pct} className="mt-3" />}

                <div className="mt-3 flex gap-3 items-center">
                  <button
                    onClick={() => updateStatus(goal, done ? 'planned' : 'done')}
                    className="text-[12px] font-medium text-emerald-300/80 hover:text-emerald-200"
                  >
                    {done ? 'Mark planned' : '✓ Done'}
                  </button>
                  <button
                    onClick={() => updateStatus(goal, 'skipped')}
                    className="text-[12px] font-medium text-amber-300/75 hover:text-amber-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Skip today
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Panel>
  )
}
