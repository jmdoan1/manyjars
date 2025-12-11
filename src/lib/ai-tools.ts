/**
 * AI Tools for TanStack AI with Ollama adapter
 * 
 * Provides server-side tools for managing Todos, Jars, Tags, and Notes
 * using the existing Prisma database.
 */

import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { prisma } from '@/db'
import { Priority } from '@/generated/prisma/client'

// =============================================================================
// Common Schemas
// =============================================================================

const prioritySchema = z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])

// =============================================================================
// TODO TOOLS
// =============================================================================

export const listTodosToolDef = toolDefinition({
  name: 'listTodos',
  description: 'List todos for the user. Can filter by completion status, search text, jar IDs, or tag IDs.',
  inputSchema: z.object({
    userId: z.string().uuid().describe('The user ID to list todos for'),
    isCompleted: z.boolean().optional().describe('Filter by completion status'),
    textSearch: z.string().optional().describe('Search in title and description'),
    jarIds: z.array(z.string().uuid()).optional().describe('Filter by jar IDs'),
    tagIds: z.array(z.string().uuid()).optional().describe('Filter by tag IDs'),
    limit: z.number().int().min(1).max(100).default(50).describe('Maximum number of results'),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
    completedAt: z.string().nullable(),
    dueDate: z.string().nullable(),
    priority: prioritySchema,
    createdAt: z.string(),
    jars: z.array(z.object({ id: z.string(), name: z.string() })),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
})

export const listTodos = listTodosToolDef.server(async (input) => {
  const where: any = { userId: input.userId }
  
  if (typeof input.isCompleted === 'boolean') {
    where.completedAt = input.isCompleted ? { not: null } : null
  }
  
  if (input.textSearch) {
    where.OR = [
      { title: { contains: input.textSearch, mode: 'insensitive' } },
      { description: { contains: input.textSearch, mode: 'insensitive' } },
    ]
  }
  
  if (input.jarIds?.length) {
    where.jars = { some: { id: { in: input.jarIds } } }
  }
  
  if (input.tagIds?.length) {
    where.tags = { some: { id: { in: input.tagIds } } }
  }
  
  const todos = await prisma.todo.findMany({
    where,
    take: input.limit,
    include: { jars: true, tags: true },
    orderBy: { createdAt: 'desc' },
  })
  
  return todos.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    aiNotes: t.aiNotes,
    completedAt: t.completedAt?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    jars: t.jars.map(j => ({ id: j.id, name: j.name })),
    tags: t.tags.map(tag => ({ id: tag.id, name: tag.name })),
  }))
})

export const searchTodosToolDef = toolDefinition({
  name: 'searchTodos',
  description: 'Search todos by fuzzy text match across title, description, and aiNotes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    query: z.string().min(1).describe('Search query'),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const searchTodos = searchTodosToolDef.server(async (input) => {
  const todos = await prisma.todo.findMany({
    where: {
      userId: input.userId,
      OR: [
        { title: { contains: input.query, mode: 'insensitive' } },
        { description: { contains: input.query, mode: 'insensitive' } },
        { aiNotes: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    take: input.limit,
  })
  return todos.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    aiNotes: t.aiNotes,
  }))
})

export const getTodosByIdToolDef = toolDefinition({
  name: 'getTodosById',
  description: 'Get specific todos by their IDs.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
    completedAt: z.string().nullable(),
    dueDate: z.string().nullable(),
    priority: prioritySchema,
    jars: z.array(z.object({ id: z.string(), name: z.string() })),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
})

export const getTodosById = getTodosByIdToolDef.server(async (input) => {
  const todos = await prisma.todo.findMany({
    where: { id: { in: input.ids }, userId: input.userId },
    include: { jars: true, tags: true },
  })
  return todos.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    aiNotes: t.aiNotes,
    completedAt: t.completedAt?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    priority: t.priority,
    jars: t.jars.map(j => ({ id: j.id, name: j.name })),
    tags: t.tags.map(tag => ({ id: tag.id, name: tag.name })),
  }))
})

export const createTodoToolDef = toolDefinition({
  name: 'createTodo',
  description: 'Create a new todo for the user.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: prioritySchema.optional(),
    dueDate: z.string().optional().describe('ISO date string'),
    jarIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
  }),
})

