// src/components/dashboard-module.tsx



import { type DragEvent, type ReactNode, useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react'


export interface DashboardModuleWrapperProps {
  moduleId: string
  title: string
  description?: string
  onDragStart?: (moduleId: string) => void
  onDragEnd?: () => void
  onDragOver?: (moduleId: string) => void
  onDrop?: (targetModuleId: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isDragging?: boolean
  isDragOver?: boolean
  children: ReactNode
}

export function DashboardModuleWrapper({
  moduleId,
  title,
  description,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
  isDragging = false,
  isDragOver = false,
  children,
}: DashboardModuleWrapperProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleDragStart = (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', moduleId)
    onDragStart?.(moduleId)
  }


  const handleDragEnd = () => {
    onDragEnd?.()
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(moduleId)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    onDrop?.(moduleId)
  }

  return (
    <div
      className={`
        group relative rounded-2xl border transition-all duration-300
        ${
          isDragging
            ? 'opacity-50 scale-95'
            : isDragOver
            ? 'ring-2 ring-purple-400/50 border-purple-400/50 scale-[1.02]'
            : 'border-white/10 hover:border-purple-400/30'
        }
        bg-gradient-to-br from-slate-800/40 via-slate-800/30 to-slate-900/40
        backdrop-blur-sm shadow-xl
      `}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Module Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 flex-1">
          {/* Drag Handle */}
          <button
            type="button"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="cursor-grab active:cursor-grabbing text-white/40 hover:text-purple-400 transition-colors"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-5 h-5" />
          </button>

          {/* Title & Description */}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {description && (
              <p className="text-xs text-white/60">{description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="text-white/40 hover:text-purple-400 disabled:opacity-30 disabled:hover:text-white/40 transition-colors p-1"
            aria-label="Move Up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="text-white/40 hover:text-purple-400 disabled:opacity-30 disabled:hover:text-white/40 transition-colors p-1"
            aria-label="Move Down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white/40 hover:text-purple-400 transition-colors p-1"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${
                isCollapsed ? '-rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Module Content */}
      {!isCollapsed && (
        <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  )
}
