// src/components/dashboard-layout.tsx


import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { DashboardModuleWrapper } from './dashboard-module'
import { useDashboard } from '@/hooks/use-dashboard'
import type { ModuleDefinition } from '@/types/dashboard-types'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'


export interface DashboardLayoutProps {
  moduleDefinitions: ModuleDefinition[]
}

const MIN_COLUMN_WIDTH = 500

export function DashboardLayout({ moduleDefinitions }: DashboardLayoutProps) {
  const {
    modules,
    ensureLayoutForColumns,
    layout,
    moveModule,
    addModule,
    removeModule,
    updateModuleConfig,
  } = useDashboard({ moduleDefinitions })

  const containerRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(1)
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null) // module or column ID
  const [addingToColumn, setAddingToColumn] = useState<number | null>(null)


  // Determine column count based on container width
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const GAP = 24
        const width = entry.contentRect.width
        const count = Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN_WIDTH + GAP)))
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

  const handleMoveUp = (moduleId: string, colIndex: number, index: number) => {
    if (index === 0) return
    moveModule(moduleId, colIndex, index, colIndex, index - 1, columnCount)
  }

  const handleMoveDown = (moduleId: string, colIndex: number, index: number) => {
    // Check if valid move
    const currentLayout = layout.layouts[columnCount]
    if (!currentLayout) return
    
    // When moving down, we effectively insert at index+1 (after the next item)
    // Actually, because we remove first, if we want to swap with next item:
    // [A, B, C] -> move A down -> remove A -> [B, C] -> insert at 1 -> [B, A, C]
    // So toIndex = index + 1
    
    // Check bounds
    const colLength = currentLayout.columns[colIndex].length
    if (index >= colLength - 1) return

    moveModule(moduleId, colIndex, index, colIndex, index + 1, columnCount)
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
      <div className="w-full">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-purple-300 to-teal-400 bg-clip-text text-transparent mb-2">
            ManyJars
          </h1>
          {/* <p className="text-white/60 text-lg">
            Your ADHD-friendly productivity hub
          </p> */}
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
              {columnModuleIds.map((moduleId, index) => {
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
                    onRemove={() => removeModule(moduleId)}
                    onMoveUp={() => handleMoveUp(moduleId, colIndex, index)}
                    onMoveDown={() => handleMoveDown(moduleId, colIndex, index)}
                    isDragging={draggedModuleId === moduleId}
                    isDragOver={dragOverId === moduleId}
                  >

                    <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                       <ModuleComponent
                         moduleId={module.id}
                         config={module.config}
                         onConfigChange={(newConfig) => updateModuleConfig(module.id, newConfig)}
                       />
                    </div>
                  </DashboardModuleWrapper>
                )
              })}
              
              {/* Add / Drop Zone */}
              <button
                onClick={() => setAddingToColumn(colIndex)}
                className={`
                  w-full h-24 rounded-xl border-2 border-dashed transition-all duration-200
                  flex flex-col items-center justify-center gap-2
                  ${
                    dragOverId === `col-${colIndex}`
                      ? 'border-purple-400/50 bg-purple-400/10 text-purple-200'
                      : 'border-white/10 text-white/20 hover:border-purple-400/30 hover:text-purple-400/60 hover:bg-white/5'
                  }
                `}
              >
                <Plus className="w-6 h-6" />
                <span className="text-sm font-medium">Tap to add</span>
              </button>
            </div>
          ))}
        </div>

        {/* Empty State / Loading */}
        {!currentLayout && (
          <div className="text-center py-20">
             <p className="text-white/40">Loading layout...</p>
          </div>
        )}

        <CommandDialog 
          open={addingToColumn !== null} 
          onOpenChange={(open) => !open && setAddingToColumn(null)}
        >
          <CommandInput placeholder="Search modules..." />
          <CommandList>
            <CommandEmpty>No modules found.</CommandEmpty>
            <CommandGroup heading="Available Modules">
              {moduleDefinitions.map((def) => (
                <CommandItem
                  key={def.type}
                  onSelect={() => {
                    if (addingToColumn !== null) {
                      addModule(def.type, addingToColumn, columnCount)
                      setAddingToColumn(null)
                    }
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{def.name}</span>
                    <span className="text-xs text-muted-foreground">{def.description}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </div>
  )
}

