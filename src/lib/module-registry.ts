// src/lib/module-registry.ts

import { CheckSquare, Archive, Hash } from 'lucide-react'
import { TodosModule } from '@/components/modules/todos-module'
import { JarsModule } from '@/components/modules/jars-module'
import { TagsModule } from '@/components/modules/tags-module'
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
  {
    type: 'jars',
    name: 'Jars',
    description: 'Manage your jars with rich descriptions',
    icon: Archive,
    component: JarsModule,
    defaultSize: {
      width: 1,
      height: 1,
    },
  },
  {
    type: 'tags',
    name: 'Tags',
    description: 'Manage your tags with rich descriptions',
    icon: Hash,
    component: TagsModule,
    defaultSize: {
      width: 1,
      height: 1,
    },
  },
]