export const createTodo = createTodoToolDef.server(async (input) => {
  const todo = await prisma.todo.create({
    data: {
      title: input.title,
      description: input.description,
      userId: input.userId,
      priority: input.priority as Priority || 'MEDIUM',
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      jars: input.jarIds?.length ? { connect: input.jarIds.map(id => ({ id })) } : undefined,
      tags: input.tagIds?.length ? { connect: input.tagIds.map(id => ({ id })) } : undefined,
    },
  })
  return { id: todo.id, title: todo.title }
})

export const updateTodoToolDef = toolDefinition({
  name: 'updateTodo',
  description: 'Update an existing todo. Only provide fields you want to change.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priority: prioritySchema.optional(),
    dueDate: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional().describe('Set to current time to mark complete, null to mark incomplete'),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    completedAt: z.string().nullable(),
  }),
})

export const updateTodo = updateTodoToolDef.server(async (input) => {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description
  if (input.priority !== undefined) data.priority = input.priority
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.completedAt !== undefined) data.completedAt = input.completedAt ? new Date(input.completedAt) : null
  
  const todo = await prisma.todo.update({
    where: { id: input.id, userId: input.userId },
    data,
  })
  return {
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt?.toISOString() ?? null,
  }
})

export const deleteTodoToolDef = toolDefinition({
  name: 'deleteTodo',
  description: 'Delete a todo by ID.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
})

export const deleteTodo = deleteTodoToolDef.server(async (input) => {
  await prisma.todo.delete({ where: { id: input.id, userId: input.userId } })
  return { success: true }
})

export const updateTodoAiNotesToolDef = toolDefinition({
  name: 'updateTodoAiNotes',
  description: 'Update the AI notes for a todo. This is private AI-only metadata.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    aiNotes: z.string().nullable(),
  }),
  outputSchema: z.object({ id: z.string(), aiNotes: z.string().nullable() }),
})

export const updateTodoAiNotes = updateTodoAiNotesToolDef.server(async (input) => {
  const todo = await prisma.todo.update({
    where: { id: input.id, userId: input.userId },
    data: { aiNotes: input.aiNotes },
  })
  return { id: todo.id, aiNotes: todo.aiNotes }
})

// =============================================================================
// JAR TOOLS
// =============================================================================

export const listJarsToolDef = toolDefinition({
  name: 'listJars',
  description: 'List all jars for the user. Jars are containers/categories for organizing todos and notes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    nameContains: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const listJars = listJarsToolDef.server(async (input) => {
  const where: any = { userId: input.userId }
  if (input.nameContains) {
    where.name = { contains: input.nameContains, mode: 'insensitive' }
  }
  const jars = await prisma.jar.findMany({
    where,
    take: input.limit,
    orderBy: { name: 'asc' },
  })
  return jars.map(j => ({
    id: j.id,
    name: j.name,
    description: j.description,
    aiNotes: j.aiNotes,
  }))
})

export const searchJarsToolDef = toolDefinition({
  name: 'searchJars',
  description: 'Search jars by fuzzy text match across name, description, and aiNotes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    query: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const searchJars = searchJarsToolDef.server(async (input) => {
  const jars = await prisma.jar.findMany({
    where: {
      userId: input.userId,
      OR: [
        { name: { contains: input.query, mode: 'insensitive' } },
        { description: { contains: input.query, mode: 'insensitive' } },
        { aiNotes: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    take: input.limit,
  })
  return jars.map(j => ({
    id: j.id,
    name: j.name,
    description: j.description,
    aiNotes: j.aiNotes,
  }))
})

export const getJarsByIdToolDef = toolDefinition({
  name: 'getJarsById',
  description: 'Get specific jars by their IDs.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const getJarsById = getJarsByIdToolDef.server(async (input) => {
  const jars = await prisma.jar.findMany({
    where: { id: { in: input.ids }, userId: input.userId },
  })
  return jars.map(j => ({
    id: j.id,
    name: j.name,
    description: j.description,
    aiNotes: j.aiNotes,
  }))
})

export const createJarToolDef = toolDefinition({
  name: 'createJar',
  description: 'Create a new jar. Jar names must be alphanumeric with hyphens/underscores only.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Only alphanumeric, hyphens, and underscores allowed'),
    description: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
})

export const createJar = createJarToolDef.server(async (input) => {
  const jar = await prisma.jar.create({
    data: {
      name: input.name,
      description: input.description,
      userId: input.userId,
    },
  })
  return { id: jar.id, name: jar.name }
})

export const updateJarToolDef = toolDefinition({
  name: 'updateJar',
  description: 'Update an existing jar.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    description: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
})

export const updateJar = updateJarToolDef.server(async (input) => {
  const data: any = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  
  const jar = await prisma.jar.update({
    where: { id: input.id, userId: input.userId },
    data,
  })
  return { id: jar.id, name: jar.name }
})

export const deleteJarToolDef = toolDefinition({
  name: 'deleteJar',
  description: 'Delete a jar by ID.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
})

export const deleteJar = deleteJarToolDef.server(async (input) => {
  await prisma.jar.delete({ where: { id: input.id, userId: input.userId } })
  return { success: true }
})

export const updateJarAiNotesToolDef = toolDefinition({
  name: 'updateJarAiNotes',
  description: 'Update the AI notes for a jar.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    aiNotes: z.string().nullable(),
  }),
  outputSchema: z.object({ id: z.string(), aiNotes: z.string().nullable() }),
})

