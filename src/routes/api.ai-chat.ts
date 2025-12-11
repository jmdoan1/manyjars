import { createFileRoute } from '@tanstack/react-router'

import { allToolDefs, executeTool } from '@/lib/ai-tools'
import { prisma } from '@/db'
import { zodToJsonSchema } from 'zod-to-json-schema'

// Get OLLAMA_URL from process.env (server-side) with fallback
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// Get current date as ISO string for the system prompt
function getCurrentDateString(): string {
  return new Date().toISOString().split('T')[0]
}

// Convert our tool definitions to Ollama's tool format
function convertToolsToOllamaFormat() {
  return allToolDefs.map(toolDef => {
    const schema = toolDef.inputSchema ? zodToJsonSchema(toolDef.inputSchema) : { type: 'object', properties: {} }
    // Remove $schema property that zod-to-json-schema adds
    if ('$schema' in schema) delete (schema as any).$schema
    
    return {
      type: 'function',
      function: {
        name: toolDef.name,
        description: toolDef.description,
        parameters: schema,
      },
    }
  })
}

// System prompt explaining available tools and capabilities
const SYSTEM_PROMPT = `You are a helpful AI assistant for a personal productivity dashboard called ManyJar.

CURRENT DATE: {{CURRENT_DATE}}

You have access to tools to manage the user's:
- **Todos**: Tasks with titles, descriptions, priorities, due dates, and associations with jars and tags
- **Jars**: Containers/categories for organizing todos and notes (like folders or projects)
- **Tags**: Labels for categorizing todos and notes (like hashtags)
- **Notes**: Rich text notes that can be associated with jars and tags

IMPORTANT RULES:
1. Every tool requires a "userId" parameter. You MUST use the userId provided in your context.
2. When creating jars or tags, names must be alphanumeric with hyphens/underscores only (e.g., "work-projects", "personal_goals").
3. Use the list tools to get data, search tools for fuzzy matching.
4. Priorities for todos are: VERY_LOW, LOW, MEDIUM, HIGH, VERY_HIGH
5. When asked about due dates, use the listTodos tool and filter/check dueDates in your response.

Be concise but helpful. Format responses nicely when listing multiple items.`

export const Route = createFileRoute('/api/ai-chat')({
  // @ts-expect-error - TanStack Start server handlers are not fully typed yet
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        console.log('[AI Chat] Received request')
        console.log('[AI Chat] OLLAMA_URL:', OLLAMA_URL)
        
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        try {
          const body = await request.json()
          const { messages, userId: clerkUserId, model } = body

          if (!clerkUserId) {
            return new Response(
              JSON.stringify({ error: 'userId (Clerk ID) is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Look up the database user ID
          const dbUser = await prisma.user.findUnique({
            where: { clerkUserId },
            select: { id: true },
          })

          if (!dbUser) {
            return new Response(
              JSON.stringify({ error: 'User not found' }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const dbUserId = dbUser.id
          const currentDate = getCurrentDateString()
          
          // Build full system prompt
          const fullSystemPrompt = SYSTEM_PROMPT.replace(/\{\{CURRENT_DATE\}\}/g, currentDate) + 
            `\n\nThe user's database ID is: ${dbUserId}\nYou MUST use this exact userId for ALL tool calls.`

          // Convert tools to Ollama format
          const ollamaTools = convertToolsToOllamaFormat()

          console.log('[AI Chat] Starting chat with model:', model || 'llama3.1:8b')
          console.log('[AI Chat] User DB ID:', dbUserId)
          console.log('[AI Chat] Tools count:', ollamaTools.length)

          // Agentic loop - continue until model is done
          let conversationMessages: Array<{ role: string; content: string; tool_calls?: any[] }> = [
            { role: 'system', content: fullSystemPrompt },
            ...messages,
          ]

          const encoder = new TextEncoder()

          const stream = new ReadableStream({
            async start(controller) {
              try {
                let iterationCount = 0
                const maxIterations = 10

                while (iterationCount < maxIterations) {
                  iterationCount++
                  console.log(`[AI Chat] Iteration ${iterationCount}`)

                  // Call Ollama
                  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: model || 'llama3.1:8b',
                      messages: conversationMessages,
                      tools: ollamaTools,
                      stream: false, // Use non-streaming for agentic loop
                    }),
                    signal: abortController.signal,
                  })

                  if (!response.ok) {
                    const error = await response.text()
                    console.error('[AI Chat] Ollama error:', error)
                    const errorData = { type: 'error', error: { message: `Ollama error: ${error}` } }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
                    controller.close()
                    return
                  }

                  const data = await response.json()
                  const assistantMessage = data.message

                  // Stream any text content
                  if (assistantMessage?.content) {
                    const textData = { type: 'text-delta', textDelta: assistantMessage.content }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(textData)}\n\n`))
                  }

                  // Check for tool calls
                  if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
                    // Add assistant message to conversation
                    conversationMessages.push({
                      role: 'assistant',
                      content: assistantMessage.content || '',
                      tool_calls: assistantMessage.tool_calls,
                    })

                    // Execute each tool call
                    for (const toolCall of assistantMessage.tool_calls) {
                      const toolName = toolCall.function?.name
                      const toolArgs = toolCall.function?.arguments || {}

                      console.log(`[AI Chat] Executing tool: ${toolName}`)
                      
                      // Send tool call notification
                      const toolCallData = {
                        type: 'tool-call',
                        toolCallId: toolCall.id || `tc_${Date.now()}`,
                        toolName,
                        args: toolArgs,
                      }
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallData)}\n\n`))

                      // Execute the tool
                      let toolResult: any
                      
                      try {
                        toolResult = await executeTool(toolName, toolArgs)
                        console.log(`[AI Chat] Tool ${toolName} result:`, JSON.stringify(toolResult).slice(0, 200))
                      } catch (toolError: any) {
                        console.error(`[AI Chat] Tool ${toolName} error:`, toolError)
                        toolResult = { error: toolError.message }
                      }

                      // Add tool result to conversation
                      conversationMessages.push({
                        role: 'tool',
                        content: JSON.stringify(toolResult),
                      })

                      // Send tool result notification
                      const toolResultData = {
                        type: 'tool-result',
                        toolCallId: toolCall.id || `tc_${Date.now()}`,
                        toolName,
                        result: toolResult,
                      }
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolResultData)}\n\n`))
                    }

                    // Continue the loop to get the model's response to tool results
                    continue
                  }

                  // No tool calls, we're done
                  break
                }

                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              } catch (error: any) {
                console.error('[AI Chat] Stream error:', error)
                const errorData = { type: 'error', error: { message: error.message } }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
                controller.close()
              }
            },
          })

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          })
        } catch (error: any) {
          console.error('[AI Chat] API error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to process chat request', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
