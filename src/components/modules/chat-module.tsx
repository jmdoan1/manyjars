// src/components/modules/chat-module.tsx

import { useEffect, useRef, useState, useMemo } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react'
import { Streamdown } from 'streamdown'

import { useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { ModuleProps } from '@/types/dashboard-types'

function Messages({ messages, isLoading }: { messages: Array<UIMessage>; isLoading: boolean }) {
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
      {messages.map(({ id, role, parts }) => (
        <div
          key={id}
          className={`py-2 ${
            role === 'assistant'
              ? 'bg-purple-500/5'
              : 'bg-transparent'
          }`}
        >
          {parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return (
                <div key={index} className="flex items-start gap-2 px-3">
                  {role === 'assistant' ? (
                    <div className="w-5 h-5 rounded bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5">
                      <Bot className="w-3 h-3" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5">
                      <User className="w-3 h-3" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-white prose prose-sm prose-invert max-w-none text-sm">
                    <Streamdown>{part.content}</Streamdown>
                  </div>
                </div>
              )
            }
            if (part.type === 'tool-call') {
              return (
                <div key={part.id} className="px-3 py-0.5 ml-7">
                  <div className="text-[10px] text-white/40 flex items-center gap-1">
                    {part.state === 'input-complete' || part.state === 'awaiting-input' ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <span className="text-green-400">✓</span>
                    )}
                    <span>{part.name}</span>
                  </div>
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
      {isLoading && messages.length > 0 && !messages[messages.length - 1]?.parts?.some(p => p.type === 'text' && p.content) && (
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
  
  // Get model from config or use default
  const model = (props.config as any)?.model || 'llama3.1:8b'
  const userId = user?.id

  // Create a custom connection that injects userId and model
  const connection = useMemo(() => ({
    connect: async function* (messages: any[], _data?: Record<string, any>, abortSignal?: AbortSignal) {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          userId,
          model,
        }),
        signal: abortSignal,
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
            if (data === '[DONE]') return
            try {
              yield JSON.parse(data)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    },
  }), [userId, model])

  const { messages, sendMessage, isLoading, setMessages } = useChat({
    connection,
  })

  const clearChat = () => {
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
