import { createClerkClient } from '@clerk/backend'
import { prisma } from '@/db'

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('Missing CLERK_SECRET_KEY in environment')
}

if (!process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment')
}

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY!,
})

type DbUser = Awaited<ReturnType<typeof prisma.user.findUnique>> | null

export type TRPCContext = {
  clerkUserId: string | null
  user: DbUser
}

export async function createTRPCContext(opts: {
  req: Request
}): Promise<TRPCContext> {
  const { req } = opts

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
}