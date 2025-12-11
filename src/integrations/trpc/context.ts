import { createClerkClient } from '@clerk/backend'
import { prisma } from '@/db'

// Clerk client - may be null if environment variables aren't set (e.g., WebSocket server context)
let clerk: ReturnType<typeof createClerkClient> | null = null

try {
  if (process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    })
  }
} catch (e) {
  console.warn('[trpc-context] Clerk client not initialized:', e)
}

type DbUser = Awaited<ReturnType<typeof prisma.user.findUnique>> | null

export type TRPCContext = {
  clerkUserId: string | null
  user: DbUser
}

export async function createTRPCContext(opts: {
  req: Request
}): Promise<TRPCContext> {
  const { req } = opts

  // If Clerk isn't available (e.g., WebSocket context), return unauthenticated
  if (!clerk) {
    return { clerkUserId: null, user: null }
  }

  try {
    // authenticate the actual Request object
    const requestState = await clerk.authenticateRequest(req)
    const auth = requestState.toAuth()
    const clerkUserId = auth?.userId ?? null

    if (!clerkUserId) {
      // unauthenticated
      return { clerkUserId: null, user: null }
    }

    let user = await prisma.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      const clerkUser = await clerk.users.getUser(clerkUserId)

      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        ''

      const displayName =
        clerkUser.username ??
        [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ??
        email

      user = await prisma.user.create({
        data: {
          clerkUserId,
          email,
          displayName,
        },
      })
    }

    return { clerkUserId, user }
  } catch (e) {
    console.warn('[trpc-context] Auth failed:', e)
    return { clerkUserId: null, user: null }
  }
}