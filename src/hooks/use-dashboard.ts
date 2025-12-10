// src/hooks/use-dashboard.ts

import { useCallback, useEffect, useState } from 'react'
import type {
  DashboardLayout,
  ModuleDefinition,
  ColumnLayout,
} from '@/types/dashboard-types'

const STORAGE_KEY = 'manyjar-dashboard-layout'
const LAYOUT_VERSION = 3 // Incremented for masonry layout support

/**
 * Helper to generate a default layout one column
 */
function getDefaultColumnLayout(moduleIds: string[], columnCount: number): ColumnLayout {
  const columns: string[][] = Array.from({ length: columnCount }, () => [])
  
  // Distribute modules evenly across columns
  moduleIds.forEach((id, index) => {
    const columnIndex = index % columnCount
    columns[columnIndex].push(id)
  })

  return { columns }
}

/**
 * Load dashboard layout from localStorage
 */
function loadLayout(
  moduleDefinitions: ModuleDefinition[],
): DashboardLayout {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardLayout
      if (parsed.version === LAYOUT_VERSION) {
        return parsed
      }
    }
  } catch (error) {
    console.warn('Failed to load dashboard layout:', error)
  }

  // default modules
  const modules = moduleDefinitions.map((def, index) => ({
    id: `${def.type}-${Date.now()}-${index}`,
    type: def.type,
    visible: true,
  }))

  return {
    version: LAYOUT_VERSION,
    modules,
    layouts: {}, // innovative lazy initialization? or just init empty
  }
}

/**
 * Save dashboard layout to localStorage
 */
function saveLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch (error) {
    console.warn('Failed to save dashboard layout:', error)
  }
}

export interface UseDashboardOptions {
  moduleDefinitions: ModuleDefinition[]
}

