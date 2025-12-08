import { z } from 'zod'
import type { TRPCRouterRecord } from '@trpc/server'

import { createTRPCRouter, publicProcedure, protectedProcedure } from './init'
import { prisma } from '@/db'

const todosRouter = {
  list: publicProcedure.query(async () => {
    const todos = await prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return todos
  }),

  add: protectedProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ input, ctx }) => {
      console.log('todos.add called with', input, 'by user', ctx.user?.id)

      try {
        const newTodo = await prisma.todo.create({
          data: {
            title: input.title,
            // later you can add ownerId: ctx.user!.id when you add that field
          },
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