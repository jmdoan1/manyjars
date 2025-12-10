import { useState } from "react"
import { ArrowUpDown, Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type SortOption = {
  label: string
  value: string
}

type ModuleSortProps = {
  options: SortOption[]
  value: string
  onSortChange: (value: string) => void
}

export function ModuleSort({ options, value, onSortChange }: ModuleSortProps) {
  const [isOpen, setIsOpen] = useState(false)

  const selectedLabel = options.find((o) => o.value === value)?.label

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
            value
              ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
              : "bg-white/5 border-white/10 text-white/70 hover:text-white"
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>{selectedLabel || "Sort"}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-48 bg-[#1a1b26] border-white/10 text-white p-1"
        align="end"
        sideOffset={8}
      >
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSortChange(option.value)
                setIsOpen(false)
              }}
              className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
                value === option.value
                  ? "bg-purple-500/20 text-purple-200"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