export function useDashboard({ moduleDefinitions }: UseDashboardOptions) {
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    loadLayout(moduleDefinitions),
  )

  // Save layout whenever it changes
  useEffect(() => {
    saveLayout(layout)
  }, [layout])

  /**
   * Ensure layout exists for a given column count
   */
  const ensureLayoutForColumns = useCallback((columnCount: number) => {
    setLayout((prev) => {
      if (prev.layouts[columnCount]) {
        return prev
      }

      // If no layout exists for this column count, create a default one
      // We take all visible modules and distribute them
      const visibleModuleIds = prev.modules
        .filter((m) => m.visible)
        .map((m) => m.id)
      
      const newLayout = getDefaultColumnLayout(visibleModuleIds, columnCount)

      return {
        ...prev,
        layouts: {
          ...prev.layouts,
          [columnCount]: newLayout,
        },
      }
    })
  }, [])

  const moveModule = useCallback(
    (
      moduleId: string,
      fromColIndex: number,
      fromIndex: number,
      toColIndex: number,
      toIndex: number,
      columnCount: number
    ) => {
      setLayout((prev) => {
        const currentLayout = prev.layouts[columnCount]
        if (!currentLayout) return prev

        const newColumns = currentLayout.columns.map((col) => [...col])
        
        // Remove from source
        const sourceCol = newColumns[fromColIndex]
        if (!sourceCol) return prev // sanity check
        
        // Ensure we are moving the correct module
        if (sourceCol[fromIndex] !== moduleId) {
          // Fallback: find where it actually is in this column if index is wrong?
          // For now, assume index is correct or strictly passed
           // Actually, let's verify
           if (sourceCol[fromIndex] !== moduleId) return prev
        }

        sourceCol.splice(fromIndex, 1)

        // Add to destination
        const destCol = newColumns[toColIndex]
        if (!destCol) return prev

        destCol.splice(toIndex, 0, moduleId)

        return {
          ...prev,
          layouts: {
            ...prev.layouts,
            [columnCount]: {
              columns: newColumns,
            },
          },
        }
      })
    },
    [],
  )

  const toggleModuleVisibility = useCallback((moduleId: string) => {
    setLayout((prev) => {
      const isVisible = prev.modules.find((m) => m.id === moduleId)?.visible
      const startVisible = !isVisible // We are toggling

      const newModules = prev.modules.map((module) =>
        module.id === moduleId
          ? { ...module, visible: startVisible }
          : module,
      )

      // If making visible, append to all existing layouts
      // If hiding, remove from all existing layouts
      const newLayouts = { ...prev.layouts }
      Object.keys(newLayouts).forEach((key) => {
        const colCount = Number(key)
        const layoutData = newLayouts[colCount]
        if (!layoutData) return

        const newColumns = layoutData.columns.map((c) => [...c])
        
        if (startVisible) {
          // Append to first column (simplest strategy)
          // Or find the shortest column?
          // Let's stick to first column or least populated for better UX
          let targetColIndex = 0
          let minLen = newColumns[0].length
          
          for(let i=1; i<newColumns.length; i++) {
             if (newColumns[i].length < minLen) {
               minLen = newColumns[i].length
               targetColIndex = i
             }
          }
          newColumns[targetColIndex].push(moduleId)
        } else {
          // Remove from wherever it is
          for(let i=0; i<newColumns.length; i++) {
            newColumns[i] = newColumns[i].filter(id => id !== moduleId)
          }
        }
        newLayouts[colCount] = { columns: newColumns }
      })

      return {
        ...prev,
        modules: newModules,
        layouts: newLayouts,
      }
    })
  }, [])

  const updateModuleConfig = useCallback(
    (moduleId: string, config: Record<string, unknown>) => {
      setLayout((prev) => ({
        ...prev,
        modules: prev.modules.map((module) =>
          module.id === moduleId ? { ...module, config } : module,
        ),
      }))
    },
    [],
  )

  const addModule = useCallback((type: string, targetColIndex: number, columnCount: number) => {
    setLayout((prev) => {
      const newModuleId = `${type}-${Date.now()}`
      const newModule = {
        id: newModuleId,
        type,
        visible: true,
        config: {},
      }

      // Add to modules list
      const newModules = [...prev.modules, newModule]

      // Add to layout
      const currentLayout = prev.layouts[columnCount]
      let newLayouts = { ...prev.layouts }

      if (currentLayout) {
         const newColumns = currentLayout.columns.map((col, index) => {
            if (index === targetColIndex) {
              return [...col, newModuleId]
            }
            return [...col]
         })
         newLayouts[columnCount] = { columns: newColumns }
      }

      return {
        ...prev,
        modules: newModules,
        layouts: newLayouts,
      }
    })
  }, [])

  const removeModule = useCallback((moduleId: string) => {
    setLayout((prev) => {
      // Remove from modules list
      const newModules = prev.modules.filter((m) => m.id !== moduleId)

      // Remove from all layouts
      const newLayouts = { ...prev.layouts }
      Object.keys(newLayouts).forEach((key) => {
        const colCount = Number(key)
        const layoutData = newLayouts[colCount]
        if (!layoutData) return

        const newColumns = layoutData.columns.map((col) =>
          col.filter((id) => id !== moduleId)
        )
        newLayouts[colCount] = { columns: newColumns }
      })

      return {
        ...prev,
        modules: newModules,
        layouts: newLayouts,
      }
    })
  }, [])

  const resetLayout = useCallback(() => {
    const defaultModules = moduleDefinitions.map((def, index) => ({
      id: `${def.type}-${Date.now()}-${index}`,
      type: def.type,
      visible: true,
    }))

    setLayout({
      version: LAYOUT_VERSION,
      modules: defaultModules,
      layouts: {}, // Reset all layouts, they will regenerate as needed
    })
  }, [moduleDefinitions])

  return {
    layout,
    modules: layout.modules,
    toggleModuleVisibility,
    updateModuleConfig,
    resetLayout,
    // New Actions
    ensureLayoutForColumns,
    moveModule,
    addModule, // Export new function
    removeModule,
  }
}
