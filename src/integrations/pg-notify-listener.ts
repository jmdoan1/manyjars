// src/integrations/pg-notify-listener.ts
// Listens to PostgreSQL NOTIFY events for real-time updates

import { EventEmitter } from 'events'
import pg from 'pg'

export interface TableChangePayload {
  table: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  userId: string
  id: string
  timestamp: number
}

export class PgNotifyListener extends EventEmitter {
  private client: pg.Client | null = null
  private isConnected = false
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionString: string

  constructor(connectionString: string) {
    super()
    this.connectionString = connectionString
  }

  async connect(): Promise<void> {
    if (this.isConnected) return

    try {
      this.client = new pg.Client({ connectionString: this.connectionString })
      
      this.client.on('notification', (msg) => {
        console.log('[pg-notify] Received notification:', msg.channel, msg.payload?.substring(0, 100))
        if (msg.payload) {
          try {
            const payload = JSON.parse(msg.payload) as TableChangePayload
            console.log('[pg-notify] Emitting change event:', payload.table, payload.operation)
            this.emit('change', payload)
            this.emit(`change:${payload.table}`, payload)
          } catch (e) {
            console.error('[pg-notify] Failed to parse notification payload:', e)
          }
        }
      })

      this.client.on('error', (err) => {
        console.error('[pg-notify] Client error:', err)
        this.handleDisconnect()
      })

      this.client.on('end', () => {
        console.log('[pg-notify] Client disconnected')
        this.handleDisconnect()
      })

      await this.client.connect()
      await this.client.query('LISTEN table_change')
      
      this.isConnected = true
      console.log('[pg-notify] Connected and listening for table_change notifications')
      
    } catch (err) {
      console.error('[pg-notify] Failed to connect:', err)
      this.handleDisconnect()
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false
    this.client = null

    // Auto-reconnect after 5 seconds
    if (!this.reconnectTimeout) {
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null
        console.log('[pg-notify] Attempting to reconnect...')
        this.connect().catch(console.error)
      }, 5000)
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    
    if (this.client) {
      await this.client.end()
      this.client = null
      this.isConnected = false
    }
  }

  getStatus(): { connected: boolean } {
    return { connected: this.isConnected }
  }
}

// Singleton instance - will be initialized when the server starts
let listener: PgNotifyListener | null = null

export function getPgNotifyListener(): PgNotifyListener | null {
  return listener
}

export function initPgNotifyListener(connectionString: string): PgNotifyListener {
  if (!listener) {
    listener = new PgNotifyListener(connectionString)
  }
  return listener
}
