// src/integrations/ws-server.ts
// WebSocket server for tRPC subscriptions

import { WebSocketServer } from 'ws'
import { applyWSSHandler } from '@trpc/server/adapters/ws'
import { trpcRouter } from '@/integrations/trpc/router'
import { createTRPCContext } from '@/integrations/trpc/context'
import { initPgNotifyListener } from '@/integrations/pg-notify-listener'

const WS_PORT = Number(process.env.WS_PORT) || 3001

let wss: WebSocketServer | null = null

export async function startWebSocketServer() {
  if (wss) {
    console.log('[ws-server] Already running')
    return wss
  }

  // Initialize PostgreSQL NOTIFY listener
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl) {
    const pgListener = initPgNotifyListener(dbUrl)
    await pgListener.connect()
  } else {
    console.warn('[ws-server] DATABASE_URL not set, pg-notify listener disabled')
  }

  // Create WebSocket server
  wss = new WebSocketServer({ port: WS_PORT })

  // Apply tRPC handler
  const handler = applyWSSHandler({
    wss,
    router: trpcRouter,
    createContext: async (opts) => {
      // For WebSocket, we need to extract auth from the connection
      // This is a simplified version - in production you'd validate JWT/session
      const req = opts.req as unknown as Request | undefined
      return createTRPCContext({ req: req ?? new Request('http://localhost') })
    },
  })

  wss.on('connection', (ws) => {
    console.log('[ws-server] Client connected, total:', wss?.clients.size)
    
    ws.on('close', () => {
      console.log('[ws-server] Client disconnected, total:', wss?.clients.size)
    })
  })

  console.log(`[ws-server] WebSocket server running on port ${WS_PORT}`)
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[ws-server] Shutting down...')
    handler.broadcastReconnectNotification()
    wss?.close()
  })

  return wss
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss
}
