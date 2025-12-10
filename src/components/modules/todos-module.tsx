// src/components/modules/todos-module.tsx

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type MouseEvent,
} from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import { CheckSquare, PlusCircle, Calendar as CalendarIcon, Trash2, Pencil } from 'lucide-react'
import { EntityPills } from "./entity-pills"
import { MentionEditor } from "../mentions/mention-editor"
import { MentionInput } from "../mentions/mention-input"
import { ModuleFilter } from "./module-filter"
import { ModuleSort } from "./module-sort"
import type { ModuleProps } from '@/types/dashboard-types'
import { PRIORITY_LABEL } from '@/hooks/use-mentions'

// Local type for parsed todo
type ParsedTodoMeta = {
  title: string
  description: string
}

// Component to render todo description with interactive checkboxes
function TodoDescription({
  html,
  onUpdate,
  className,
}: {
  html: string
  onUpdate: (newHtml: string) => void
  className?: string
}) {
  const handleClick = (
    e: MouseEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLElement

    // Check if clicked element is a checkbox input within a task list
    if (
      target.tagName === 'INPUT' &&
      target.getAttribute('type') === 'checkbox' &&
      target.closest('[data-type="taskItem"]')
    ) {
      e.preventDefault()

      // Create a temporary container to parse and modify the HTML
      const container = document.createElement('div')
      container.innerHTML = html

      // Find all checkboxes to determine which one was clicked
      const checkboxes = container.querySelectorAll(
        '[data-type="taskItem"] input[type="checkbox"]',
      )
      const renderedCheckboxes = (
        e.currentTarget as HTMLDivElement
      ).querySelectorAll('[data-type="taskItem"] input[type="checkbox"]')

      // Find the index of the clicked checkbox
      let clickedIndex = -1
      renderedCheckboxes.forEach((cb, idx) => {
        if (cb === target) {
          clickedIndex = idx
        }
      })

      if (clickedIndex >= 0 && checkboxes[clickedIndex]) {
        const checkbox = checkboxes[clickedIndex] as HTMLInputElement
        const taskItem = checkbox.closest('[data-type="taskItem"]')

        // Toggle the checked state
        const isCurrentlyChecked = checkbox.hasAttribute('checked')

        if (isCurrentlyChecked) {
          checkbox.removeAttribute('checked')
          taskItem?.setAttribute('data-checked', 'false')
        } else {
          checkbox.setAttribute('checked', 'checked')
          taskItem?.setAttribute('data-checked', 'true')
        }

        onUpdate(container.innerHTML)
      }
    }
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick(e as unknown as MouseEvent<HTMLDivElement>)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function TodosModule(props: ModuleProps) {
  const trpc = useTRPC()

  const [filterJars, setFilterJars] = useState<string[]>(
    (props.config?.filters as any)?.jarIds ?? []
  )
  const [filterTags, setFilterTags] = useState<string[]>(
    (props.config?.filters as any)?.tagIds ?? []
  )
  const [filterPriorities, setFilterPriorities] = useState<string[]>(
    (props.config?.filters as any)?.priorities ?? []
  )
  const [filterSort, setFilterSort] = useState<string>(
    (props.config?.filters as any)?.orderBy ?? 'created_desc'
  )
  const [dueDate, setDueDate] = useState<string>('')

  // Persist filters
  useEffect(() => {
    const newFilters = {
      jarIds: filterJars,
      tagIds: filterTags,
      priorities: filterPriorities,
      orderBy: filterSort,
    }
    const currentFilters = (props.config?.filters as any)

    if (JSON.stringify(newFilters) !== JSON.stringify(currentFilters)) {
      props.onConfigChange?.({
        filters: newFilters
      })
    }
  }, [filterJars, filterTags, filterPriorities, filterSort, props.onConfigChange, props.config])

    const getSort = (sortKey: string) => {
      switch (sortKey) {
        case 'created_asc': return [{ field: 'createdAt' as const, direction: 'asc' as const }];
        case 'due_asc': return [{ field: 'dueDate' as const, direction: 'asc' as const, nulls: 'last' as const }];
        case 'due_desc': return [{ field: 'dueDate' as const, direction: 'desc' as const, nulls: 'last' as const }];
        case 'priority_desc': return [{ field: 'priority' as const, direction: 'desc' as const }];
        case 'created_desc': default: return [{ field: 'createdAt' as const, direction: 'desc' as const }];
      }
    }

    const { data: todos, refetch } = useQuery(
    trpc.todos.list.queryOptions({
      filter: {
        jarIdsAny: filterJars.length > 0 ? filterJars : undefined,
        tagIdsAny: filterTags.length > 0 ? filterTags : undefined,
        priorityIn: filterPriorities.length > 0 ? (filterPriorities as any) : undefined,
      },
      sort: getSort(filterSort) as any,
      pagination: { take: 100 },
    }),
  )
  const { data: jars } = useQuery(trpc.jars.list.queryOptions())
  const { data: tags } = useQuery(trpc.tags.list.queryOptions())

  const [title, setTitle] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)


	// Mention state - REMOVED

	// Form State
  const [showCompleted, setShowCompleted] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const titleRef = useRef<HTMLInputElement | null>(null)

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      resetForm()
      
      // Re-focus on title input for smooth consecutive todo entry
      requestAnimationFrame(() => {
        titleRef.current?.focus()
      })
    },
  })

  const { mutate: updateTodo } = useMutation({
    ...trpc.todos.update.mutationOptions(),
    onSuccess: () => {
      refetch()
      if (editingId) resetForm()
    },
  })

  const { mutate: deleteTodo } = useMutation({
    ...trpc.todos.delete.mutationOptions(),
    onSuccess: () => {
      refetch()
    },
  })

  const resetForm = useCallback(() => {
    setTitle('')
    setDescriptionHtml('')
    setDescriptionText('')
    setDueDate('')
    setEditorKey((k) => k + 1)
    setEditingId(null)
  }, [])

  const submitTodo = () => {
    if (!title.trim()) return

    // Placeholder for actual parsing logic
    const parsed: ParsedTodoMeta = {
      title: title,
      description: descriptionText,
    }
    if (!parsed.title) return

    if (editingId) {
       updateTodo({
         id: editingId,
         title: parsed.title,
         description: descriptionHtml || undefined,
         dueDate: dueDate || undefined,
       })
    } else {
       addTodo({
         title: parsed.title,
         description: descriptionHtml || undefined,
         dueDate: dueDate || undefined,
       })
    }
  }

  const handleEdit = useCallback((todo: NonNullable<typeof todos>[number]) => {
    setEditingId(todo.id)
    setTitle(todo.title)
    setDescriptionHtml(todo.description || '')
    setDueDate(todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : '')
    setEditorKey((k) => k + 1)
    setShowAddForm(true)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Add Todo Toggle Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm)
            if (showAddForm) resetForm()
          }}
          className="flex items-center gap-2 text-white/70 hover:text-purple-400 transition-colors text-sm self-start group"
        >
           <PlusCircle className={`w-5 h-5 transition-transform duration-300 ${showAddForm ? 'rotate-45' : ''}`} />
           <span className="font-medium">
             {showAddForm ? 'Hide' : editingId ? 'Edit Todo' : 'Add New Todo'}
           </span>
        </button>

        <div className="flex items-center gap-2">
          <ModuleSort
            options={[
              { label: 'Newest First', value: 'created_desc' },
              { label: 'Oldest First', value: 'created_asc' },
              { label: 'Due Soonest', value: 'due_asc' },
              { label: 'Due Latest', value: 'due_desc' },
              { label: 'Highest Priority', value: 'priority_desc' },
            ]}
            value={filterSort}
            onSortChange={setFilterSort}
          />
          <ModuleFilter
            jars={jars ?? []}
            tags={tags ?? []}
            selectedJarIds={filterJars}
            selectedTagIds={filterTags}
            selectedPriorities={filterPriorities}
            onFilterChange={({ jarIds, tagIds, priorities }) => {
              setFilterJars(jarIds)
              setFilterTags(tagIds)
              setFilterPriorities(priorities)
            }}
          />
        </div>
      </div>

      {/* Add/Edit Todo Form */}
      {showAddForm && (
        <div className="flex flex-col gap-2 relative animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex gap-2">
             <div className="flex-1">
                <MentionInput
                  value={title}
                  onChange={(val) => {
                    setTitle(val)
                  }}
                  jars={jars ?? []}
                  tags={tags ?? []}
                  enablePriority
                  placeholder="Add a todo... use @jar, #tag, !priority"
                  className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitTodo()
                    }
                  }}
                />
             </div>
             <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-3 py-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all w-40" 
             />
          </div>
          <div>
            <MentionEditor
              key={editorKey}
              ref={null}
              jars={jars ?? []}
              tags={tags ?? []}
              enablePriority
              initialContent={descriptionHtml}
              showToolbar={false}
              onHTMLChange={(html) => setDescriptionHtml(html)}
              onTextChange={(text) => setDescriptionText(text)}
              placeholder="Add details / description..."
              className="min-h-[80px] bg-white/5 border border-white/10 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-purple-400/50 transition-all"
            />
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
               <button
                 onClick={resetForm}
                 className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white/70 rounded-lg text-sm font-medium transition-colors"
               >
                 Cancel
               </button>
            )}
            <button
              onClick={submitTodo}
              disabled={!title.trim()}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {editingId ? 'Update Todo' : 'Add Todo'}
            </button>
          </div>
        </div>
      )}

      {/* Todo List */}
      <div className="flex flex-col gap-2">
        {todos?.filter(t => !t.completedAt).map((todo) => {
          const formattedDate = new Date(todo.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          
          const dueDateObj = todo.dueDate ? new Date(todo.dueDate) : null
          const formattedDueDate = dueDateObj ? dueDateObj.toLocaleDateString(undefined, {
             month: 'short',
             day: 'numeric'
          }) : null
          
          const isOverdue = dueDateObj && dueDateObj < new Date() && !todo.completedAt

          return (
            <div
              key={todo.id}
              className="group relative flex flex-col gap-2 p-3 rounded-lg border bg-white/10 border-white/10 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                 {/* No Left Icon requested */}

                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                     {/* Title & Priority */}
                     <div className="flex items-center gap-2 flex-wrap">
                       <span className="font-medium text-sm leading-relaxed text-gray-100">
                         {todo.title}
                       </span>
                       {todo.priority && todo.priority !== 'MEDIUM' && (
                         <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ${
                           todo.priority === 'HIGH' || todo.priority === 'VERY_HIGH' ? 'text-orange-400 border-orange-400/30' : 
                           todo.priority === 'LOW' || todo.priority === 'VERY_LOW' ? 'text-blue-400 border-blue-400/30' : 'text-white/50'
                         }`}>
                           {PRIORITY_LABEL[todo.priority]}
                         </span>
                       )}
                     </div>
                  </div>

                  {/* Description */}
                  {todo.description && (
                    <TodoDescription 
                      html={todo.description} 
                      onUpdate={(newHtml) => updateTodo({ id: todo.id, description: newHtml })}
                      className="text-sm text-white/70 prose prose-sm prose-invert max-w-none"
                    />
                  )}

                  {/* Pills */}
                  <EntityPills jars={todo.jars} tags={todo.tags} />

                  {/* Footer Row: Date & Actions */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                      {/* Left: Date */}
                      <div className="flex items-center gap-2 text-[10px]">
                       {formattedDueDate && (
                         <span className={`px-1.5 py-0.5 rounded border ${
                           isOverdue ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-white/50'
                         }`}>
                           Due {formattedDueDate}
                         </span>
                       )}
                       <span className="text-white/30">
                         {formattedDate}
                       </span>
                     </div>

                      {/* Right: Actions */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateTodo({ id: todo.id, completedAt: new Date() })}
                          className="p-1.5 text-white/40 hover:text-green-400 hover:bg-green-400/10 rounded transition-all"
                          title="Mark as done"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(todo)}
                          className="p-1.5 text-white/40 hover:text-purple-400 hover:bg-purple-400/10 rounded transition-all"
                          title="Edit todo"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                             if (confirm('Delete this todo?')) deleteTodo({ id: todo.id })
                          }}
                          className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                          title="Delete todo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Completed tasks section */}
      {todos?.some((t) => t.completedAt) && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm"
          >
             {/* Simple Caret or similar */}
            <svg
              className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span>Completed ({todos.filter((t) => t.completedAt).length})</span>
          </button>

          {showCompleted && (
            <div className="flex flex-col gap-2 mt-2">
              {todos
                .filter((t) => t.completedAt)
                .map((todo) => {
                  const formattedDate = new Date(todo.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                  
                  return (
                  <div
                    key={todo.id}
                    className="group relative flex flex-col gap-2 p-3 rounded-lg border bg-white/5 border-white/5 opacity-70 hover:opacity-100 transition-all duration-300"
                  >
                     <div className="flex items-start gap-4">
                        {/* No Left Icon */}
                        
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                           <div className="flex justify-between items-start">
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className="font-medium text-sm leading-relaxed text-white/50 line-through">
                                 {todo.title}
                               </span>
                             </div>
                           </div>

                           {todo.description && (
                             <div 
                               className="text-sm text-white/40 prose prose-sm prose-invert max-w-none line-through"
                               dangerouslySetInnerHTML={{ __html: todo.description }}
                             />
                           )}
                           
                           {/* Footer Row: Date & Actions */}
                           <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                              {/* Left: Date */}
                              <div className="flex items-center gap-2 text-[10px] text-white/30">
                                <span>{formattedDate}</span>
                              </div>

                              {/* Right: Actions */}
                              <div className="flex gap-1">
                                <button
                                  onClick={() => updateTodo({ id: todo.id, completedAt: null })}
                                  className="p-1.5 text-green-400/50 hover:text-green-400 hover:bg-green-400/10 rounded transition-all"
                                  title="Mark as not done"
                                >
                                  <CheckSquare className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                     if (confirm('Delete this todo?')) deleteTodo({ id: todo.id })
                                  }}
                                  className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                                  title="Delete todo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                )})}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
