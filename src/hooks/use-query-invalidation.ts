// src/hooks/use-query-invalidation.ts
// Shared mutation hooks with automatic cache invalidation for real-time dashboard updates

import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'

/**
 * Hook that provides todo mutations with automatic cache invalidation.
 * When any mutation succeeds, all todos queries will refetch.
 */
export function useTodoMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateTodos = () => {
    // Use tRPC's query key format - the first element is the procedure path
    // tRPC generates keys like: [['todos', 'list'], { input: ... }]
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return Array.isArray(key[0]) && key[0][0] === 'todos'
      }
    })
  }

  // Get the base mutation options from tRPC
  const addMutationOptions = trpc.todos.add.mutationOptions()
  const updateMutationOptions = trpc.todos.update.mutationOptions()
  const deleteMutationOptions = trpc.todos.delete.mutationOptions()

  const addTodo = useMutation({
    ...addMutationOptions,
    onSuccess: (...args) => {
      invalidateTodos()
      // Chain the original onSuccess if it exists
      addMutationOptions.onSuccess?.(...args)
    },
  })

  const updateTodo = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateTodos()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteTodo = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateTodos()
      deleteMutationOptions.onSuccess?.(...args)
    },
  })

  return { addTodo, updateTodo, deleteTodo, invalidateTodos }
}

/**
 * Hook that provides jar mutations with automatic cache invalidation.
 */
export function useJarMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateJars = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return Array.isArray(key[0]) && key[0][0] === 'jars'
      }
    })
  }

  const createMutationOptions = trpc.jars.create.mutationOptions()
  const updateMutationOptions = trpc.jars.update.mutationOptions()
  const deleteMutationOptions = trpc.jars.delete.mutationOptions()

  const createJar = useMutation({
    ...createMutationOptions,
    onSuccess: (...args) => {
      invalidateJars()
      createMutationOptions.onSuccess?.(...args)
    },
  })

  const updateJar = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateJars()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteJar = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateJars()
      deleteMutationOptions.onSuccess?.(...args)
    },
  })

  return { createJar, updateJar, deleteJar, invalidateJars }
}

/**
 * Hook that provides tag mutations with automatic cache invalidation.
 */
export function useTagMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateTags = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return Array.isArray(key[0]) && key[0][0] === 'tags'
      }
    })
  }

  const createMutationOptions = trpc.tags.create.mutationOptions()
  const updateMutationOptions = trpc.tags.update.mutationOptions()
  const deleteMutationOptions = trpc.tags.delete.mutationOptions()

  const createTag = useMutation({
    ...createMutationOptions,
    onSuccess: (...args) => {
      invalidateTags()
      createMutationOptions.onSuccess?.(...args)
    },
  })

  const updateTag = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateTags()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteTag = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateTags()
      deleteMutationOptions.onSuccess?.(...args)
    },
  })

  return { createTag, updateTag, deleteTag, invalidateTags }
}

/**
 * Hook that provides note mutations with automatic cache invalidation.
 */
export function useNoteMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateNotes = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return Array.isArray(key[0]) && key[0][0] === 'notes'
      }
    })
  }

  const createMutationOptions = trpc.notes.create.mutationOptions()
  const updateMutationOptions = trpc.notes.update.mutationOptions()
  const deleteMutationOptions = trpc.notes.delete.mutationOptions()

  const createNote = useMutation({
    ...createMutationOptions,
    onSuccess: (...args) => {
      invalidateNotes()
      createMutationOptions.onSuccess?.(...args)
    },
  })

  const updateNote = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateNotes()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteNote = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateNotes()
      deleteMutationOptions.onSuccess?.(...args)
    },
  })

  return { createNote, updateNote, deleteNote, invalidateNotes }
}

