// src/routes/demo/trpc-todo.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import getCaretCoordinates from 'textarea-caret'
import { NovelEditor, type NovelEditorHandle } from '@/components/novel-editor'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  getActiveMention,
  parseMentions,
  stripPriorityTokens,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  type ActiveMention,
  type MentionPosition,
  type PriorityCode,
  type PriorityOption,
} from '@/hooks/use-mentions'

// Local type for parsed todo
type ParsedTodoMeta = {
  title: string
  description: string
  jars: string[]
  tags: string[]
  priority?: PriorityCode
}

function parseTodoText(title: string, description: string): ParsedTodoMeta {
  const combinedText = `${title} ${description}`
  const { jars, tags, priority } = parseMentions(combinedText)

  return {
    title: stripPriorityTokens(title),
    description: stripPriorityTokens(description),
    jars,
    tags,
    priority,
  }
}

export const Route = createFileRoute('/demo/trpc-todo')({
  component: TRPCTodos,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.todos.list.queryOptions(),
    )
    await context.queryClient.prefetchQuery(
      context.trpc.jars.list.queryOptions(),
    )
    await context.queryClient.prefetchQuery(
      context.trpc.tags.list.queryOptions(),
    )
  },
})

function TRPCTodos() {
  const trpc = useTRPC()

  const { data: todos, refetch } = useQuery(
    trpc.todos.list.queryOptions(),
  )
  const { data: jars } = useQuery(trpc.jars.list.queryOptions())
  const { data: tags } = useQuery(trpc.tags.list.queryOptions())

  const [title, setTitle] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [activeField, setActiveField] = useState<'title' | 'description'>('title')
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null)
  const [descMention, setDescMention] = useState<ActiveMention | null>(null)
  const [descMentionPos, setDescMentionPos] = useState<MentionPosition | null>(null)
  const [mentionPos, setMentionPos] = useState<MentionPosition | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [showCompleted, setShowCompleted] = useState(false)

  const titleRef = useRef<HTMLInputElement | null>(null)
  const descEditorRef = useRef<NovelEditorHandle | null>(null)

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      setTitle('')
      setDescriptionHtml('')
      setDescriptionText('')
      setEditorKey(k => k + 1)
      setActiveMention(null)
      setDescMention(null)
      setMentionPos(null)
      setHighlightedIndex(-1)
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

  const updateMentionState = useCallback(() => {
    const el = titleRef.current
    if (!el) return

    const value = el.value
    const caret = el.selectionStart ?? value.length

    const mention = getActiveMention(value, caret)
    setActiveMention(mention)

    if (!mention) {
      setMentionPos(null)
      return
    }

    const coords = getCaretCoordinates(el, caret)

    setMentionPos({
      top: coords.top + 20,
      left: coords.left,
    })
  }, [])

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
      setActiveField('title')
      requestAnimationFrame(() => updateMentionState())
    },
    [updateMentionState],
  )

  const handleTitleSelect = useCallback(() => {
    setActiveField('title')
    requestAnimationFrame(() => updateMentionState())
  }, [updateMentionState])

  const handleDescriptionMentionChange = useCallback((mention: ActiveMention | null, position: MentionPosition | null) => {
    setDescMention(mention)
    setDescMentionPos(position)
    setActiveField('description')
    // Reset highlighted index when mention changes
    if (mention) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [])

  const submitTodo = useCallback(() => {
    if (!title.trim()) return

    const parsed = parseTodoText(title, descriptionText)
    if (!parsed.title) return

    addTodo({
      title: parsed.title,
      description: descriptionHtml || undefined,
      jars: parsed.jars.length ? parsed.jars : undefined,
      tags: parsed.tags.length ? parsed.tags : undefined,
      priority: parsed.priority,
    })
  }, [addTodo, title, descriptionHtml, descriptionText])

  const applyMention = useCallback(
    (nameOrToken: string) => {
      if (!activeMention) return

      const prefix =
        activeMention.type === 'jar'
          ? '@'
          : activeMention.type === 'tag'
          ? '#'
          : '!'

      const replacement = `${prefix}${nameOrToken}`

      // Only apply to title field now (description uses rich editor)
      const currentText = title
      const before = currentText.slice(0, activeMention.start)
      const after = currentText.slice(activeMention.end)

      const newText = `${before}${replacement}${after}`

      setTitle(newText)
      setActiveMention(null)
      setMentionPos(null)
      setHighlightedIndex(-1)

      requestAnimationFrame(() => {
        const el = titleRef.current
        if (!el) return
        const pos = before.length + replacement.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [activeMention, title],
  )

  const applyDescriptionMention = useCallback(
    (nameOrToken: string) => {
      if (!descMention) return

      const prefix =
        descMention.type === 'jar'
          ? '@'
          : descMention.type === 'tag'
          ? '#'
          : '!'

      const replacement = `${prefix}${nameOrToken} `

      descEditorRef.current?.replaceText(descMention.start, descMention.end, replacement)
      
      setDescMention(null)
      setDescMentionPos(null)
      setHighlightedIndex(-1)
    },
    [descMention],
  )

  // ----- suggestions -----

  // Use the mention from whichever field is active
  const currentMention = activeField === 'title' ? activeMention : descMention
  const query = currentMention?.query ?? ''

  // Base list for jar/tag suggestions
  const jarOrTagList =
    currentMention?.type === 'jar'
      ? jars ?? []
      : currentMention?.type === 'tag'
      ? tags ?? []
      : []

  let filteredJarOrTag = jarOrTagList
  if (currentMention && currentMention.type !== 'priority') {
    if (query) {
      filteredJarOrTag = filteredJarOrTag.filter((item) =>
        item.name.toLowerCase().startsWith(query.toLowerCase()),
      )
    }
    filteredJarOrTag = filteredJarOrTag.slice(0, 5)
  }

  type Row =
    | {
        kind: 'typed'
        label: string
        description: string
      }
    | {
        kind: 'suggestion'
        item: (typeof jarOrTagList)[number]
      }
    | {
        kind: 'priority'
        option: PriorityOption
      }

  const rows: Row[] = useMemo(() => {
    const result: Row[] = []

    if (currentMention) {
      if (currentMention.type === 'priority') {
        const q = query.toLowerCase()
        let opts = PRIORITY_OPTIONS
        if (q) {
          opts = opts.filter(
            (opt) =>
              opt.label.toLowerCase().includes(q) ||
              opt.token.startsWith(q),
          )
        }
        for (const opt of opts) {
          result.push({ kind: 'priority', option: opt })
        }
      } else {
        // jar/tag: typed option first (if any), then suggestions
        if (query) {
          const prefix =
            currentMention.type === 'jar' ? '@' : '#'
          result.push({
            kind: 'typed',
            label: `${prefix}${query}`,
            description:
              currentMention.type === 'jar'
                ? 'Use this as a new jar'
                : 'Use this as a new tag',
          })
        }
        for (const item of filteredJarOrTag) {
          result.push({ kind: 'suggestion', item })
        }
      }
    }

    return result
  }, [currentMention, query, filteredJarOrTag])

  useEffect(() => {
    if ((activeMention || descMention) && rows.length > 0) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [activeMention, descMention, rows.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const hasRows = rows.length > 0

      if (hasRows) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            if (rows.length === 0) return -1
            const next =
              prev < rows.length - 1 ? prev + 1 : 0
            return next < 0 ? 0 : next
          })
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            if (rows.length === 0) return -1
            const next =
              prev > 0 ? prev - 1 : rows.length - 1
            return next
          })
          return
        }

        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          e.preventDefault()
          const idx =
            highlightedIndex >= 0 ? highlightedIndex : 0
          const row = rows[idx]
          if (!row) return

          if (row.kind === 'typed') {
            // keep what they typed, just close popup
            setActiveMention(null)
            setMentionPos(null)
            setHighlightedIndex(-1)
            return
          }

          if (row.kind === 'suggestion') {
            applyMention(row.item.name)
            return
          }

          if (row.kind === 'priority') {
            applyMention(row.option.token)
            return
          }
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submitTodo()
        return
      }

      if (activeMention && e.key === 'Escape') {
        e.preventDefault()
        setActiveMention(null)
        setMentionPos(null)
        setHighlightedIndex(-1)
      }
    },
    [
      activeMention,
      rows,
      highlightedIndex,
      applyMention,
      submitTodo,
    ],
  )

  const handleDescriptionKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!descMention || rows.length === 0) return false

      if (event.key === 'ArrowDown') {
        setHighlightedIndex((prev) => {
          if (rows.length === 0) return -1
          const next = prev < rows.length - 1 ? prev + 1 : 0
          return next < 0 ? 0 : next
        })
        return true
      }

      if (event.key === 'ArrowUp') {
        setHighlightedIndex((prev) => {
          if (rows.length === 0) return -1
          const next = prev > 0 ? prev - 1 : rows.length - 1
          return next
        })
        return true
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0
        const row = rows[idx]
        if (!row) return false

        if (row.kind === 'typed') {
          // Keep what they typed, just close popup
          setDescMention(null)
          setDescMentionPos(null)
          setHighlightedIndex(-1)
          return true
        }

        if (row.kind === 'suggestion') {
          applyDescriptionMention(row.item.name)
          return true
        }

        if (row.kind === 'priority') {
          applyDescriptionMention(row.option.token)
          return true
        }
      }

      if (event.key === 'Escape') {
        setDescMention(null)
        setDescMentionPos(null)
        setHighlightedIndex(-1)
        return true
      }

      return false
    },
    [descMention, rows, highlightedIndex, applyDescriptionMention],
  )

  return (
    <div
      className="flex-1 flex items-center justify-center bg-linear-to-br from-purple-100 to-blue-100 p-4 text-white"
      style={{
        backgroundImage:
          'radial-gradient(50% 50% at 95% 5%, #4a90c2 0%, #317eb9 50%, #1e4d72 100%)',
      }}
    >
      <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
        <h1 className="text-2xl mb-4">ManyJars Todos</h1>

        <div className="flex flex-col gap-2 relative">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={handleTitleChange}
            onSelect={handleTitleSelect}
            onKeyDown={handleKeyDown}
            onFocus={() => setActiveField('title')}
            placeholder="Title... use @jar, #tag, !priority"
            className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <div>
            <NovelEditor
              ref={descEditorRef}
              editorKey={editorKey}
              onHTMLChange={setDescriptionHtml}
              onTextChange={setDescriptionText}
              onMentionChange={handleDescriptionMentionChange}
              onKeyDown={handleDescriptionKeyDown}
              className="w-full"
              editorClassName="focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Mention popup for title field */}
          {activeField === 'title' &&
            activeMention &&
            mentionPos &&
            rows.length > 0 && (
              <div
                className="absolute z-20 w-72"
                style={{
                  top: mentionPos.top,
                  left: mentionPos.left,
                }}
              >
                <Command className="rounded-md border border-white/20 bg-black/95 text-sm text-white shadow-lg">
                  <CommandList>
                    <CommandEmpty className="px-3 py-2 text-xs text-white/60">
                      No matches.
                    </CommandEmpty>
                    <CommandGroup>
                      {rows.map((row, index) => {
                        const isActive =
                          index === highlightedIndex

                        if (row.kind === 'typed') {
                          return (
                            <CommandItem
                              key="typed-option"
                              value={row.label}
                              onSelect={() => {
                                setActiveMention(null)
                                setMentionPos(null)
                                setHighlightedIndex(-1)
                              }}
                              className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                                isActive
                                  ? 'bg-white/20'
                                  : ''
                              }`}
                            >
                              <span className="text-white">
                                {row.label}
                              </span>
                              <span className="text-[11px] text-white/60">
                                {row.description}
                              </span>
                            </CommandItem>
                          )
                        }

                        if (row.kind === 'priority') {
                          return (
                            <CommandItem
                              key={row.option.code}
                              value={row.option.token}
                              onSelect={() =>
                                applyMention(row.option.token)
                              }
                              onMouseEnter={() =>
                                setHighlightedIndex(index)
                              }
                              className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                                isActive
                                  ? 'bg-white/20'
                                  : ''
                              }`}
                            >
                              <span className="text-white">
                                !{row.option.token}
                              </span>
                              <span className="text-[11px] text-white/60">
                                {row.option.label} —{' '}
                                {row.option.description}
                              </span>
                            </CommandItem>
                          )
                        }

                        // suggestion (jar/tag)
                        return (
                          <CommandItem
                            key={row.item.id}
                            value={row.item.name}
                            onSelect={() =>
                              applyMention(row.item.name)
                            }
                            onMouseEnter={() =>
                              setHighlightedIndex(index)
                            }
                            data-selected={false}
                            className={`flex items-center gap-2 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                              isActive ? 'bg-white/20' : ''
                            } text-white`}
                          >
                            <span>
                              {currentMention?.type === 'jar'
                                ? '@'
                                : '#'}
                              {row.item.name}
                            </span>
                            {row.item.description && (
                              <span className="ml-2 text-[11px] text-white/60">
                                {row.item.description}
                              </span>
                            )}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            )}

          {/* Mention popup for description field - positioned at cursor */}
          {activeField === 'description' &&
            descMention &&
            descMentionPos &&
            rows.length > 0 && (
              <div
                className="absolute z-20 w-72"
                style={{
                  top: descMentionPos.top + 60, // Offset for title input + some padding
                  left: descMentionPos.left,
                }}
              >
                <Command className="rounded-md border border-white/20 bg-black/95 text-sm text-white shadow-lg">
                  <CommandList>
                    <CommandEmpty className="px-3 py-2 text-xs text-white/60">
                      No matches.
                    </CommandEmpty>
                    <CommandGroup>
                      {rows.map((row, index) => {
                        const isActive = index === highlightedIndex

                        if (row.kind === 'typed') {
                          return (
                            <CommandItem
                              key="typed-option"
                              value={row.label}
                              onSelect={() => {
                                setDescMention(null)
                                setDescMentionPos(null)
                                setHighlightedIndex(-1)
                              }}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                                isActive ? 'bg-white/20' : ''
                              }`}
                            >
                              <span className="text-white">{row.label}</span>
                              <span className="text-[11px] text-white/60">
                                {row.description}
                              </span>
                            </CommandItem>
                          )
                        }

                        if (row.kind === 'priority') {
                          return (
                            <CommandItem
                              key={row.option.code}
                              value={row.option.token}
                              onSelect={() => applyDescriptionMention(row.option.token)}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                                isActive ? 'bg-white/20' : ''
                              }`}
                            >
                              <span className="text-white">!{row.option.token}</span>
                              <span className="text-[11px] text-white/60">
                                {row.option.label} — {row.option.description}
                              </span>
                            </CommandItem>
                          )
                        }

                        // suggestion (jar/tag)
                        return (
                          <CommandItem
                            key={row.item.id}
                            value={row.item.name}
                            onSelect={() => applyDescriptionMention(row.item.name)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            data-selected={false}
                            className={`flex items-center gap-2 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                              isActive ? 'bg-white/20' : ''
                            } text-white`}
                          >
                            <span>
                              {descMention?.type === 'jar' ? '@' : '#'}
                              {row.item.name}
                            </span>
                            {row.item.description && (
                              <span className="ml-2 text-[11px] text-white/60">
                                {row.item.description}
                              </span>
                            )}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            )}

          <button
            disabled={title.trim().length === 0}
            onClick={submitTodo}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Add todo
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {todos?.filter(t => !t.completedAt).map((t) => (
            <li
              key={t.id}
              className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-sm shadow-md flex flex-col gap-2"
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
                    className="h-4 w-4"
                  />
                  <span
                    className={`text-lg text-white ${
                      t.completedAt ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {t.title}
                  </span>
                </div>

                <button
                  onClick={() => deleteTodo({ id: t.id })}
                  className="text-xs px-2 py-1 rounded bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/40"
                >
                  Delete
                </button>
              </div>

              {t.description && (
                <div 
                  className="text-sm text-white/70 ml-6 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2"
                  dangerouslySetInnerHTML={{ __html: t.description }}
                />
              )}

              <div className="flex flex-wrap gap-2 text-xs text-white/80">
                {t.jars?.map((j) => (
                  <span
                    key={j.id}
                    className="inline-flex items-center gap-1 rounded-full bg-purple-500/40 px-2 py-0.5 border border-purple-300/40 text-purple-50"
                  >
                    <span className="text-[10px]">@</span>
                    <span>{j.name}</span>
                  </span>
                ))}

                {t.tags?.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/40 px-2 py-0.5 border border-emerald-300/40 text-emerald-50"
                  >
                    <span className="text-[10px]">#</span>
                    <span>{tag.name}</span>
                  </span>
                ))}

                {t.priority && (
                  <span
                    className={
                      t.priority === 'VERY_HIGH'
                        ? 'inline-flex items-center gap-1 rounded-full bg-fuchsia-500/40 border border-fuchsia-300/40 px-2 py-0.5 text-fuchsia-50'
                        : t.priority === 'HIGH'
                        ? 'inline-flex items-center gap-1 rounded-full bg-rose-500/40 border border-rose-300/40 px-2 py-0.5 text-rose-50'
                        : t.priority === 'MEDIUM'
                        ? 'inline-flex items-center gap-1 rounded-full bg-amber-500/40 border border-amber-300/40 px-2 py-0.5 text-amber-50'
                        : t.priority === 'LOW'
                        ? 'inline-flex items-center gap-1 rounded-full bg-sky-500/40 border border-sky-300/40 px-2 py-0.5 text-sky-50'
                        : 'inline-flex items-center gap-1 rounded-full bg-slate-500/40 border border-slate-300/40 px-2 py-0.5 text-slate-50'
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
        {todos?.some(t => t.completedAt) && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Completed ({todos.filter(t => t.completedAt).length})</span>
            </button>

            {showCompleted && (
              <ul className="mt-2 space-y-2">
                {todos.filter(t => t.completedAt).map((t) => (
                  <li
                    key={t.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3 backdrop-blur-sm shadow-md flex flex-col gap-2 opacity-70"
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
                          className="h-4 w-4"
                        />
                        <span className="text-lg text-white line-through opacity-70">
                          {t.title}
                        </span>
                      </div>

                      <button
                        onClick={() => deleteTodo({ id: t.id })}
                        className="text-xs px-2 py-1 rounded bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/40"
                      >
                        Delete
                      </button>
                    </div>

                    {t.description && (
                      <div 
                        className="text-sm text-white/50 ml-6 line-through prose prose-sm prose-invert max-w-none opacity-50 prose-p:my-1 prose-headings:my-2"
                        dangerouslySetInnerHTML={{ __html: t.description }}
                      />
                    )}

                    <div className="flex flex-wrap gap-2 text-xs text-white/80">
                      {t.jars?.map((j) => (
                        <span
                          key={j.id}
                          className="inline-flex items-center gap-1 rounded-full bg-purple-500/40 px-2 py-0.5 border border-purple-300/40 text-purple-50"
                        >
                          <span className="text-[10px]">@</span>
                          <span>{j.name}</span>
                        </span>
                      ))}

                      {t.tags?.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/40 px-2 py-0.5 border border-emerald-300/40 text-emerald-50"
                        >
                          <span className="text-[10px]">#</span>
                          <span>{tag.name}</span>
                        </span>
                      ))}

                      {t.priority && (
                        <span
                          className={
                            t.priority === 'VERY_HIGH'
                              ? 'inline-flex items-center gap-1 rounded-full bg-fuchsia-500/40 border border-fuchsia-300/40 px-2 py-0.5 text-fuchsia-50'
                              : t.priority === 'HIGH'
                              ? 'inline-flex items-center gap-1 rounded-full bg-rose-500/40 border border-rose-300/40 px-2 py-0.5 text-rose-50'
                              : t.priority === 'MEDIUM'
                              ? 'inline-flex items-center gap-1 rounded-full bg-amber-500/40 border border-amber-300/40 px-2 py-0.5 text-amber-50'
                              : t.priority === 'LOW'
                              ? 'inline-flex items-center gap-1 rounded-full bg-sky-500/40 border border-sky-300/40 px-2 py-0.5 text-sky-50'
                              : 'inline-flex items-center gap-1 rounded-full bg-slate-500/40 border border-slate-300/40 px-2 py-0.5 text-slate-50'
                          }
                        >
                          <span>!{PRIORITY_LABEL[t.priority as PriorityCode]}</span>
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
    </div>
  )
}