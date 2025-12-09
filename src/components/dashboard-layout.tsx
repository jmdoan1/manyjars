// src/components/dashboard-layout.tsx

import { useState } from 'react'
import { DashboardModuleWrapper } from './dashboard-module'
import { useDashboard } from '@/hooks/use-dashboard'
import type { ModuleDefinition } from '@/types/dashboard-types'

export interface DashboardLayoutProps {
  moduleDefinitions: ModuleDefinition[]
}

export function DashboardLayout({ moduleDefinitions }: DashboardLayoutProps) {
  const {
    modules,
    reorderModules,
  } = useDashboard({ moduleDefinitions })

  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null)
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null)

  const handleDragStart = (moduleId: string) => {
    setDraggedModuleId(moduleId)
  }

  const handleDragEnd = () => {
    setDraggedModuleId(null)
    setDragOverModuleId(null)
  }

  const handleDragOver = (moduleId: string) => {
    if (moduleId !== draggedModuleId) {
      setDragOverModuleId(moduleId)
    }
  }

  const handleDrop = (targetModuleId: string) => {
    if (!draggedModuleId || draggedModuleId === targetModuleId) {
      setDragOverModuleId(null)
      return
    }

    const fromIndex = modules.findIndex((m) => m.id === draggedModuleId)
    const toIndex = modules.findIndex((m) => m.id === targetModuleId)

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderModules(fromIndex, toIndex)
    }

    setDragOverModuleId(null)
  }

  // Create a map for quick lookup of module definitions
  const definitionMap = new Map(
    moduleDefinitions.map((def) => [def.type, def]),
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-purple-300 to-teal-400 bg-clip-text text-transparent mb-2">
            ManyJar Dashboard
          </h1>
          <p className="text-white/60 text-lg">
            Your ADHD-friendly productivity hub
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {modules
            .filter((module) => module.visible)
            .map((module) => {
              const definition = definitionMap.get(module.type)
              if (!definition) return null

              const ModuleComponent = definition.component

              return (
                <DashboardModuleWrapper
                  key={module.id}
                  moduleId={module.id}
                  title={definition.name}
                  description={definition.description}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  isDragging={draggedModuleId === module.id}
                  isDragOver={dragOverModuleId === module.id}
                >
                  <ModuleComponent
                    moduleId={module.id}
                    config={module.config}
                  />
                </DashboardModuleWrapper>
              )
            })}
        </div>

        {/* Empty State */}
        {modules.filter((m) => m.visible).length === 0 && (
          <div className="text-center py-20">
            <p className="text-white/40 text-lg">
              No modules available. Add some modules to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
