// src/components/modules/todos-module.tsx

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import { PlusCircle } from 'lucide-react'
import { MentionInput } from "../mentions/mention-input"
import { MentionEditor } from "../mentions/mention-editor"
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

export function TodosModule(_props: ModuleProps) {
  const trpc = useTRPC()

  const { data: todos, refetch } = useQuery(trpc.todos.list.queryOptions())
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
    })
  }



  return (
    <div className="flex flex-col gap-4">
      {/* Add Todo Toggle Button */}
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

      {/* Add Todo Form */}
      {showAddForm && (
        <div className="flex flex-col gap-2 relative animate-in slide-in-from-top-2 fade-in duration-300">
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
          <div>
            <MentionEditor
              key={editorKey}
              ref={null}
              jars={jars ?? []}
              tags={tags ?? []}
              enablePriority
              showToolbar={false}
              onHTMLChange={setDescriptionHtml}
              onTextChange={setDescriptionText}
              onSubmit={submitTodo}
              className="w-full"
              editorClassName="focus:ring-2 focus:ring-purple-400/50"
            />
          </div>

          <button
            type="button"
            disabled={title.trim().length === 0}
            onClick={submitTodo}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-purple-500/50 disabled:to-purple-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg shadow-purple-500/20"
          >
            Add Todo
          </button>
        </div>
      )}

      {/* Active Todos */}
      <ul className="space-y-2">
        {todos
          ?.filter((t) => !t.completedAt)
          .map((t) => (
            <li
              key={t.id}
              className="bg-white/5 border border-white/10 rounded-lg p-3 backdrop-blur-sm shadow-md flex flex-col gap-2 hover:border-purple-400/30 transition-all"
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
                  <span
                    className={`text-base text-white ${
                      t.completedAt ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {t.title}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => deleteTodo({ id: t.id })}
                  className="text-xs px-2 py-1 rounded bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/40 transition-colors"
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
                  className="text-sm text-white/70 ml-6 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 **:data-[type=taskItem]:flex **:data-[type=taskItem]:gap-2 **:data-[type=taskItem]:items-start **:data-[type=taskItem]:*:data-[type=taskItemLabel]:flex-1 [&_input[type=checkbox]]:mt-1 [&_input[type=checkbox]]:cursor-pointer"
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
                    <span>!{PRIORITY_LABEL[t.priority as PriorityCode]}</span>
                  </span>
                )}
              </div>
            </li>
          ))}
      </ul>

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
