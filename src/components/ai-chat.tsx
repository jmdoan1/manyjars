/**
 * AI Chat Component
 * 
 * A chat interface for interacting with the Ollama-powered AI assistant
 * that can manage todos, jars, tags, and notes.
 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import { useUser } from '@clerk/clerk-react'

import { Send, X, ChevronRight, Bot, User, Loader2 } from 'lucide-react'
import { Streamdown } from 'streamdown'

import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

// Store to control visibility of AI chat panel
export const showAIChat = new Store(false)

function Messages({ messages, isLoading }: { messages: Array<UIMessage>; isLoading: boolean }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm p-6 text-center">
        <Bot className="w-12 h-12 mb-4 opacity-50" />
        <p className="font-medium mb-2">ManyJar AI Assistant</p>
        <p className="text-xs opacity-75">
          I can help you manage your todos, jars, tags, and notes.
          <br />
          Try asking me to "list all my todos" or "create a new jar called work"
        </p>
      </div>
    )
  }

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
      {messages.map(({ id, role, parts }) => (
        <div
          key={id}
          className={`py-3 ${
            role === 'assistant'
              ? 'bg-gradient-to-r from-blue-500/5 to-purple-600/5'
              : 'bg-transparent'
          }`}
        >
          {parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return (
                <div key={index} className="flex items-start gap-2 px-4">
                  {role === 'assistant' ? (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-lg bg-gray-700 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-white prose dark:prose-invert max-w-none prose-sm">
                    <Streamdown>{part.content}</Streamdown>
                  </div>
                </div>
              )
            }
            if (part.type === 'tool-call') {
              return (
                <div key={part.id} className="px-4 py-1 ml-8">
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    {part.state === 'input-complete' || part.state === 'awaiting-input' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span className="text-green-500">✓</span>
                    )}
                    <span>Tool: {part.name}</span>
                  </div>
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
      {isLoading && (
        <div className="py-3 px-4 flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Thinking...</span>
        </div>
      )}
    </div>
  )
}

interface AIChatProps {
  /** Override the default model */
  model?: string
}

export default function AIChat({ model }: AIChatProps) {
  const isOpen = useStore(showAIChat)
  const { user } = useUser()
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/ai-chat'),
  })

  const handleSendMessage = (content: string) => {
    if (!user?.id) {
      console.error('No user logged in')
      return
    }
    
    // Send message with userId in body
    sendMessage(content, {
      body: {
        userId: user.id,
        model: model || 'llama3.1:8b',
      },
    } as any) // Use 'as any' to bypass type check - API expects these fields
  }

  return (
    <div className="relative z-50">
      <button
        onClick={() => showAIChat.setState((state) => !state)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <span className="font-medium">AI Assistant</span>
        </div>
        <ChevronRight className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute bottom-0 left-full ml-2 w-[700px] h-[600px] bg-gray-900 rounded-lg shadow-xl border border-purple-500/20 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-purple-500/20">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">AI Assistant</h3>
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                {model || 'llama3.1:8b'}
              </span>
            </div>
            <button
              onClick={() => showAIChat.setState((state) => !state)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Messages messages={messages} isLoading={isLoading} />

          <div className="p-3 border-t border-purple-500/20">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (input.trim() && !isLoading) {
                  handleSendMessage(input)
                  setInput('')
                }
              }}
            >
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={user ? "Type your message..." : "Please sign in to use AI"}
                  disabled={!user || isLoading}
                  className="w-full rounded-lg border border-purple-500/20 bg-gray-800/50 pl-3 pr-10 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none overflow-hidden disabled:opacity-50"
                  rows={1}
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isLoading) {
                      e.preventDefault()
                      handleSendMessage(input)
                      setInput('')
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || !user || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-purple-500 hover:text-purple-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
