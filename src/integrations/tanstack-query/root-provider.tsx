import { QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'
import { createTRPCClient, httpBatchStreamLink, splitLink, wsLink, createWSClient } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'

import type { TRPCRouter } from '@/integrations/trpc/router'

import { TRPCProvider } from '@/integrations/trpc/react'

function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') return ''
    return `http://localhost:${process.env.PORT ?? 3000}`
  })()
  return `${base}/api/trpc`
}

function getWsUrl() {
  if (typeof window === 'undefined') return ''
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsPort = process.env.WS_PORT || '3001'
  return `${wsProtocol}//${window.location.hostname}:${wsPort}`
}

// WebSocket client for subscriptions (only on client-side)
let wsClient: ReturnType<typeof createWSClient> | null = null
function getWsClient() {
  if (typeof window === 'undefined') return null
  if (!wsClient) {
    wsClient = createWSClient({
      url: getWsUrl(),
      onOpen: () => console.log('[trpc-ws] Connected'),
      onClose: () => console.log('[trpc-ws] Disconnected'),
    })
  }
  return wsClient
}

export const trpcClient = createTRPCClient<TRPCRouter>({
  links: [
    splitLink({
      // Route subscriptions to WebSocket, everything else to HTTP
      condition: (op) => op.type === 'subscription',
      true: wsLink({
        client: getWsClient()!,
        transformer: superjson,
      }),
      false: httpBatchStreamLink({
        transformer: superjson,
        url: getUrl(),
      }),
    }),
  ],
})

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  })

  const serverHelpers = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient: queryClient,
  })
  return {
    queryClient,
    trpc: serverHelpers,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  )
}