export const updateJarAiNotes = updateJarAiNotesToolDef.server(async (input) => {
  const jar = await prisma.jar.update({
    where: { id: input.id, userId: input.userId },
    data: { aiNotes: input.aiNotes },
  })
  return { id: jar.id, aiNotes: jar.aiNotes }
})

// =============================================================================
// TAG TOOLS
// =============================================================================

export const listTagsToolDef = toolDefinition({
  name: 'listTags',
  description: 'List all tags for the user. Tags are labels for categorizing todos and notes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    nameContains: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const listTags = listTagsToolDef.server(async (input) => {
  const where: any = { userId: input.userId }
  if (input.nameContains) {
    where.name = { contains: input.nameContains, mode: 'insensitive' }
  }
  const tags = await prisma.tag.findMany({
    where,
    take: input.limit,
    orderBy: { name: 'asc' },
  })
  return tags.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    aiNotes: t.aiNotes,
  }))
})

export const searchTagsToolDef = toolDefinition({
  name: 'searchTags',
  description: 'Search tags by fuzzy text match across name, description, and aiNotes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    query: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const searchTags = searchTagsToolDef.server(async (input) => {
  const tags = await prisma.tag.findMany({
    where: {
      userId: input.userId,
      OR: [
        { name: { contains: input.query, mode: 'insensitive' } },
        { description: { contains: input.query, mode: 'insensitive' } },
        { aiNotes: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    take: input.limit,
  })
  return tags.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    aiNotes: t.aiNotes,
  }))
})

export const getTagsByIdToolDef = toolDefinition({
  name: 'getTagsById',
  description: 'Get specific tags by their IDs.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    aiNotes: z.string().nullable(),
  })),
})

export const getTagsById = getTagsByIdToolDef.server(async (input) => {
  const tags = await prisma.tag.findMany({
    where: { id: { in: input.ids }, userId: input.userId },
  })
  return tags.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    aiNotes: t.aiNotes,
  }))
})

export const createTagToolDef = toolDefinition({
  name: 'createTag',
  description: 'Create a new tag. Tag names must be alphanumeric with hyphens/underscores only.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Only alphanumeric, hyphens, and underscores allowed'),
    description: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
})

export const createTag = createTagToolDef.server(async (input) => {
  const tag = await prisma.tag.create({
    data: {
      name: input.name,
      description: input.description,
      userId: input.userId,
    },
  })
  return { id: tag.id, name: tag.name }
})

export const updateTagToolDef = toolDefinition({
  name: 'updateTag',
  description: 'Update an existing tag.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    description: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
})

export const updateTag = updateTagToolDef.server(async (input) => {
  const data: any = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  
  const tag = await prisma.tag.update({
    where: { id: input.id, userId: input.userId },
    data,
  })
  return { id: tag.id, name: tag.name }
})

export const deleteTagToolDef = toolDefinition({
  name: 'deleteTag',
  description: 'Delete a tag by ID.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
})

export const deleteTag = deleteTagToolDef.server(async (input) => {
  await prisma.tag.delete({ where: { id: input.id, userId: input.userId } })
  return { success: true }
})

export const updateTagAiNotesToolDef = toolDefinition({
  name: 'updateTagAiNotes',
  description: 'Update the AI notes for a tag.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    aiNotes: z.string().nullable(),
  }),
  outputSchema: z.object({ id: z.string(), aiNotes: z.string().nullable() }),
})

