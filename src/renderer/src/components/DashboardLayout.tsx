import { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <main
      className={cn(
        'mx-auto h-full w-full min-h-0 px-5 pb-6 max-w-[1180px]',
        className
      )}
    >
      {children}
    </main>
  )
}

interface PanelProps {
  children: ReactNode
  className?: string
}

export function Panel({ children, className }: PanelProps) {
  return (
    <section className={cn('rounded-lg border border-white/10 bg-white/[0.035]', className)}>
      {children}
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  action?: ReactNode
  subtitle?: string
  className?: string
}

export function SectionHeader({ title, action, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div>
        <h2 className="text-[15px] font-semibold leading-tight text-white/85">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] leading-relaxed text-white/45">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  accent?: boolean
  hint?: string
}

export function MetricCard({ label, value, accent, hint }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 transition-colors hover:bg-white/[0.05]">
      <div className="text-[12px] font-medium text-white/45">{label}</div>
      <div className={cn('mt-1 text-[20px] font-semibold leading-tight', accent ? 'text-emerald-300' : 'text-white/90')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-white/40">{hint}</div>}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] px-4 py-6 text-center', className)}>
      <div className="text-[14px] font-medium text-white/65">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[12px] leading-relaxed text-white/40">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

interface ProgressBarProps {
  value: number
  className?: string
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-white/10', className)}>
      <div
        className="h-full rounded-full bg-emerald-400"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
