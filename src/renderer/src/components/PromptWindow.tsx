import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DailyGoal,
  IpcChannels,
  ProductivityLevel,
  ReminderStatus,
  localDateStr
} from '../../../shared/types'

type Selection =
  | { type: 'goal'; goal: DailyGoal }
  | { type: 'other' }
  | { type: 'break' }
  | null

const PRODUCTIVITY_OPTIONS: { value: ProductivityLevel; label: string }[] = [
  { value: 'productive', label: 'Productive' },
  { value: 'partial', label: 'Partial' },
  { value: 'unproductive', label: 'Not productive' },
  { value: 'break', label: 'Break' }
]

const formatTime = (iso?: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function PromptWindow() {
  const [goals, setGoals] = useState<DailyGoal[]>([])
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [note, setNote] = useState('')
  const [productivity, setProductivity] = useState<ProductivityLevel>('productive')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadPromptData = useCallback(async () => {
    try {
      const today = localDateStr()
      const [dailyGoals, schedulerStatus] = await Promise.all([
        window.electron.ipcRenderer.invoke(IpcChannels.GetGoals, { date: today }),
        window.electron.ipcRenderer.invoke(IpcChannels.RemindGetStatus)
      ])
      setGoals((dailyGoals || []).filter((goal: DailyGoal) => goal.status === 'planned'))
      setReminderStatus(schedulerStatus as ReminderStatus)
    } catch (err) {
      console.error('Failed to load prompt data:', err)
    }
  }, [])

  const resetPrompt = useCallback(() => {
    setStatus('idle')
    setSelection(null)
    setNote('')
    setProductivity('productive')
    loadPromptData()
  }, [loadPromptData])

  const handleBlur = useCallback(() => {
    if (selection) {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [selection])

  useEffect(() => {
    const handleFocus = () => {
      resetPrompt()
    }

    window.addEventListener('focus', handleFocus)
    handleFocus()

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [resetPrompt])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      const height = el.scrollHeight
      window.electron.ipcRenderer.send(IpcChannels.PromptResize, height)
    })
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (selection) {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [selection])

  const handleSnooze = () => {
    window.electron.ipcRenderer.send(IpcChannels.RemindSnooze)
    setTimeout(resetPrompt, 100)
  }

  const handleSelect = (nextSelection: Selection) => {
    setSelection(nextSelection)
    setNote('')
    setProductivity(nextSelection?.type === 'break' ? 'break' : 'productive')
  }

  const selectedTitle = useMemo(() => {
    if (!selection) return ''
    if (selection.type === 'goal') return selection.goal.title
    if (selection.type === 'other') return 'Other productive work'
    return 'Break'
  }, [selection])

  const handleSubmit = async () => {
    if (!selection) return

    const trimmedNote = note.trim()
    const finalProductivity: ProductivityLevel = selection.type === 'break' ? 'break' : productivity

    const text =
      selection.type === 'goal'
        ? trimmedNote
          ? `${selection.goal.title}: ${trimmedNote}`
          : selection.goal.title
        : trimmedNote || selectedTitle

    setStatus('saving')

    try {
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        text,
        goalId: selection.type === 'goal' ? selection.goal.id : undefined,
        goalTitle: selection.type === 'goal' ? selection.goal.title : undefined,
        note: trimmedNote || undefined,
        productivity: finalProductivity
      }

      await window.electron.ipcRenderer.invoke(IpcChannels.AppendLog, {
        date: localDateStr(),
        entry
      })

      setStatus('saved')
      setTimeout(() => {
        window.electron.ipcRenderer.send(IpcChannels.RemindSubmit)
        setTimeout(resetPrompt, 100)
      }, 400)
    } catch (err) {
      console.error('Failed to save entry:', err)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      handleSnooze()
    }
  }

  return (
    <div
      ref={containerRef}
      className="w-screen flex flex-col p-4 select-none space-y-2.5"
      style={{
        background: 'linear-gradient(135deg, rgb(15,15,20) 0%, rgb(20,18,30) 100%)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)'
      }}
    >
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">
              Time to log
            </span>
          </div>
          <h3 className="text-[15px] font-semibold text-white/90 leading-snug">
            What did you work on since {formatTime(reminderStatus?.currentBlockStartedAt) || 'the last check-in'}?
          </h3>
        </div>

        {!selection ? (
          <div className="space-y-2">
            <div className="grid gap-2 max-h-[122px] overflow-y-auto custom-scrollbar pr-1">
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => handleSelect({ type: 'goal', goal })}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all bg-white/5 border border-white/10 text-white/75 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-white"
                >
                  {goal.title}
                </button>
              ))}
              {goals.length === 0 && (
                <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-center text-xs text-white/25">
                  Add goals in Today to log against your plan.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSelect({ type: 'other' })}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                Other
              </button>
              <button
                onClick={() => handleSelect({ type: 'break' })}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/15 text-amber-200/70 hover:text-amber-100 transition-all"
              >
                Break
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setSelection(null)}
              className="w-full text-left px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-medium"
            >
              {selectedTitle}
            </button>

            {reminderStatus && (
              <div className="text-[10px] text-white/25 bg-white/[0.03] border border-white/5 rounded-md px-3 py-2">
                Block: {formatTime(reminderStatus.currentBlockStartedAt)} - now
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="Optional detail, question name, or what got done..."
              autoFocus
              rows={2}
              disabled={status === 'saving'}
              className="w-full px-4 py-3 rounded-lg text-sm text-white/90 placeholder:text-white/20 resize-none outline-none transition-all duration-200 focus:ring-1 focus:ring-emerald-500/40"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            />

            {selection.type !== 'break' && (
              <div className="grid grid-cols-3 gap-2">
                {PRODUCTIVITY_OPTIONS.filter((option) => option.value !== 'break').map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setProductivity(option.value)}
                    className={`px-2 py-2 rounded-md text-[10px] font-semibold transition-all ${
                      productivity === option.value
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/25'
                        : 'bg-white/5 text-white/35 border border-white/5 hover:text-white/60'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'saved' && (
          <div className="text-center text-xs text-emerald-400 animate-pulse">Saved!</div>
        )}
        {status === 'error' && (
          <div className="text-center text-xs text-red-400">Failed to save. Try again.</div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleSnooze}
            className="px-4 py-2 text-xs font-medium text-white/40 hover:text-white/70 transition-colors rounded-md"
          >
            Snooze
          </button>
          {selection && (
            <button
              onClick={handleSubmit}
              disabled={status === 'saving'}
              className="px-5 py-2 text-xs font-semibold rounded-md transition-all duration-200 shadow-lg hover:shadow-emerald-500/20 disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white'
              }}
            >
              {status === 'saving' ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>

        <div className="flex justify-center gap-4 text-[10px] text-white/20 font-medium">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 mr-1">Enter</kbd>
            Save
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 mr-1">Esc</kbd>
            Snooze
          </span>
        </div>
    </div>
  )
}