export const updateTagAiNotes = updateTagAiNotesToolDef.server(async (input) => {
  const tag = await prisma.tag.update({
    where: { id: input.id, userId: input.userId },
    data: { aiNotes: input.aiNotes },
  })
  return { id: tag.id, aiNotes: tag.aiNotes }
})

// =============================================================================
// NOTE TOOLS
// =============================================================================

export const listNotesToolDef = toolDefinition({
  name: 'listNotes',
  description: 'List all notes for the user.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    textSearch: z.string().optional(),
    jarIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    aiNotes: z.string().nullable(),
    createdAt: z.string(),
    jars: z.array(z.object({ id: z.string(), name: z.string() })),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
})

export const listNotes = listNotesToolDef.server(async (input) => {
  const where: any = { userId: input.userId }
  
  if (input.textSearch) {
    where.OR = [
      { title: { contains: input.textSearch, mode: 'insensitive' } },
      { content: { contains: input.textSearch, mode: 'insensitive' } },
    ]
  }
  
  if (input.jarIds?.length) {
    where.jars = { some: { id: { in: input.jarIds } } }
  }
  
  if (input.tagIds?.length) {
    where.tags = { some: { id: { in: input.tagIds } } }
  }
  
  const notes = await prisma.note.findMany({
    where,
    take: input.limit,
    include: { jars: true, tags: true },
    orderBy: { createdAt: 'desc' },
  })
  
  return notes.map(n => ({
    id: n.id,
    title: n.title,
    content: n.content,
    aiNotes: n.aiNotes,
    createdAt: n.createdAt.toISOString(),
    jars: n.jars.map(j => ({ id: j.id, name: j.name })),
    tags: n.tags.map(t => ({ id: t.id, name: t.name })),
  }))
})

export const searchNotesToolDef = toolDefinition({
  name: 'searchNotes',
  description: 'Search notes by fuzzy text match across title, content, and aiNotes.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    query: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    aiNotes: z.string().nullable(),
  })),
})

export const searchNotes = searchNotesToolDef.server(async (input) => {
  const notes = await prisma.note.findMany({
    where: {
      userId: input.userId,
      OR: [
        { title: { contains: input.query, mode: 'insensitive' } },
        { content: { contains: input.query, mode: 'insensitive' } },
        { aiNotes: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    take: input.limit,
  })
  return notes.map(n => ({
    id: n.id,
    title: n.title,
    content: n.content,
    aiNotes: n.aiNotes,
  }))
})

export const getNotesByIdToolDef = toolDefinition({
  name: 'getNotesById',
  description: 'Get specific notes by their IDs.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    aiNotes: z.string().nullable(),
    jars: z.array(z.object({ id: z.string(), name: z.string() })),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
})

export const getNotesById = getNotesByIdToolDef.server(async (input) => {
  const notes = await prisma.note.findMany({
    where: { id: { in: input.ids }, userId: input.userId },
    include: { jars: true, tags: true },
  })
  return notes.map(n => ({
    id: n.id,
    title: n.title,
    content: n.content,
    aiNotes: n.aiNotes,
    jars: n.jars.map(j => ({ id: j.id, name: j.name })),
    tags: n.tags.map(t => ({ id: t.id, name: t.name })),
  }))
})

export const createNoteToolDef = toolDefinition({
  name: 'createNote',
  description: 'Create a new note.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    title: z.string().optional(),
    content: z.string().min(1),
    jarIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string().nullable() }),
})

export const createNote = createNoteToolDef.server(async (input) => {
  const note = await prisma.note.create({
    data: {
      title: input.title,
      content: input.content,
      userId: input.userId,
      jars: input.jarIds?.length ? { connect: input.jarIds.map(id => ({ id })) } : undefined,
      tags: input.tagIds?.length ? { connect: input.tagIds.map(id => ({ id })) } : undefined,
    },
  })
  return { id: note.id, title: note.title }
})

export const updateNoteToolDef = toolDefinition({
  name: 'updateNote',
  description: 'Update an existing note.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    title: z.string().optional(),
    content: z.string().min(1).optional(),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string().nullable() }),
})

export const updateNote = updateNoteToolDef.server(async (input) => {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) data.content = input.content
  
  const note = await prisma.note.update({
    where: { id: input.id, userId: input.userId },
    data,
  })
  return { id: note.id, title: note.title }
})

