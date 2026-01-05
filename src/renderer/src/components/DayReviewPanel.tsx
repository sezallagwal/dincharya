import { DailyGoal, DayReviewData } from '../../../shared/types'
import { TimelineList } from './TimelineList'
import { EmptyState, ProgressBar } from './DashboardLayout'
import { formatMinutes } from '../lib/utils'

interface DayReviewPanelProps {
  review: DayReviewData | null
  today: string
  onCarryGoal: (goal: DailyGoal) => Promise<void>
}



export function DayReviewPanel({ review, today, onCarryGoal }: DayReviewPanelProps) {
  if (!review) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/45 text-[14px]">
        Loading day review...
      </div>
    )
  }

  const unfinishedGoals = review.goals.filter((goal) => goal.status === 'planned')
  const canCarry = review.date !== today
  const otherLogs = review.logs.filter((log) => !log.goalId && !!log.productivity)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 shrink-0 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-white/85">
            Day Review
            <span className="text-[13px] font-normal text-white/40 ml-2">{review.date}</span>
          </h3>
          <div className="text-[12px] text-white/45">
            {formatMinutes(review.totalProductiveMinutes)} productive · {review.logs.length} {review.logs.length === 1 ? 'log' : 'logs'} · {review.goals.length} {review.goals.length === 1 ? 'goal' : 'goals'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
        {review.goalBreakdown.length === 0 && review.logs.length === 0 ? (
          <EmptyState
            title="No logs for this day"
            description="When you log a check-in, it will appear here with its goal and time block."
            className="h-full"
          />
        ) : (
          <>
            {review.goalBreakdown.map((goal) => {
              const sourceGoal = review.goals.find((dailyGoal) => dailyGoal.id === goal.goalId)
              const target = goal.targetMinutes || sourceGoal?.targetMinutes || 0
              const pct = target > 0 ? Math.min(100, Math.round((goal.productiveMinutes / target) * 100)) : 0
              const reached = target > 0 && goal.productiveMinutes >= target

              return (
                <div key={goal.goalId} className="rounded-lg border border-white/10 bg-white/[0.025] overflow-hidden">
                  <div className="flex items-start justify-between gap-3 px-3 py-3 border-b border-white/10">
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-white/80 truncate">{goal.title}</div>
                      <div className="mt-1 text-[12px] text-white/45">
                        {target > 0
                          ? `${formatMinutes(goal.productiveMinutes)} / ${formatMinutes(target)} productive`
                          : `${formatMinutes(goal.productiveMinutes)} productive`}
                      </div>
                      {target > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <ProgressBar value={Math.max(pct, goal.productiveMinutes > 0 ? 4 : 0)} className="w-28" />
                          <span className={`text-[11px] ${reached ? 'text-emerald-300/75' : 'text-white/40'}`}>
                            {reached ? 'Target reached' : `${pct}%`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          goal.status === 'done'
                            ? 'text-emerald-300/70 bg-emerald-500/10 border-emerald-500/15'
                            : 'text-white/45 bg-white/5 border-white/10'
                        }`}
                      >
                        {goal.status === 'done'
                          ? 'Done'
                          : goal.status === 'skipped'
                            ? 'Skipped'
                            : goal.status === 'archived'
                              ? 'Archived'
                              : 'Planned'}
                      </span>
                      {canCarry && sourceGoal && goal.status === 'planned' && (
                        <button
                          onClick={() => onCarryGoal(sourceGoal)}
                          className="text-[12px] font-medium text-emerald-300/75 hover:text-emerald-200"
                        >
                          Carry
                        </button>
                      )}
                    </div>
                  </div>
                  {goal.logs.length > 0 ? (
                    <TimelineList logs={goal.logs} emptyMessage="No logs for this goal." />
                  ) : (
                    <div className="px-3 py-3 text-[13px] text-white/40">No logs recorded for this goal.</div>
                  )}
                </div>
              )
            })}

            {otherLogs.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.025] overflow-hidden">
                <div className="px-3 py-3 border-b border-white/10">
                  <div className="text-[14px] font-medium text-white/80">Other work</div>
                  <div className="text-[12px] text-white/45">
                    {formatMinutes(review.otherProductiveMinutes)} productive
                  </div>
                </div>
                <TimelineList logs={otherLogs} emptyMessage="No other logs." />
              </div>
            )}

            {review.unclassifiedLogs.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.025] overflow-hidden">
                <div className="px-3 py-3 border-b border-white/10">
                  <div className="text-[14px] font-medium text-white/80">Legacy / unclassified logs</div>
                  <div className="text-[12px] text-white/45">Shown for history, not counted as productive time.</div>
                </div>
                <TimelineList logs={review.unclassifiedLogs} emptyMessage="No unclassified logs." />
              </div>
            )}

            {canCarry && unfinishedGoals.length > 0 && (
              <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-3">
                <div className="text-[12px] text-emerald-300/70 font-semibold mb-2">
                  Carry Forward
                </div>
                <div className="space-y-1">
                  {unfinishedGoals.map((goal) => (
                    <button
                      key={goal.id}
                      onClick={() => onCarryGoal(goal)}
                      className="w-full text-left text-[13px] text-white/70 hover:text-white transition-colors"
                    >
                      {goal.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
