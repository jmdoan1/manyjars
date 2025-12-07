import { z } from 'zod'
import type { TRPCRouterRecord } from '@trpc/server'

import { createTRPCRouter, publicProcedure } from './init'
import { prisma } from '@/db' // <- Prisma client from src/db.ts

const todosRouter = {
  list: publicProcedure.query(async () => {
    const todos = await prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return todos
  }),
  add: publicProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ input }) => {
      console.log('todos.add called with', input)
      try {
        const newTodo = await prisma.todo.create({
          data: { title: input.title },
        })
        console.log('todos.add created', newTodo)
        return newTodo
      } catch (err) {
        console.error('todos.add error', err)
        throw err
      }
    }),
} satisfies TRPCRouterRecord

export const trpcRouter = createTRPCRouter({
  todos: todosRouter,
})
export type TRPCRouter = typeof trpcRouter