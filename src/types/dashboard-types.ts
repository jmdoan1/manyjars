// src/types/dashboard-types.ts

import type { ComponentType } from 'react'

/**
 * Position of a module in the dashboard grid
 */
export interface ModulePosition {
  x: number
  y: number
}

/**
 * Size of a module
 */
export interface ModuleSize {
  width: number
  height: number
}

/**
 * Instance of a module in the dashboard
 */
export interface DashboardModule {
  id: string
  type: string
  position: ModulePosition
  size: ModuleSize
  visible: boolean
  config?: Record<string, unknown>
}

/**
 * Definition/blueprint for a module type
 */
export interface ModuleDefinition {
  type: string
  name: string
  description: string
  icon?: ComponentType
  component: ComponentType<ModuleProps>
  defaultSize: ModuleSize
  minSize?: ModuleSize
  maxSize?: ModuleSize
}

/**
 * Props passed to every module component
 */
export interface ModuleProps {
  moduleId: string
  config?: Record<string, unknown>
  onConfigChange?: (config: Record<string, unknown>) => void
}

/**
 * Dashboard layout configuration
 */
export interface DashboardLayout {
  modules: DashboardModule[]
  version: number
}

/**
 * Drag state for module reordering
 */
export interface DragState {
  draggedModuleId: string | null
  dragOverModuleId: string | null
}
