// src/components/modules/chat-module.tsx

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Send, Bot, User, Loader2, Trash2, Wrench, CheckCircle2 } from 'lucide-react'
import { Streamdown } from 'streamdown'

import type { ModuleProps } from '@/types/dashboard-types'

// Different types of chat items for better flow visualization
type ChatItem = 
  | { type: 'user-message'; id: string; content: string }
  | { type: 'assistant-message'; id: string; content: string }
  | { type: 'tool-call'; id: string; name: string; args: any; pending: boolean; result?: any }

function ChatItems({ items, isLoading }: { items: ChatItem[]; isLoading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [items])

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/50 text-sm p-6 text-center min-h-[200px]">
        <Bot className="w-10 h-10 mb-3 opacity-50" />
        <p className="font-medium mb-1">ManyJar AI</p>
        <p className="text-xs opacity-75">
          Ask me to manage your todos, jars, tags, or notes.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto max-h-[400px] space-y-1">
      {items.map((item) => {
        if (item.type === 'user-message') {
          return (
            <div key={item.id} className="py-2 px-3 flex items-start gap-2">
              <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 text-white text-sm">{item.content}</div>
            </div>
          )
        }
        
        if (item.type === 'assistant-message') {
          return (
            <div key={item.id} className="py-2 px-3 bg-purple-500/5 flex items-start gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 text-white prose prose-sm prose-invert max-w-none text-sm">
                <Streamdown>{item.content}</Streamdown>
              </div>
            </div>
          )
        }
        
        if (item.type === 'tool-call') {
          // Generate a human-readable description
          const getToolDescription = () => {
            const args = item.args || {}
            switch (item.name) {
              case 'listTodos':
                return args.textSearch ? `Searching todos for "${args.textSearch}"` : 'Listing todos'
              case 'searchTodos':
                const query = args.query || args.filter || args.text || args.searchTerm || args.search || args.searchText || ''
                return query ? `Searching todos for "${query}"` : 'Searching todos'
              case 'listJars':
                return 'Listing jars'
              case 'listTags':
                return 'Listing tags'
              case 'listNotes':
                return 'Listing notes'
              case 'createTodo':
                return `Creating todo: "${args.title || 'untitled'}"`
              case 'createJar':
                return `Creating jar: "${args.name || 'untitled'}"`
              case 'createTag':
                return `Creating tag: "${args.name || 'untitled'}"`
              case 'createNote':
                return `Creating note`
              case 'deleteTodo':
                return `Deleting todo`
              case 'deleteJar':
                return `Deleting jar`
              case 'deleteTag':
                return `Deleting tag`
              case 'deleteNote':
                return `Deleting note`
              case 'updateTodo':
                return `Updating todo`
              case 'updateJar':
                return `Updating jar`
              case 'updateTag':
                return `Updating tag`
              case 'updateNote':
                return `Updating note`
              default:
                return item.name
            }
          }
          
          return (
            <div key={item.id} className="py-1 px-3 ml-7">
              <div className="text-[11px] text-white/50 flex items-center gap-1.5 bg-white/5 rounded px-2 py-1 w-fit">
                {item.pending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                )}
                <Wrench className="w-3 h-3" />
                <span>{getToolDescription()}</span>
                {item.result?.error && (
                  <span className="text-red-400 ml-1">- Error</span>
                )}
              </div>
            </div>
          )
        }
        
        return null
      })}
      {isLoading && items.length > 0 && (
        <div className="py-2 px-3 ml-7 flex items-center gap-2 text-white/40 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  )
}

export function ChatModule(props: ModuleProps) {
  const { user } = useUser()
  const [input, setInput] = useState('')
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const model = (props.config as any)?.model || 'qwen2.5:7b-instruct'
  const userId = user?.id

  // Convert chat items to messages format for API
  const getApiMessages = () => {
    const messages: Array<{ role: string; content: string }> = []
    for (const item of chatItems) {
      if (item.type === 'user-message') {
        messages.push({ role: 'user', content: item.content })
      } else if (item.type === 'assistant-message' && item.content) {
        messages.push({ role: 'assistant', content: item.content })
      }
    }
    return messages
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || !userId || isLoading) return

    // Add user message
    const userMsgId = `user-${Date.now()}`
    setChatItems(prev => [...prev, { type: 'user-message', id: userMsgId, content: text }])
    setIsLoading(true)

    // Prepare messages for API
    const apiMessages = [...getApiMessages(), { role: 'user', content: text }]

    try {
      abortControllerRef.current = new AbortController()
      
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          userId,
          model,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentAssistantId: string | null = null
      const toolCallIds = new Set<string>() // Track existing tool call IDs to avoid duplicates

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              
              if (parsed.type === 'text-delta' && parsed.textDelta) {
                // Append text to current assistant message or create new one
                setChatItems(prev => {
                  const updated = [...prev]
                  // Find last assistant message with current ID
                  let lastAssistantIndex = -1
                  for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].type === 'assistant-message' && updated[i].id === currentAssistantId) {
                      lastAssistantIndex = i
                      break
                    }
                  }
                  
                  if (lastAssistantIndex >= 0) {
                    const item = updated[lastAssistantIndex] as { type: 'assistant-message'; id: string; content: string }
                    item.content += parsed.textDelta
                  } else {
                    currentAssistantId = `assistant-${Date.now()}`
                    updated.push({ type: 'assistant-message', id: currentAssistantId, content: parsed.textDelta })
                  }
                  return updated
                })
              } else if (parsed.type === 'tool-call') {
                // Add tool call as separate item (avoid duplicates)
                if (!toolCallIds.has(parsed.toolCallId)) {
                  toolCallIds.add(parsed.toolCallId)
                  setChatItems(prev => [
                    ...prev,
                    {
                      type: 'tool-call',
                      id: parsed.toolCallId,
                      name: parsed.toolName,
                      args: parsed.args,
                      pending: true,
                    },
                  ])
                }
                // Reset currentAssistantId so next text creates new message
                currentAssistantId = null
              } else if (parsed.type === 'tool-result') {
                // Update tool call with result
                setChatItems(prev => {
                  const updated = [...prev]
                  const toolIndex = updated.findIndex(
                    item => item.type === 'tool-call' && item.id === parsed.toolCallId
                  )
                  if (toolIndex >= 0) {
                    const item = updated[toolIndex] as { type: 'tool-call'; id: string; name: string; args: any; pending: boolean; result?: any }
                    item.pending = false
                    item.result = parsed.result
                  }
                  return updated
                })
              } else if (parsed.type === 'error') {
                setChatItems(prev => [
                  ...prev,
                  { type: 'assistant-message', id: `error-${Date.now()}`, content: `Error: ${parsed.error?.message || 'Unknown error'}` },
                ])
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setChatItems(prev => [
          ...prev,
          { type: 'assistant-message', id: `error-${Date.now()}`, content: `Error: ${error.message}` },
        ])
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const clearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setChatItems([])
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      <ChatItems items={chatItems} isLoading={isLoading} />

      <div className="border-t border-white/10 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim() && !isLoading && user) {
              sendMessage(input)
              setInput('')
            }
          }}
        >
          <div className="relative flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={user ? "Ask AI..." : "Sign in to use AI"}
              disabled={!user || isLoading}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent resize-none overflow-hidden disabled:opacity-50"
              rows={1}
              style={{ minHeight: '36px', maxHeight: '80px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 80) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isLoading && user) {
                  e.preventDefault()
                  sendMessage(input)
                  setInput('')
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <button
                type="submit"
                disabled={!input.trim() || !user || isLoading}
                className="p-2 bg-purple-500 hover:bg-purple-600 disabled:bg-white/10 disabled:text-white/30 text-white rounded-lg transition-colors focus:outline-none"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
              {chatItems.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