export const deleteNoteToolDef = toolDefinition({
  name: 'deleteNote',
  description: 'Delete a note by ID.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
})

export const deleteNote = deleteNoteToolDef.server(async (input) => {
  await prisma.note.delete({ where: { id: input.id, userId: input.userId } })
  return { success: true }
})

export const updateNoteAiNotesToolDef = toolDefinition({
  name: 'updateNoteAiNotes',
  description: 'Update the AI notes for a note.',
  inputSchema: z.object({
    userId: z.string().uuid(),
    id: z.string().uuid(),
    aiNotes: z.string().nullable(),
  }),
  outputSchema: z.object({ id: z.string(), aiNotes: z.string().nullable() }),
})

export const updateNoteAiNotes = updateNoteAiNotesToolDef.server(async (input) => {
  const note = await prisma.note.update({
    where: { id: input.id, userId: input.userId },
    data: { aiNotes: input.aiNotes },
  })
  return { id: note.id, aiNotes: note.aiNotes }
})

// =============================================================================
// EXPORT ALL TOOLS
// =============================================================================

// Tool definitions (for Ollama format conversion)
export const allToolDefs = [
  listTodosToolDef,
  searchTodosToolDef,
  getTodosByIdToolDef,
  createTodoToolDef,
  updateTodoToolDef,
  deleteTodoToolDef,
  updateTodoAiNotesToolDef,
  listJarsToolDef,
  searchJarsToolDef,
  getJarsByIdToolDef,
  createJarToolDef,
  updateJarToolDef,
  deleteJarToolDef,
  updateJarAiNotesToolDef,
  listTagsToolDef,
  searchTagsToolDef,
  getTagsByIdToolDef,
  createTagToolDef,
  updateTagToolDef,
  deleteTagToolDef,
  updateTagAiNotesToolDef,
  listNotesToolDef,
  searchNotesToolDef,
  getNotesByIdToolDef,
  createNoteToolDef,
  updateNoteToolDef,
  deleteNoteToolDef,
  updateNoteAiNotesToolDef,
]

// Server tool instances (for TanStack AI)
export const allAiTools = [
  // Todos
  listTodos,
  searchTodos,
  getTodosById,
  createTodo,
  updateTodo,
  deleteTodo,
  updateTodoAiNotes,
  // Jars
  listJars,
  searchJars,
  getJarsById,
  createJar,
  updateJar,
  deleteJar,
  updateJarAiNotes,
  // Tags
  listTags,
  searchTags,
  getTagsById,
  createTag,
  updateTag,
  deleteTag,
  updateTagAiNotes,
  // Notes
  listNotes,
  searchNotes,
  getNotesById,
  createNote,
  updateNote,
  deleteNote,
  updateNoteAiNotes,
]

