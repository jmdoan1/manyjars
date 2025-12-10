
import { useState, useEffect, useRef } from "react"
import { Filter, Check } from "lucide-react"
import { PRIORITY_LABEL, type PriorityCode } from "@/hooks/use-mentions"

type FilterProps = {
  jars?: {
    id: string
    name: string
  }[]
  tags?: {
    id: string
    name: string
  }[]
  selectedJarIds?: string[]
  selectedTagIds?: string[]
  selectedPriorities?: string[]
  onFilterChange: (filters: {
    jarIds: string[]
    tagIds: string[]
    priorities: string[]
  }) => void
  showPriority?: boolean
  hideJars?: boolean
  hideTags?: boolean
}

export function ModuleFilter({
  jars = [],
  tags = [],
  selectedJarIds = [],
  selectedTagIds = [],
  selectedPriorities = [],
  onFilterChange,
  showPriority = true,
  hideJars = false,
  hideTags = false,
}: FilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const handleToggleJar = (id: string) => {
    const newIds = selectedJarIds.includes(id)
      ? selectedJarIds.filter((i) => i !== id)
      : [...selectedJarIds, id]
    
    onFilterChange({
      jarIds: newIds,
      tagIds: selectedTagIds,
      priorities: selectedPriorities,
    })
  }

  const handleToggleTag = (id: string) => {
    const newIds = selectedTagIds.includes(id)
      ? selectedTagIds.filter((i) => i !== id)
      : [...selectedTagIds, id]
    
    onFilterChange({
      jarIds: selectedJarIds,
      tagIds: newIds,
      priorities: selectedPriorities,
    })
  }

  const handleTogglePriority = (priority: string) => {
    const newPriorities = selectedPriorities.includes(priority)
      ? selectedPriorities.filter((p) => p !== priority)
      : [...selectedPriorities, priority]

    onFilterChange({
      jarIds: selectedJarIds,
      tagIds: selectedTagIds,
      priorities: newPriorities,
    })
  }

  const handleClearAll = () => {
    onFilterChange({
      jarIds: [],
      tagIds: [],
      priorities: [],
    })
  }

  const activeCount =
    selectedJarIds.length + selectedTagIds.length + selectedPriorities.length

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
          activeCount > 0
            ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
            : "bg-white/5 border-white/10 text-white/70 hover:text-white"
        }`}
      >
        <Filter className="w-4 h-4" />
        <span>Filter</span>
        {activeCount > 0 && (
          <span className="bg-purple-500 text-white text-[10px] px-1.5 rounded-full min-w-[1.25rem] h-5 flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 max-h-[80vh] overflow-y-auto bg-[#1a1b26] border border-white/10 rounded-xl shadow-xl z-50 p-4 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-medium text-white">Filters</span>
            {activeCount > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Jars Section */}
          {!hideJars && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Jars
            </h3>
            <div className="flex flex-wrap gap-2">
              {jars.length === 0 && (
                <span className="text-xs text-white/30 italic">No jars found</span>
              )}
              {jars.map((jar) => {
                const isSelected = selectedJarIds.includes(jar.id)
                return (
                  <button
                    key={jar.id}
                    onClick={() => handleToggleJar(jar.id)}
                    className={`text-xs px-2 py-1 rounded-full border transition-all flex items-center gap-1 ${
                      isSelected
                        ? "bg-purple-500/30 border-purple-500/50 text-purple-100"
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <span>@{jar.name}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {/* Tags Section */}
          {!hideTags && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && (
                <span className="text-xs text-white/30 italic">No tags found</span>
              )}
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(tag.id)}
                    className={`text-xs px-2 py-1 rounded-full border transition-all flex items-center gap-1 ${
                      isSelected
                        ? "bg-teal-500/30 border-teal-500/50 text-teal-100"
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <span>#{tag.name}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {/* Priority Section */}
          {showPriority && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Priority
              </h3>
              <div className="flex flex-wrap gap-2">
                {(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "VERY_LOW"] as const).map(
                  (p) => {
                    const isSelected = selectedPriorities.includes(p)
                    return (
                      <button
                        key={p}
                        onClick={() => handleTogglePriority(p)}
                        className={`text-xs px-2 py-1 rounded-full border transition-all flex items-center gap-1 ${
                          isSelected
                            ? "bg-blue-500/30 border-blue-500/50 text-blue-100"
                            : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                        }`}
                      >
                        <span>{PRIORITY_LABEL[p as PriorityCode]}</span>
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    )
                  }
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
