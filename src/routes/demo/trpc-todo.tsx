// src/routes/demo/trpc-todo.tsx

import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'

type ActiveMention =
  | {
      type: 'jar' | 'tag'
      query: string
      start: number
      end: number
    }
  | null

function extractJarsAndTags(text: string): {
  jars: string[]
  tags: string[]
} {
  const jarNames = new Set<string>()
  const tagNames = new Set<string>()

  const jarRegex = /@([a-zA-Z0-9_-]+)/g
  const tagRegex = /#([a-zA-Z0-9_-]+)/g

  let m: RegExpExecArray | null

  while ((m = jarRegex.exec(text)) !== null) {
    jarNames.add(m[1])
  }
  while ((m = tagRegex.exec(text)) !== null) {
    tagNames.add(m[1])
  }

  return {
    jars: Array.from(jarNames),
    tags: Array.from(tagNames),
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

  if (token.startsWith('@') && token.length > 1) {
    return {
      type: 'jar',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  if (token.startsWith('#') && token.length > 1) {
    return {
      type: 'tag',
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
  const [priority, setPriority] = useState<string>('')
  const [activeMention, setActiveMention] =
    useState<ActiveMention>(null)

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      setText('')
      setPriority('')
      setActiveMention(null)
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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setText(newText)

      const caret = e.target.selectionStart ?? newText.length
      setActiveMention(getActiveMention(newText, caret))
    },
    [],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submitTodo()
        return
      }

      if (activeMention && e.key === 'Escape') {
        e.preventDefault()
        setActiveMention(null)
      }
    },
    [activeMention, text, priority],
  )

  const submitTodo = useCallback(() => {
    const title = text.trim()
    if (!title) return

    const { jars, tags } = extractJarsAndTags(title)

    addTodo({
      title,
      jars: jars.length ? jars : undefined,
      tags: tags.length ? tags : undefined,
      priority: priority ? Number(priority) : undefined,
    })
  }, [addTodo, text, priority])

  const applyMention = useCallback(
    (name: string) => {
      if (!activeMention) return

      const prefix = activeMention.type === 'jar' ? '@' : '#'
      const replacement = `${prefix}${name}`

      const before = text.slice(0, activeMention.start)
      const after = text.slice(activeMention.end)

      const newText = `${before}${replacement}${after}`

      setText(newText)
      setActiveMention(null)
    },
    [activeMention, text],
  )

  const suggestionList =
    activeMention?.type === 'jar'
      ? (jars ?? [])
      : activeMention?.type === 'tag'
      ? (tags ?? [])
      : []

  const filteredSuggestions =
    activeMention && suggestionList.length
      ? suggestionList.filter((item) =>
          item.name
            .toLowerCase()
            .startsWith(activeMention.query.toLowerCase()),
        )
      : []

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

        <ul className="mb-4 space-y-2">
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
                {t.priority && (
                  <span className="px-2 py-1 rounded bg-blue-500/40">
                    Priority:{' '}
                    {t.priority === 3
                      ? 'High'
                      : t.priority === 2
                      ? 'Medium'
                      : 'Low'}
                  </span>
                )}

                {t.jars?.length > 0 && (
                  <span className="px-2 py-1 rounded bg-purple-500/30">
                    Jars:{' '}
                    {t.jars.map((j) => j.name).join(', ')}
                  </span>
                )}

                {t.tags?.length > 0 && (
                  <span className="px-2 py-1 rounded bg-emerald-500/30">
                    Tags:{' '}
                    {t.tags.map((tag) => tag.name).join(', ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 relative">
          <textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Type a todo... use @jar and #tag in the text"
            className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y"
          />

          {activeMention && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 top-full left-0 w-full max-h-40 overflow-y-auto rounded-lg border border-white/20 bg-black/90 text-sm">
              {filteredSuggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyMention(item.name)}
                  className="w-full text-left px-3 py-2 hover:bg-white/10"
                >
                  {activeMention.type === 'jar' ? '@' : '#'}
                  {item.name}
                  {item.description && (
                    <span className="ml-2 text-xs text-white/60">
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent"
          >
            <option value="">No priority</option>
            <option value="1">Low priority</option>
            <option value="2">Medium priority</option>
            <option value="3">High priority</option>
          </select>

          <button
            disabled={text.trim().length === 0}
            onClick={submitTodo}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Add todo
          </button>
        </div>
      </div>
    </div>
  )
}