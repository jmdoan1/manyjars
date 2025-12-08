import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  // downstream resolvers now see ctx.user as non-null
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})