// src/hooks/use-dashboard.ts

import { useCallback, useEffect, useState } from 'react'
import type {
  DashboardLayout,
  ModuleDefinition,
} from '@/types/dashboard-types'

const STORAGE_KEY = 'manyjar-dashboard-layout'
const LAYOUT_VERSION = 1

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

  // Return default layout with all registered modules
  return {
    version: LAYOUT_VERSION,
    modules: moduleDefinitions.map((def, index) => ({
      id: `${def.type}-${Date.now()}-${index}`,
      type: def.type,
      position: {
        x: 0,
        y: index,
      },
      size: def.defaultSize,
      visible: true,
    })),
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

  const updateModulePosition = useCallback(
    (moduleId: string, position: { x: number; y: number }) => {
      setLayout((prev) => ({
        ...prev,
        modules: prev.modules.map((module) =>
          module.id === moduleId ? { ...module, position } : module,
        ),
      }))
    },
    [],
  )

  const updateModuleSize = useCallback(
    (moduleId: string, size: { width: number; height: number }) => {
      setLayout((prev) => ({
        ...prev,
        modules: prev.modules.map((module) =>
          module.id === moduleId ? { ...module, size } : module,
        ),
      }))
    },
    [],
  )

  const toggleModuleVisibility = useCallback((moduleId: string) => {
    setLayout((prev) => ({
      ...prev,
      modules: prev.modules.map((module) =>
        module.id === moduleId
          ? { ...module, visible: !module.visible }
          : module,
      ),
    }))
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

  const reorderModules = useCallback((fromIndex: number, toIndex: number) => {
    setLayout((prev) => {
      const newModules = [...prev.modules]
      const [removed] = newModules.splice(fromIndex, 1)
      newModules.splice(toIndex, 0, removed)

      // Update positions to reflect new order
      return {
        ...prev,
        modules: newModules.map((module, index) => ({
          ...module,
          position: { ...module.position, y: index },
        })),
      }
    })
  }, [])

  const resetLayout = useCallback(() => {
    const defaultLayout = {
      version: LAYOUT_VERSION,
      modules: moduleDefinitions.map((def, index) => ({
        id: `${def.type}-${Date.now()}-${index}`,
        type: def.type,
        position: {
          x: 0,
          y: index,
        },
        size: def.defaultSize,
        visible: true,
      })),
    }
    setLayout(defaultLayout)
  }, [moduleDefinitions])

  return {
    layout,
    modules: layout.modules,
    updateModulePosition,
    updateModuleSize,
    toggleModuleVisibility,
    updateModuleConfig,
    reorderModules,
    resetLayout,
  }
}
