import { LogEntry } from '../../../shared/types'
import { formatTime, formatMinutes } from '../lib/utils'

const formatRange = (log: LogEntry, isFirst: boolean) => {
  if (!log.startedAt || !log.endedAt) return formatTime(log.timestamp)
  if (isFirst) return `${formatTime(log.startedAt)} - ${formatTime(log.endedAt)}`
  return formatTime(log.endedAt)
}

const formatDuration = (ms: number) => {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return '<1m'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const productivityColor = (p?: string) => {
  if (p === 'productive') return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20'
  if (p === 'partial') return 'text-amber-300 bg-amber-400/10 border-amber-400/20'
  if (p === 'unproductive') return 'text-red-300 bg-red-400/10 border-red-400/20'
  if (p === 'break') return 'text-blue-300 bg-blue-400/10 border-blue-400/20'
  return 'text-white/40 bg-white/5 border-white/10'
}

const productivityLabel = (log: LogEntry) => {
  if (!log.productivity) return 'Legacy'
  if (log.productivity === 'productive') return 'Productive'
  if (log.productivity === 'partial') return 'Partial'
  if (log.productivity === 'unproductive') return 'Not productive'
  return 'Break'
}

interface TimelineListProps {
  logs: LogEntry[]
  emptyMessage?: string
}

export function TimelineList({ logs, emptyMessage = 'No logs available' }: TimelineListProps) {
  if (logs.length === 0) {
    return (
      <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center gap-1 px-4">
        <span className="text-[14px] font-medium text-white/55">{emptyMessage}</span>
        <span className="text-[12px] text-white/30">Entries will appear here when you log activities</span>
      </div>
    )
  }

  return (
    <div className="py-1">
      {logs.map((log, index) => {
        const isFirst = index === 0
        const gapMs = !isFirst
          ? new Date(log.timestamp).getTime() - new Date(logs[index - 1].timestamp).getTime()
          : 0
        const gapLabel = !isFirst ? formatDuration(gapMs) : ''
        const productiveMinutes = log.productiveMinutes ?? log.durationMinutes
        const durationText = productiveMinutes && productiveMinutes > 0 ? formatMinutes(productiveMinutes) : ''

        return (
          <div key={log.id}>
            {/* Gap divider */}
            {!isFirst && (
              <div className="flex items-center gap-2 px-4 py-1">
                <div className="flex-1 border-t border-white/5" />
                <span
                  className={`text-[10px] font-mono shrink-0 ${
                    gapMs > 3600000 ? 'text-amber-400/50' : 'text-white/20'
                  }`}
                >
                  {gapLabel}
                </span>
                <div className="flex-1 border-t border-white/5" />
              </div>
            )}

            {/* Log entry row */}
            <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] rounded-lg transition-colors group">
              {/* Time column */}
              <span className="font-mono text-[12px] text-emerald-300/80 shrink-0 pt-0.5 w-[90px]">
                {formatRange(log, isFirst)}
              </span>

              {/* Note — fills remaining space */}
              <span className="flex-1 min-w-0 text-[13px] text-white/75 leading-relaxed truncate">
                {log.note || log.text}
              </span>

              {/* Badges */}
              <div className="flex items-center gap-1.5 shrink-0">
                {durationText && (
                  <span className="text-[10px] font-medium text-white/30">{durationText}</span>
                )}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${productivityColor(log.productivity)}`}
                >
                  {productivityLabel(log)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
