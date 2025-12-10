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
import { CheckSquare, PlusCircle, Calendar as CalendarIcon, Trash2 } from 'lucide-react'
import { MentionEditor } from "../mentions/mention-editor"
import { MentionInput } from "../mentions/mention-input"
import { ModuleFilter } from "./module-filter"
import { ModuleSort } from "./module-sort"
import type { ModuleProps } from '@/types/dashboard-types'
import { PRIORITY_LABEL, type PriorityCode } from '@/hooks/use-mentions'

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


	// Mention state - REMOVED

	// Form State
  const [showCompleted, setShowCompleted] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const titleRef = useRef<HTMLInputElement | null>(null)

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      setTitle('')
      setDescriptionHtml('')
      setDescriptionText('')
      setDueDate('')
      setEditorKey((k) => k + 1)
      
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
    },
  })

  const { mutate: deleteTodo } = useMutation({
    ...trpc.todos.delete.mutationOptions(),
    onSuccess: () => {
      refetch()
    },
  })

  const submitTodo = () => {
    if (!title.trim()) return

    // Placeholder for actual parsing logic
    const parsed: ParsedTodoMeta = {
      title: title,
      description: descriptionText,
    }
    if (!parsed.title) return

    addTodo({
      title: parsed.title,
      description: descriptionHtml || undefined,
      dueDate: dueDate || undefined,
    })
  }



  return (
    <div className="flex flex-col gap-4">
      {/* Add Todo Toggle Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 text-white/70 hover:text-purple-400 transition-colors text-sm self-start group"
        >
          <PlusCircle className={`w-5 h-5 transition-transform duration-300 ${showAddForm ? 'rotate-45' : ''}`} />
          <span className="font-medium">
            {showAddForm ? 'Hide' : 'Add New Todo'}
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

      {/* Add Todo Form */}
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
          <div className="flex justify-end">
            <button
              onClick={submitTodo}
              disabled={!title.trim()}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add Todo
            </button>
          </div>
        </div>
      )}

      {/* Todo List */}
      <div className="flex flex-col gap-2">
        {todos?.map((todo) => {
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
              className={`group relative flex flex-col gap-2 p-3 rounded-lg border transition-all duration-300 ${
                todo.completedAt
                  ? 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                  : 'bg-white/10 border-white/10 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() =>
                    updateTodo({
                      id: todo.id,
                      completedAt: todo.completedAt ? null : new Date(),
                    })
                  }
                  className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-all duration-300 ${
                    todo.completedAt
                      ? 'bg-green-500/20 border-green-500 text-green-400'
                      : 'border-white/30 hover:border-purple-400 hover:bg-purple-400/10'
                  }`}
                >
                  {todo.completedAt && <CheckSquare className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                     {/* Title & Priority */}
                     <div className="flex items-center gap-2 flex-wrap">
                       <span className={`font-medium text-sm leading-relaxed ${todo.completedAt ? 'line-through text-white/50' : 'text-gray-100'}`}>
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

                     {/* Dates */}
                     <div className="flex items-center gap-2 text-[10px] shrink-0">
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
                  </div>

                  {/* Description */}
                  {todo.description && (
                    <TodoDescription 
                      html={todo.description} 
                      onUpdate={(newHtml) => updateTodo({ id: todo.id, description: newHtml })}
                      className="text-sm text-white/70 prose prose-sm prose-invert max-w-none"
                    />
                  )}
                </div>
              </div>
              
              <button
                onClick={() => {
                   if (confirm('Delete this todo?')) deleteTodo({ id: todo.id })
                }}
                className="absolute top-2 right-2 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
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
            <ul className="mt-2 space-y-2">
              {todos
                .filter((t) => t.completedAt)
                .map((t) => (
                  <li
                    key={t.id}
                    className="bg-white/[0.02] border border-white/5 rounded-lg p-3 backdrop-blur-sm shadow-md flex flex-col gap-2 opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!t.completedAt}
                          onChange={(e) =>
                            updateTodo({
                              id: t.id,
                              completedAt: e.target.checked ? new Date() : null,
                            })
                          }
                          className="h-4 w-4 rounded accent-purple-500"
                        />
                        <span className="text-base text-white line-through opacity-70">
                          {t.title}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteTodo({ id: t.id })}
                        className="text-xs px-2 py-1 rounded bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/40"
                      >
                        Delete
                      </button>
                    </div>

                    {t.description && (
                      <TodoDescription
                        html={t.description}
                        onUpdate={(newHtml) =>
                          updateTodo({ id: t.id, description: newHtml })
                        }
                        className="text-sm text-white/50 ml-6 line-through prose prose-sm prose-invert max-w-none opacity-50 prose-p:my-1 prose-headings:my-2 **:data-[type=taskItem]:flex **:data-[type=taskItem]:gap-2 **:data-[type=taskItem]:items-start **:data-[type=taskItem]:*:data-[type=taskItemLabel]:flex-1 [&_input[type=checkbox]]:mt-1 [&_input[type=checkbox]]:cursor-pointer"
                      />
                    )}

                    <div className="flex flex-wrap gap-2 text-xs text-white/80">
                      {t.jars?.map((j) => (
                        <span
                          key={j.id}
                          className="inline-flex items-center gap-1 rounded-full bg-purple-500/30 px-2 py-0.5 border border-purple-300/30 text-purple-100"
                        >
                          <span className="text-[10px]">@</span>
                          <span>{j.name}</span>
                        </span>
                      ))}

                      {t.tags?.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full bg-teal-500/30 px-2 py-0.5 border border-teal-300/30 text-teal-100"
                        >
                          <span className="text-[10px]">#</span>
                          <span>{tag.name}</span>
                        </span>
                      ))}

                      {t.priority && (
                        <span
                          className={
                            t.priority === 'VERY_HIGH'
                              ? 'inline-flex items-center gap-1 rounded-full bg-fuchsia-500/30 border border-fuchsia-300/30 px-2 py-0.5 text-fuchsia-100'
                              : t.priority === 'HIGH'
                              ? 'inline-flex items-center gap-1 rounded-full bg-rose-500/30 border border-rose-300/30 px-2 py-0.5 text-rose-100'
                              : t.priority === 'MEDIUM'
                              ? 'inline-flex items-center gap-1 rounded-full bg-amber-500/30 border border-amber-300/30 px-2 py-0.5 text-amber-100'
                              : t.priority === 'LOW'
                              ? 'inline-flex items-center gap-1 rounded-full bg-sky-500/30 border border-sky-300/30 px-2 py-0.5 text-sky-100'
                              : 'inline-flex items-center gap-1 rounded-full bg-slate-500/30 border border-slate-300/30 px-2 py-0.5 text-slate-100'
                          }
                        >
                          <span>
                            !{PRIORITY_LABEL[t.priority as PriorityCode]}
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
