// src/routes/demo/trpc-todo.tsx

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import getCaretCoordinates from 'textarea-caret'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

type PriorityEnum =
  | 'VERY_LOW'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'VERY_HIGH'

type ParsedTodoMeta = {
  title: string
  jars: string[]
  tags: string[]
  priority?: PriorityEnum
}

type ActiveMention =
  | {
      type: 'jar' | 'tag' | 'priority'
      query: string
      start: number
      end: number
    }
  | null

type MentionPosition = {
  top: number
  left: number
} | null

type PriorityOption = {
  code: PriorityEnum
  token: string
  label: string
  description: string
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  {
    code: 'VERY_LOW',
    token: 'very-low',
    label: 'Very low',
    description: 'Lowest urgency',
  },
  {
    code: 'LOW',
    token: 'low',
    label: 'Low',
    description: 'Nice to do',
  },
  {
    code: 'MEDIUM',
    token: 'medium',
    label: 'Medium',
    description: 'Default priority',
  },
  {
    code: 'HIGH',
    token: 'high',
    label: 'High',
    description: 'Important soon',
  },
  {
    code: 'VERY_HIGH',
    token: 'very-high',
    label: 'Very high',
    description: 'Top of your stack',
  },
]

const PRIORITY_TOKEN_MAP: Record<string, PriorityEnum> = {
  'very-low': 'VERY_LOW',
  vlow: 'VERY_LOW',
  vl: 'VERY_LOW',

  low: 'LOW',
  l: 'LOW',

  medium: 'MEDIUM',
  med: 'MEDIUM',
  m: 'MEDIUM',

  high: 'HIGH',
  h: 'HIGH',

  'very-high': 'VERY_HIGH',
  vhigh: 'VERY_HIGH',
  vh: 'VERY_HIGH',
}

const PRIORITY_LABEL: Record<PriorityEnum, string> = {
  VERY_LOW: 'Very low',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  VERY_HIGH: 'Very high',
}

function parseTodoText(text: string): ParsedTodoMeta {
  const jarNames = new Set<string>()
  const tagNames = new Set<string>()

  const jarRegex = /@([a-zA-Z0-9_-]+)/g
  const tagRegex = /#([a-zA-Z0-9_-]+)/g
  const priorityRegex = /!([a-zA-Z-]+)/

  let m: RegExpExecArray | null

  while ((m = jarRegex.exec(text)) !== null) {
    jarNames.add(m[1])
  }
  while ((m = tagRegex.exec(text)) !== null) {
    tagNames.add(m[1])
  }

  let priorityCode: PriorityEnum | undefined
  const pMatch = text.match(priorityRegex)
  if (pMatch) {
    const key = (pMatch[1] ?? '').toLowerCase()
    const mapped = PRIORITY_TOKEN_MAP[key]
    if (mapped) {
      priorityCode = mapped
    }
  }

  // keep @jars and #tags in the title; only strip !priority token
  let clean = text
    .replace(priorityRegex, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: clean,
    jars: Array.from(jarNames),
    tags: Array.from(tagNames),
    priority: priorityCode,
  }
}

function getActiveMention(
  text: string,
  caret: number,
): ActiveMention {
  const beforeCaret = text.slice(0, caret)

  const lastSeparator = Math.max(
    beforeCaret.lastIndexOf(' '),
    beforeCaret.lastIndexOf('\n'),
    beforeCaret.lastIndexOf('\t'),
  )

  const tokenStart = lastSeparator + 1
  const token = beforeCaret.slice(tokenStart)

  if (token.startsWith('@')) {
    return {
      type: 'jar',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  if (token.startsWith('#')) {
    return {
      type: 'tag',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  if (token.startsWith('!')) {
    return {
      type: 'priority',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  return null
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

  const [text, setText] = useState('')
  const [activeMention, setActiveMention] =
    useState<ActiveMention>(null)
  const [mentionPos, setMentionPos] =
    useState<MentionPosition>(null)
  const [highlightedIndex, setHighlightedIndex] =
    useState<number>(-1)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      setText('')
      setActiveMention(null)
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
    const el = textareaRef.current
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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value)
      requestAnimationFrame(updateMentionState)
    },
    [updateMentionState],
  )

  const handleSelect = useCallback(() => {
    requestAnimationFrame(updateMentionState)
  }, [updateMentionState])

  const submitTodo = useCallback(() => {
    if (!text.trim()) return

    const parsed = parseTodoText(text)
    if (!parsed.title) return

    addTodo({
      title: parsed.title,
      jars: parsed.jars.length ? parsed.jars : undefined,
      tags: parsed.tags.length ? parsed.tags : undefined,
      priority: parsed.priority,
    })
  }, [addTodo, text])

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

      const before = text.slice(0, activeMention.start)
      const after = text.slice(activeMention.end)

      const newText = `${before}${replacement}${after}`

      setText(newText)
      setActiveMention(null)
      setMentionPos(null)
      setHighlightedIndex(-1)

      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        const pos = before.length + replacement.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [activeMention, text],
  )

  // ----- suggestions -----

  const query = activeMention?.query ?? ''

  // Base list for jar/tag suggestions
  const jarOrTagList =
    activeMention?.type === 'jar'
      ? jars ?? []
      : activeMention?.type === 'tag'
      ? tags ?? []
      : []

  let filteredJarOrTag = jarOrTagList
  if (activeMention && activeMention.type !== 'priority') {
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

  const rows: Row[] = []

  if (activeMention) {
    if (activeMention.type === 'priority') {
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
        rows.push({ kind: 'priority', option: opt })
      }
    } else {
      // jar/tag: typed option first (if any), then suggestions
      if (query) {
        const prefix =
          activeMention.type === 'jar' ? '@' : '#'
        rows.push({
          kind: 'typed',
          label: `${prefix}${query}`,
          description:
            activeMention.type === 'jar'
              ? 'Use this as a new jar'
              : 'Use this as a new tag',
        })
      }
      for (const item of filteredJarOrTag) {
        rows.push({ kind: 'suggestion', item })
      }
    }
  }

  useEffect(() => {
    if (activeMention && rows.length > 0) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [activeMention, rows.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  return (
    <div
      className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-white"
      style={{
        backgroundImage:
          'radial-gradient(50% 50% at 95% 5%, #4a90c2 0%, #317eb9 50%, #1e4d72 100%)',
      }}
    >
      <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
        <h1 className="text-2xl mb-4">ManyJars Todos</h1>

        <div className="flex flex-col gap-2 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Type a todo... use @jar, #tag, and !low / !high / !medium etc."
            className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y"
          />

          {activeMention &&
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
                              {activeMention?.type === 'jar'
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

          <button
            disabled={text.trim().length === 0}
            onClick={submitTodo}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Add todo
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {todos?.map((t) => (
            <li
              key={t.id}
              className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-sm shadow-md flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={(e) =>
                      updateTodo({
                        id: t.id,
                        completed: e.target.checked,
                      })
                    }
                    className="h-4 w-4"
                  />
                  <span
                    className={`text-lg text-white ${
                      t.completed ? 'line-through opacity-70' : ''
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
                    <span>!{PRIORITY_LABEL[t.priority as PriorityEnum]}</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}