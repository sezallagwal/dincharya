import { useMemo } from 'react'
import { AnalyticsData } from '../../../shared/types'

interface StatsOverviewProps {
  data: AnalyticsData
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function StatsOverview({ data }: StatsOverviewProps) {
  const consistencyPct = useMemo(() => {
    if (data.totalTrackedDays === 0) return 0
    return Math.round((data.totalActiveDays / data.totalTrackedDays) * 100)
  }, [data])

  const weekdayMax = Math.max(...data.weekdayDistribution, 1)
  const trendMax = Math.max(...data.weeklyTrend.map((w) => w.count), 1)

  if (data.totalEntries === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/15 gap-2 px-4">
        <span className="text-2xl">📊</span>
        <span className="text-xs">Start logging to see your insights</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2.5 px-4 py-3 overflow-y-auto custom-scrollbar">
      {/* Key numbers */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
        {[
          { label: 'Entries', value: data.totalEntries.toString(), sub: `${data.avgPerActiveDay}/day avg` },
          { label: 'Streak', value: `${data.currentStreak}d`, sub: `${data.longestStreak}d best`, highlight: data.currentStreak > 0 },
          { label: 'Active', value: `${data.totalActiveDays}d`, sub: `${consistencyPct}% consistent` },
          { label: 'Peak Day', value: data.peakWeekday.slice(0, 3), sub: `${Math.max(...data.weekdayDistribution)} entries` },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border px-2.5 py-2 ${
              s.highlight ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            <div className="text-[9px] uppercase tracking-wider text-white/30 font-medium">{s.label}</div>
            <div className={`text-base font-bold leading-tight mt-0.5 ${s.highlight ? 'text-emerald-400' : 'text-white/85'}`}>{s.value}</div>
            <div className="text-[9px] text-white/20 mt-0.5 truncate">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Day of week breakdown — the main visualization */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 shrink-0">
        <div className="text-[9px] uppercase tracking-wider text-white/30 font-medium mb-3">Activity by Day</div>
        <div className="space-y-1.5">
          {DAY_LABELS.map((label, i) => {
            const count = data.weekdayDistribution[i]
            const pct = weekdayMax > 0 ? (count / weekdayMax) * 100 : 0
            const isTop = count === weekdayMax && count > 0
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={`text-[10px] w-7 shrink-0 font-medium ${isTop ? 'text-emerald-400' : 'text-white/35'}`}>
                  {label}
                </span>
                <div className="flex-1 h-4 bg-white/[0.03] rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm transition-all ${isTop ? 'bg-emerald-500' : 'bg-emerald-500/30'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className={`text-[10px] w-6 text-right font-mono ${isTop ? 'text-emerald-400' : 'text-white/25'}`}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Trend — last 12 weeks */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-medium">Weekly Trend</span>
          <span className="text-[9px] text-white/20">Last 12 weeks</span>
        </div>
        <div className="flex-1 flex items-end gap-[3px] min-h-[48px]">
          {data.weeklyTrend.map((w, i) => {
            const pct = trendMax > 0 ? (w.count / trendMax) * 100 : 0
            const isLast = i === data.weeklyTrend.length - 1
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex items-end" style={{ height: '100%', minHeight: '32px' }}>
                  <div
                    className={`w-full rounded-sm transition-all ${isLast ? 'bg-emerald-500' : 'bg-amber-500/30'}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={`${w.week}: ${w.count} entries`}
                  />
                </div>
                {i % 3 === 0 && (
                  <span className="text-[7px] text-white/20 leading-none truncate w-full text-center">
                    {w.week}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
