// src/components/modules/chat-module.tsx

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Send, Bot, User, Loader2, Trash2, Wrench } from 'lucide-react'
import { Streamdown } from 'streamdown'

import type { ModuleProps } from '@/types/dashboard-types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    args: any
    result?: any
    pending?: boolean
  }>
}

function Messages({ messages, isLoading }: { messages: Array<ChatMessage>; isLoading: boolean }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
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
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto max-h-[400px]">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`py-2 ${
            message.role === 'assistant'
              ? 'bg-purple-500/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-2 px-3">
            {message.role === 'assistant' ? (
              <div className="w-5 h-5 rounded bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5">
                <Bot className="w-3 h-3" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5">
                <User className="w-3 h-3" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {message.content && (
                <div className="text-white prose prose-sm prose-invert max-w-none text-sm">
                  <Streamdown>{message.content}</Streamdown>
                </div>
              )}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {message.toolCalls.map((tc) => (
                    <div key={tc.id} className="text-[10px] text-white/40 flex items-center gap-1">
                      {tc.pending ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <span className="text-green-400">✓</span>
                      )}
                      <Wrench className="w-2.5 h-2.5" />
                      <span>{tc.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {isLoading && messages.length > 0 && !messages[messages.length - 1]?.content && (
        <div className="py-2 px-3 flex items-center gap-2 text-white/40 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Thinking...</span>
        </div>
      )}
    </div>
  )
}

export function ChatModule(props: ModuleProps) {
  const { user } = useUser()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Get model from config or use default
  const model = (props.config as any)?.model || 'llama3.1:8b'
  const userId = user?.id

  const sendMessage = async (text: string) => {
    if (!text.trim() || !userId || isLoading) return

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setIsLoading(true)

    // Prepare messages for API (just role and content)
    const apiMessages = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }))

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
                // Append text to assistant message
                setMessages(prev => {
                  const updated = [...prev]
                  const lastMsg = updated[updated.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content += parsed.textDelta
                  }
                  return updated
                })
              } else if (parsed.type === 'tool-call') {
                // Add tool call to assistant message
                setMessages(prev => {
                  const updated = [...prev]
                  const lastMsg = updated[updated.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant') {
                    if (!lastMsg.toolCalls) lastMsg.toolCalls = []
                    lastMsg.toolCalls.push({
                      id: parsed.toolCallId,
                      name: parsed.toolName,
                      args: parsed.args,
                      pending: true,
                    })
                  }
                  return updated
                })
              } else if (parsed.type === 'tool-result') {
                // Mark tool call as complete
                setMessages(prev => {
                  const updated = [...prev]
                  const lastMsg = updated[updated.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls) {
                    const tc = lastMsg.toolCalls.find(t => t.id === parsed.toolCallId)
                    if (tc) {
                      tc.pending = false
                      tc.result = parsed.result
                    }
                  }
                  return updated
                })
              } else if (parsed.type === 'error') {
                // Handle error
                setMessages(prev => {
                  const updated = [...prev]
                  const lastMsg = updated[updated.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content = `Error: ${parsed.error?.message || 'Unknown error'}`
                  }
                  return updated
                })
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = `Error: ${error.message}`
          }
          return updated
        })
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
    setMessages([])
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Messages Area */}
      <Messages messages={messages} isLoading={isLoading} />

      {/* Input Area */}
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
              {messages.length > 0 && (
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