// Create a map from tool name to executor function
// We need to duplicate the implementation here since ServerTool doesn't expose an execute method
export async function executeTool(toolName: string, input: any): Promise<any> {
  switch (toolName) {
    // Todos
    case 'listTodos': {
      const where: any = { userId: input.userId }
      if (typeof input.isCompleted === 'boolean') {
        where.completedAt = input.isCompleted ? { not: null } : null
      }
      if (input.textSearch) {
        where.OR = [
          { title: { contains: input.textSearch, mode: 'insensitive' } },
          { description: { contains: input.textSearch, mode: 'insensitive' } },
        ]
      }
      if (input.jarIds?.length) {
        where.jars = { some: { id: { in: input.jarIds } } }
      }
      if (input.tagIds?.length) {
        where.tags = { some: { id: { in: input.tagIds } } }
      }
      const todos = await prisma.todo.findMany({
        where,
        take: input.limit || 50,
        include: { jars: true, tags: true },
        orderBy: { createdAt: 'desc' },
      })
      return todos.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        aiNotes: t.aiNotes,
        completedAt: t.completedAt?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
        createdAt: t.createdAt.toISOString(),
        jars: t.jars.map(j => ({ id: j.id, name: j.name })),
        tags: t.tags.map(tag => ({ id: tag.id, name: tag.name })),
      }))
    }
    
    case 'searchTodos': {
      const todos = await prisma.todo.findMany({
        where: {
          userId: input.userId,
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
            { aiNotes: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit || 20,
      })
      return todos.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        aiNotes: t.aiNotes,
      }))
    }
    
    case 'getTodosById': {
      const todos = await prisma.todo.findMany({
        where: { id: { in: input.ids }, userId: input.userId },
        include: { jars: true, tags: true },
      })
      return todos.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        aiNotes: t.aiNotes,
        completedAt: t.completedAt?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
        jars: t.jars.map(j => ({ id: j.id, name: j.name })),
        tags: t.tags.map(tag => ({ id: tag.id, name: tag.name })),
      }))
    }
    
    case 'createTodo': {
      const todo = await prisma.todo.create({
        data: {
          title: input.title,
          description: input.description,
          userId: input.userId,
          priority: input.priority || 'MEDIUM',
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          jars: input.jarIds?.length ? { connect: input.jarIds.map((id: string) => ({ id })) } : undefined,
          tags: input.tagIds?.length ? { connect: input.tagIds.map((id: string) => ({ id })) } : undefined,
        },
      })
      return { id: todo.id, title: todo.title }
    }
    
    case 'updateTodo': {
      const data: any = {}
      if (input.title !== undefined) data.title = input.title
      if (input.description !== undefined) data.description = input.description
      if (input.priority !== undefined) data.priority = input.priority
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
      if (input.completedAt !== undefined) data.completedAt = input.completedAt ? new Date(input.completedAt) : null
      const todo = await prisma.todo.update({
        where: { id: input.id, userId: input.userId },
        data,
      })
      return { id: todo.id, title: todo.title, completedAt: todo.completedAt?.toISOString() ?? null }
    }
    
    case 'deleteTodo': {
      await prisma.todo.delete({ where: { id: input.id, userId: input.userId } })
      return { success: true }
    }
    
    case 'updateTodoAiNotes': {
      const todo = await prisma.todo.update({
        where: { id: input.id, userId: input.userId },
        data: { aiNotes: input.aiNotes },
      })
      return { id: todo.id, aiNotes: todo.aiNotes }
    }
    
    // Jars
    case 'listJars': {
      const where: any = { userId: input.userId }
      if (input.nameContains) {
        where.name = { contains: input.nameContains, mode: 'insensitive' }
      }
      const jars = await prisma.jar.findMany({
        where,
        take: input.limit || 50,
        orderBy: { name: 'asc' },
      })
      return jars.map(j => ({ id: j.id, name: j.name, description: j.description, aiNotes: j.aiNotes }))
    }
    
    case 'searchJars': {
      const jars = await prisma.jar.findMany({
        where: {
          userId: input.userId,
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
            { aiNotes: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit || 20,
      })
      return jars.map(j => ({ id: j.id, name: j.name, description: j.description, aiNotes: j.aiNotes }))
    }
    
    case 'getJarsById': {
      const jars = await prisma.jar.findMany({
        where: { id: { in: input.ids }, userId: input.userId },
      })
      return jars.map(j => ({ id: j.id, name: j.name, description: j.description, aiNotes: j.aiNotes }))
    }
    
    case 'createJar': {
      const jar = await prisma.jar.create({
        data: { name: input.name, description: input.description, userId: input.userId },
      })
      return { id: jar.id, name: jar.name }
    }
    
    case 'updateJar': {
      const data: any = {}
      if (input.name !== undefined) data.name = input.name
      if (input.description !== undefined) data.description = input.description
      const jar = await prisma.jar.update({
        where: { id: input.id, userId: input.userId },
        data,
      })
      return { id: jar.id, name: jar.name }
    }
    
    case 'deleteJar': {
      await prisma.jar.delete({ where: { id: input.id, userId: input.userId } })
      return { success: true }
    }
    
    case 'updateJarAiNotes': {
      const jar = await prisma.jar.update({
        where: { id: input.id, userId: input.userId },
        data: { aiNotes: input.aiNotes },
      })
      return { id: jar.id, aiNotes: jar.aiNotes }
    }
    
    // Tags
    case 'listTags': {
      const where: any = { userId: input.userId }
      if (input.nameContains) {
        where.name = { contains: input.nameContains, mode: 'insensitive' }
      }
      const tags = await prisma.tag.findMany({
        where,
        take: input.limit || 50,
        orderBy: { name: 'asc' },
      })
      return tags.map(t => ({ id: t.id, name: t.name, description: t.description, aiNotes: t.aiNotes }))
    }
    
    case 'searchTags': {
      const tags = await prisma.tag.findMany({
        where: {
          userId: input.userId,
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
            { aiNotes: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit || 20,
      })
      return tags.map(t => ({ id: t.id, name: t.name, description: t.description, aiNotes: t.aiNotes }))
    }
    
    case 'getTagsById': {
      const tags = await prisma.tag.findMany({
        where: { id: { in: input.ids }, userId: input.userId },
      })
      return tags.map(t => ({ id: t.id, name: t.name, description: t.description, aiNotes: t.aiNotes }))
    }
    
    case 'createTag': {
      const tag = await prisma.tag.create({
        data: { name: input.name, description: input.description, userId: input.userId },
      })
      return { id: tag.id, name: tag.name }
    }
    
    case 'updateTag': {
      const data: any = {}
      if (input.name !== undefined) data.name = input.name
      if (input.description !== undefined) data.description = input.description
      const tag = await prisma.tag.update({
        where: { id: input.id, userId: input.userId },
        data,
      })
      return { id: tag.id, name: tag.name }
    }
    
    case 'deleteTag': {
      await prisma.tag.delete({ where: { id: input.id, userId: input.userId } })
      return { success: true }
    }
    
    case 'updateTagAiNotes': {
      const tag = await prisma.tag.update({
        where: { id: input.id, userId: input.userId },
        data: { aiNotes: input.aiNotes },
      })
      return { id: tag.id, aiNotes: tag.aiNotes }
    }
    
    // Notes
    case 'listNotes': {
      const where: any = { userId: input.userId }
      if (input.textSearch) {
        where.OR = [
          { title: { contains: input.textSearch, mode: 'insensitive' } },
          { content: { contains: input.textSearch, mode: 'insensitive' } },
        ]
      }
      if (input.jarIds?.length) {
        where.jars = { some: { id: { in: input.jarIds } } }
      }
      if (input.tagIds?.length) {
        where.tags = { some: { id: { in: input.tagIds } } }
      }
      const notes = await prisma.note.findMany({
        where,
        take: input.limit || 50,
        include: { jars: true, tags: true },
        orderBy: { createdAt: 'desc' },
      })
      return notes.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content,
        aiNotes: n.aiNotes,
        createdAt: n.createdAt.toISOString(),
        jars: n.jars.map(j => ({ id: j.id, name: j.name })),
        tags: n.tags.map(t => ({ id: t.id, name: t.name })),
      }))
    }
    
    case 'searchNotes': {
      const notes = await prisma.note.findMany({
        where: {
          userId: input.userId,
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { content: { contains: input.query, mode: 'insensitive' } },
            { aiNotes: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit || 20,
      })
      return notes.map(n => ({ id: n.id, title: n.title, content: n.content, aiNotes: n.aiNotes }))
    }
    
    case 'getNotesById': {
      const notes = await prisma.note.findMany({
        where: { id: { in: input.ids }, userId: input.userId },
        include: { jars: true, tags: true },
      })
      return notes.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content,
        aiNotes: n.aiNotes,
        jars: n.jars.map(j => ({ id: j.id, name: j.name })),
        tags: n.tags.map(t => ({ id: t.id, name: t.name })),
      }))
    }
    
    case 'createNote': {
      const note = await prisma.note.create({
        data: {
          title: input.title,
          content: input.content,
          userId: input.userId,
          jars: input.jarIds?.length ? { connect: input.jarIds.map((id: string) => ({ id })) } : undefined,
          tags: input.tagIds?.length ? { connect: input.tagIds.map((id: string) => ({ id })) } : undefined,
        },
      })
      return { id: note.id, title: note.title }
    }
    
    case 'updateNote': {
      const data: any = {}
      if (input.title !== undefined) data.title = input.title
      if (input.content !== undefined) data.content = input.content
      const note = await prisma.note.update({
        where: { id: input.id, userId: input.userId },
        data,
      })
      return { id: note.id, title: note.title }
    }
    
    case 'deleteNote': {
      await prisma.note.delete({ where: { id: input.id, userId: input.userId } })
      return { success: true }
    }
    
    case 'updateNoteAiNotes': {
      const note = await prisma.note.update({
        where: { id: input.id, userId: input.userId },
        data: { aiNotes: input.aiNotes },
      })
      return { id: note.id, aiNotes: note.aiNotes }
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}


