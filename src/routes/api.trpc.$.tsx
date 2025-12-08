import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '@/integrations/trpc/router'
import { createTRPCContext } from '@/integrations/trpc/context'
import { createFileRoute } from '@tanstack/react-router'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',
    createContext: () => createTRPCContext({ req: request }),
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  // @ts-expect-error - TanStack Start server handlers are not fully typed yet
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})