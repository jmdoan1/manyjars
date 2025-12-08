import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/demo/trpc-todo')({
  component: TRPCTodos,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.todos.list.queryOptions(),
    )
  },
})

function parseCommaList(value: string): string[] | undefined {
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return parts.length ? parts : undefined
}

function TRPCTodos() {
  const trpc = useTRPC()

  const { data, refetch } = useQuery(trpc.todos.list.queryOptions())

  const [todo, setTodo] = useState('')
  const [jarsInput, setJarsInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [priority, setPriority] = useState<string>('')

  const { mutate: addTodo } = useMutation({
    ...trpc.todos.add.mutationOptions(),
    onSuccess: () => {
      refetch()
      setTodo('')
      setJarsInput('')
      setTagsInput('')
      setPriority('')
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

  const submitTodo = useCallback(() => {
    if (!todo.trim()) return

    addTodo({
      title: todo.trim(),
      jars: parseCommaList(jarsInput),
      tags: parseCommaList(tagsInput),
      priority: priority ? Number(priority) : undefined,
    })
  }, [addTodo, todo, jarsInput, tagsInput, priority])

  return (
    <div
      className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-white"
      style={{
        backgroundImage:
          'radial-gradient(50% 50% at 95% 5%, #4a90c2 0%, #317eb9 50%, #1e4d72 100%)',
      }}
    >
      <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
        <h1 className="text-2xl mb-4">tRPC Todos (ManyJars)</h1>

        <ul className="mb-4 space-y-2">
          {data?.map((t) => (
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

        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={todo}
            onChange={(e) => setTodo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                submitTodo()
              }
            }}
            placeholder="Enter a new todo..."
            className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />

          <input
            type="text"
            value={jarsInput}
            onChange={(e) => setJarsInput(e.target.value)}
            placeholder="Jars (comma separated, e.g. work, deep-focus)"
            className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-transparent"
          />

          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags (comma separated, e.g. today, quick)"
            className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-transparent"
          />

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
            disabled={todo.trim().length === 0}
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