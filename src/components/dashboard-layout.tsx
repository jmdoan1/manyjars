// src/components/dashboard-layout.tsx

import { useState, useEffect, useRef } from 'react'
import { DashboardModuleWrapper } from './dashboard-module'
import { useDashboard } from '@/hooks/use-dashboard'
import type { ModuleDefinition } from '@/types/dashboard-types'

export interface DashboardLayoutProps {
  moduleDefinitions: ModuleDefinition[]
}

const MIN_COLUMN_WIDTH = 400

export function DashboardLayout({ moduleDefinitions }: DashboardLayoutProps) {
  const {
    modules,
    ensureLayoutForColumns,
    layout,
    moveModule,
  } = useDashboard({ moduleDefinitions })

  const containerRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(1)
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null) // module or column ID

  // Determine column count based on container width
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        const count = Math.max(1, Math.floor(width / MIN_COLUMN_WIDTH))
        setColumnCount(count)
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Ensure layout exists for current column count
  useEffect(() => {
    ensureLayoutForColumns(columnCount)
  }, [columnCount, ensureLayoutForColumns])

  const handleDragStart = (moduleId: string) => {
    setDraggedModuleId(moduleId)
  }

  const handleDragEnd = () => {
    setDraggedModuleId(null)
    setDragOverId(null)
  }

  const handleDragOver = (id: string) => {
    if (id !== draggedModuleId) {
      setDragOverId(id)
    }
  }

  const handleDropOnModule = (targetModuleId: string, colIndex: number) => {
    if (!draggedModuleId || draggedModuleId === targetModuleId) return

    const currentLayout = layout.layouts[columnCount]
    if (!currentLayout) return

    // Find source position
    let fromColIndex = -1
    let fromIndex = -1
    currentLayout.columns.forEach((col, cIndex) => {
      const idx = col.indexOf(draggedModuleId)
      if (idx !== -1) {
        fromColIndex = cIndex
        fromIndex = idx
      }
    })

    if (fromColIndex === -1) return

    // Find target index
    const targetCol = currentLayout.columns[colIndex]
    const toIndex = targetCol.indexOf(targetModuleId)
    
    // We insert *after* the target by default, or maybe before? 
    // Let's stick to "before" the target for standard list behavior, 
    // but if it's the same list and moving down, logic gets tricky.
    // Simplification: Insert at target index.
    
    if (toIndex !== -1) {
      moveModule(draggedModuleId, fromColIndex, fromIndex, colIndex, toIndex, columnCount)
    }
    
    setDragOverId(null)
    setDraggedModuleId(null)
  }

  const handleDropOnColumn = (colIndex: number) => {
    if (!draggedModuleId) return

    const currentLayout = layout.layouts[columnCount]
    if (!currentLayout) return

    // Find source position
    let fromColIndex = -1
    let fromIndex = -1
    currentLayout.columns.forEach((col, cIndex) => {
      const idx = col.indexOf(draggedModuleId)
      if (idx !== -1) {
        fromColIndex = cIndex
        fromIndex = idx
      }
    })

    if (fromColIndex === -1) return

    // Appending to the end of the column
    const targetCol = currentLayout.columns[colIndex]
    const toIndex = targetCol.length 

    // Don't move if we are dropping on the same column at the end
    if (fromColIndex === colIndex && fromIndex === targetCol.length - 1) return

    moveModule(draggedModuleId, fromColIndex, fromIndex, colIndex, toIndex, columnCount)
    
    setDragOverId(null)
    setDraggedModuleId(null)
  }

  // Create a map for quick lookup of module definitions
  const definitionMap = new Map(
    moduleDefinitions.map((def) => [def.type, def]),
  )
  
  // Create a map for quick lookup of module instances (visible ones)
  const moduleMap = new Map(
    modules.map((m) => [m.id, m])
  )

  const currentLayout = layout.layouts[columnCount]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-purple-300 to-teal-400 bg-clip-text text-transparent mb-2">
            ManyJar Dashboard
          </h1>
          <p className="text-white/60 text-lg">
            Your ADHD-friendly productivity hub
          </p>
        </div>

        {/* Masonry Grid Container */}
        <div ref={containerRef} className="flex gap-6 items-start">
          {currentLayout?.columns.map((columnModuleIds, colIndex) => (
            <div
              key={colIndex}
              className={`flex-1 flex flex-col gap-6 min-h-[200px] rounded-xl transition-colors ${
                 dragOverId === `col-${colIndex}` ? 'bg-white/5' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                // Only treat as column drop if distinct from module drop? 
                // Actually, if we are hovering a module, that bubble will happen first. 
                // We should set dragOverId for column only if not hovering a child.
                handleDragOver(`col-${colIndex}`)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation() // Stop bubbling
                handleDropOnColumn(colIndex)
              }}
            >
              {columnModuleIds.map((moduleId) => {
                const module = moduleMap.get(moduleId)
                if (!module || !module.visible) return null
                const definition = definitionMap.get(module.type)
                if (!definition) return null
                const ModuleComponent = definition.component

                return (
                  <DashboardModuleWrapper
                    key={moduleId}
                    moduleId={moduleId}
                    title={definition.name}
                    description={definition.description}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDropOnModule(moduleId, colIndex)}
                    isDragging={draggedModuleId === moduleId}
                    isDragOver={dragOverId === moduleId}
                  >
                    <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                       <ModuleComponent
                         moduleId={module.id}
                         config={module.config}
                       />
                    </div>
                  </DashboardModuleWrapper>
                )
              })}
              
              {/* Drop target filler if column is empty */}
              {columnModuleIds.length === 0 && (
                 <div className="h-32 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center text-white/20">
                    Drop here
                 </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State / Loading */}
        {!currentLayout && (
          <div className="text-center py-20">
             <p className="text-white/40">Loading layout...</p>
          </div>
        )}
      </div>
    </div>
  )
}
