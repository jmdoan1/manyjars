// src/hooks/use-query-invalidation.ts
// Shared mutation hooks with automatic cache invalidation for real-time dashboard updates

import { useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'

// Helper to create an invalidation function for a specific router
function createInvalidator(queryClient: QueryClient, routerName: string) {
  return () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return Array.isArray(key[0]) && key[0][0] === routerName
      }
    })
  }
}

/**
 * Hook that provides todo mutations with automatic cache invalidation.
 * When any mutation succeeds, todos, jars, and tags queries will refetch
 * (since todos can auto-create jars/tags via @mentions).
 */
export function useTodoMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateTodos = createInvalidator(queryClient, 'todos')
  const invalidateJars = createInvalidator(queryClient, 'jars')
  const invalidateTags = createInvalidator(queryClient, 'tags')

  // Invalidate all related entities since todos can create jars/tags via mentions
  const invalidateAll = () => {
    invalidateTodos()
    invalidateJars()
    invalidateTags()
  }

  // Get the base mutation options from tRPC
  const addMutationOptions = trpc.todos.add.mutationOptions()
  const updateMutationOptions = trpc.todos.update.mutationOptions()
  const deleteMutationOptions = trpc.todos.delete.mutationOptions()

  const addTodo = useMutation({
    ...addMutationOptions,
    onSuccess: (...args) => {
      invalidateAll()
      // Chain the original onSuccess if it exists
      addMutationOptions.onSuccess?.(...args)
    },
  })

  const updateTodo = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateAll()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteTodo = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateTodos() // Delete only invalidates todos
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
 * When any mutation succeeds, notes, jars, and tags queries will refetch
 * (since notes can auto-create jars/tags via @mentions).
 */
export function useNoteMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidateNotes = createInvalidator(queryClient, 'notes')
  const invalidateJars = createInvalidator(queryClient, 'jars')
  const invalidateTags = createInvalidator(queryClient, 'tags')

  // Invalidate all related entities since notes can create jars/tags via mentions
  const invalidateAll = () => {
    invalidateNotes()
    invalidateJars()
    invalidateTags()
  }

  const createMutationOptions = trpc.notes.create.mutationOptions()
  const updateMutationOptions = trpc.notes.update.mutationOptions()
  const deleteMutationOptions = trpc.notes.delete.mutationOptions()

  const createNote = useMutation({
    ...createMutationOptions,
    onSuccess: (...args) => {
      invalidateAll()
      createMutationOptions.onSuccess?.(...args)
    },
  })

  const updateNote = useMutation({
    ...updateMutationOptions,
    onSuccess: (...args) => {
      invalidateAll()
      updateMutationOptions.onSuccess?.(...args)
    },
  })

  const deleteNote = useMutation({
    ...deleteMutationOptions,
    onSuccess: (...args) => {
      invalidateNotes() // Delete only invalidates notes
      deleteMutationOptions.onSuccess?.(...args)
    },
  })

  return { createNote, updateNote, deleteNote, invalidateNotes }
}

