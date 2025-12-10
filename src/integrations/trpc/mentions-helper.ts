
import { parseMentions, type PriorityCode } from '@/hooks/use-mentions'
import { prisma } from '@/db'

interface ExtractedMentions {
  jars: any[]
  tags: any[]
  priority?: PriorityCode
}

export async function extractAndEnsureMentions(
  texts: (string | undefined | null)[],
  userId: string,
): Promise<ExtractedMentions> {
  // 1. Collect all jar/tag names from all provided text fields
  const jarNames = new Set<string>()
  const tagNames = new Set<string>()
  let priority: PriorityCode | undefined

  for (const text of texts) {
    if (!text) continue
    const parsed = parseMentions(text)
    parsed.jars.forEach((j) => jarNames.add(j))
    parsed.tags.forEach((t) => tagNames.add(t))
    if (parsed.priority) {
      // If multiple texts have priority, the last one wins, or we can prioritize specific fields if needed.
      // For now, let's say last valid one wins.
      priority = parsed.priority
    }
  }

  // 2. Upsert Jars and Tags to ensure they exist
  const jarModels = await Promise.all(
    Array.from(jarNames).map((name) =>
      prisma.jar.upsert({
        where: {
          userId_name: {
            userId: userId,
            name: name,
          },
        },
        create: {
          name: name,
          userId: userId,
        },
        update: {},
      }),
    ),
  )

  const tagModels = await Promise.all(
    Array.from(tagNames).map((name) =>
      prisma.tag.upsert({
        where: {
          userId_name: {
            userId: userId,
            name: name,
          },
        },
        create: {
          name: name,
          userId: userId,
        },
        update: {},
      }),
    ),
  )

  return {
    jars: jarModels,
    tags: tagModels,
    priority,
  }
}
