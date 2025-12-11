// scripts/ws-server.ts
// Standalone WebSocket server for tRPC subscriptions
// Run with: pnpm dev:ws

import { WebSocketServer } from 'ws'
import { applyWSSHandler } from '@trpc/server/adapters/ws'
import { trpcRouter } from '../src/integrations/trpc/router'
import { createTRPCContext } from '../src/integrations/trpc/context'
import { initPgNotifyListener } from '../src/integrations/pg-notify-listener'

const WS_PORT = Number(process.env.WS_PORT) || 3001

async function main() {
  console.log('[ws-server] Starting WebSocket server...')

  // Initialize PostgreSQL NOTIFY listener
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl) {
    console.log('[ws-server] Connecting to PostgreSQL for NOTIFY...')
    const pgListener = initPgNotifyListener(dbUrl)
    await pgListener.connect()
    console.log('[ws-server] PostgreSQL NOTIFY listener connected')
  } else {
    console.warn('[ws-server] DATABASE_URL not set, pg-notify listener disabled')
  }

  // Create WebSocket server
  const wss = new WebSocketServer({ port: WS_PORT })

  // Apply tRPC handler
  const handler = applyWSSHandler({
    wss,
    router: trpcRouter,
    createContext: async () => {
      // For WebSocket, create a minimal context
      // In production, you'd extract auth from the WebSocket handshake
      return createTRPCContext({ req: new Request('http://localhost') })
    },
  })

  wss.on('connection', (ws) => {
    console.log('[ws-server] Client connected, total:', wss.clients.size)
    
    ws.on('close', () => {
      console.log('[ws-server] Client disconnected, total:', wss.clients.size)
    })
  })

  console.log(`[ws-server] ✓ WebSocket server running on ws://localhost:${WS_PORT}`)
  
  // Graceful shutdown
  const shutdown = () => {
    console.log('[ws-server] Shutting down...')
    handler.broadcastReconnectNotification()
    wss.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[ws-server] Fatal error:', err)
  process.exit(1)
})
