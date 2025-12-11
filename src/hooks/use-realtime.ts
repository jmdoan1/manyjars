// src/hooks/use-realtime.ts
// Hook that subscribes to PostgreSQL table changes and invalidates queries

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUser } from '@clerk/clerk-react'
import { trpcClient } from '@/integrations/tanstack-query/root-provider'
import type { TableChangePayload } from '@/integrations/pg-notify-listener'

type TableName = 'Todo' | 'Jar' | 'Tag' | 'Note'

// Map table names to tRPC router names (lowercase)
const tableToRouterMap: Record<TableName, string> = {
  Todo: 'todos',
  Jar: 'jars', 
  Tag: 'tags',
  Note: 'notes',
}

/**
 * Hook that subscribes to real-time table changes via WebSocket.
 * Automatically invalidates TanStack Query cache when changes occur,
 * causing affected components to refetch.
 * 
 * @param userId - The current user's ID for filtering changes
 * @param tables - Array of table names to subscribe to
 * 
 * @example
 * // In a dashboard component
 * useRealtime(userId, ['Todo', 'Jar', 'Tag', 'Note'])
 */
export function useRealtime(userId: string | undefined, tables: TableName[] = ['Todo', 'Jar', 'Tag', 'Note']) {
  const queryClient = useQueryClient()
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  useEffect(() => {
    // Only subscribe on client-side and when we have a userId
    if (typeof window === 'undefined' || !userId) return

    console.log('[realtime] Setting up subscription for user:', userId)

    const subscribe = async () => {
      try {
        // Create subscription using tRPC client directly
        const subscription = trpcClient.subscriptions.onTableChange.subscribe(
          { tables, clerkUserId: userId },
          {
            onData: (payload: TableChangePayload) => {
              console.log('[realtime] Table change received:', payload)
              
              // Map table name to router name and invalidate queries
              const routerName = tableToRouterMap[payload.table as TableName]
              if (routerName) {
                queryClient.invalidateQueries({
                  predicate: (query) => {
                    const key = query.queryKey as unknown[]
                    return Array.isArray(key[0]) && key[0][0] === routerName
                  },
                })
              }
            },
            onError: (err: Error) => {
              console.error('[realtime] Subscription error:', err)
            },
          }
        )

        subscriptionRef.current = subscription
      } catch (err) {
        console.error('[realtime] Failed to subscribe:', err)
      }
    }

    subscribe()

    return () => {
      if (subscriptionRef.current) {
        console.log('[realtime] Unsubscribing')
        subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
      }
    }
  }, [userId, tables.join(','), queryClient])
}

/**
 * Provider component that enables real-time updates for the entire app.
 * Place this at the root of your application (inside ClerkProvider).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  useRealtime(user?.id, ['Todo', 'Jar', 'Tag', 'Note'])
  return children
}

