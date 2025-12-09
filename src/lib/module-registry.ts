// src/lib/module-registry.ts

import { CheckSquare } from 'lucide-react'
import { TodosModule } from '@/components/modules/todos-module'
import type { ModuleDefinition } from '@/types/dashboard-types'

/**
 * Registry of all available dashboard modules
 */
export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    type: 'todos',
    name: 'Todos',
    description: 'Manage your tasks with jars, tags, and priorities',
    icon: CheckSquare,
    component: TodosModule,
    defaultSize: {
      width: 1,
      height: 1,
    },
  },
]
