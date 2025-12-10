
import { cn } from "@/lib/utils"

type EntityPillProps = {
  jars?: { id: string; name: string }[]
  tags?: { id: string; name: string }[]
  className?: string
}

export function EntityPills({ jars = [], tags = [], className }: EntityPillProps) {
  if ((!jars?.length && !tags?.length)) return null

  const allJars = jars || []
  const allTags = tags || []
  
  // Optional: functionality to show only N items if space is constrained
  // For now we just render all given
  
  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", className)}>
      {allJars.map((jar) => (
        <span
          key={jar.id}
          className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 border border-purple-500/20 text-purple-300"
        >
          <span className="text-[10px] opacity-70">@</span>
          <span className="text-xs font-medium">{jar.name}</span>
        </span>
      ))}
      
      {allTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 border border-blue-500/20 text-blue-300"
        >
          <span className="text-[10px] opacity-70">#</span>
          <span className="text-xs font-medium">{tag.name}</span>
        </span>
      ))}
    </div>
  )
}
