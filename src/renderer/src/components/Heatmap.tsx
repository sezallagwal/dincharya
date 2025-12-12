import React, { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface HeatmapProps {
  data: Record<string, number>
  onDayClick?: (date: string) => void
}

export function Heatmap({ data, onDayClick }: HeatmapProps): React.JSX.Element {
  // Generate last 365 days
  const { flatDays, monthLabels } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // go back 364 days
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 364)
    
    // adjust to nearest Sunday before startDate
    while (startDate.getDay() !== 0) {
      startDate.setDate(startDate.getDate() - 1)
    }

    const flatDays: { date: string; count: number; month: number }[] = []
    const monthLabels: { month: string; colIndex: number }[] = []
    let lastMonth = -1

    const currentDate = new Date(startDate)
    let dayIndex = 0
    
    while (currentDate <= today) {
      const dateStr = [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, '0'),
        String(currentDate.getDate()).padStart(2, '0')
      ].join('-')
      
      const month = currentDate.getMonth()
      if (month !== lastMonth && currentDate.getDate() <= 14) {
         monthLabels.push({
           month: currentDate.toLocaleString('default', { month: 'short' }),
           colIndex: Math.floor(dayIndex / 7)
         })
         lastMonth = month
      }

      flatDays.push({
        date: dateStr,
        count: data[dateStr] || 0,
        month
      })

      currentDate.setDate(currentDate.getDate() + 1)
      dayIndex++
    }

    return { flatDays, monthLabels }
  }, [data])

  const getColor = (count: number) => {
    if (count === 0) return 'bg-white/[0.04] border-white/[0.06]'
    if (count < 3) return 'bg-emerald-900/70 border-emerald-800/40'
    if (count < 6) return 'bg-emerald-600/70 border-emerald-500/40'
    if (count < 10) return 'bg-emerald-500/90 border-emerald-400/50'
    return 'bg-emerald-400 border-emerald-300/70'
  }

  const [hovered, setHovered] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  const getTooltipStyle = (): React.CSSProperties => {
    if (!hovered) return {}
    const padding = 12
    const tooltipHeight = 36 // Estimated height
    
    const style: React.CSSProperties = {}
    
    // Position vertically
    let top = hovered.y - tooltipHeight - 16
    if (top < padding) {
      // Flip to bottom if it goes above viewport
      top = hovered.y + 24
    }
    style.top = top

    // Position horizontally using left/right anchors to absolutely guarantee no overflow
    // If we're on the right side of the screen, anchor the tooltip to the right of the cursor (expands left)
    if (hovered.x > window.innerWidth / 2) {
      style.right = window.innerWidth - hovered.x + 10
    } else {
      // If we're on the left side, anchor it to the left of the cursor (expands right)
      style.left = hovered.x + 10
    }

    return style
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [flatDays])

  // Cell size: 12px cells with 5px gap => column width = 17px
  const colWidth = 17

  return (
    <div ref={scrollRef} className="w-full overflow-x-auto custom-scrollbar pb-4 pt-2 relative">
      <div className="min-w-max mx-auto flex gap-3 relative" style={{ width: 'fit-content' }}>
        <div className="grid grid-rows-7 text-[11px] text-white/40 text-right pr-1.5 pt-[22px]" style={{ gap: '5px' }}>
           <div style={{ visibility: 'hidden', height: '12px' }}>Sun</div>
           <div style={{ height: '12px', lineHeight: '12px' }}>Mon</div>
           <div style={{ visibility: 'hidden', height: '12px' }}>Tue</div>
           <div style={{ height: '12px', lineHeight: '12px' }}>Wed</div>
           <div style={{ visibility: 'hidden', height: '12px' }}>Thu</div>
           <div style={{ height: '12px', lineHeight: '12px' }}>Fri</div>
           <div style={{ visibility: 'hidden', height: '12px' }}>Sat</div>
        </div>
        
        <div className="relative pt-[22px]">
           {/* month labels */}
           <div className="absolute top-0 left-0 right-0 h-[22px] text-[11px] text-white/45 pointer-events-none">
              {monthLabels.map((ml, i) => (
                <div 
                  key={i} 
                  className="absolute top-0"
                  style={{ left: `${ml.colIndex * colWidth}px` }}
                >
                  {ml.month}
                </div>
              ))}
           </div>
           
           {/* grid of days */}
           <div className="grid grid-rows-7 grid-flow-col" style={{ gap: '5px' }}>
             {flatDays.map((day) => (
                <div
                  key={day.date}
                  onClick={() => onDayClick?.(day.date)}
                  onMouseMove={(e) => setHovered({ ...day, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-3 h-3 rounded-[3px] border ${getColor(day.count)} transition-all duration-200 hover:scale-[1.3] hover:brightness-125 relative cursor-pointer`}
                />
             ))}
           </div>
        </div>
      </div>
      
      {hovered && createPortal(
        <div 
          className="fixed bg-gray-900/95 backdrop-blur-xl text-white text-[11px] px-3 py-2 rounded-lg shadow-2xl border border-white/10 pointer-events-none z-[9999] flex items-center gap-2 transition-opacity"
          style={getTooltipStyle()}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)] shrink-0"></span>
          <span className="whitespace-nowrap">
            <strong className="text-emerald-400 font-bold">{hovered.count} logs</strong>{' '}
            {new Date(hovered.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>,
        document.body
      )}
    </div>
  )
}
