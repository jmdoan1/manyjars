import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { MentionRow } from '@/hooks/use-mentions'

interface MentionPopupProps {
  rows: MentionRow[]
  highlightedIndex: number
  position: { top: number; left: number } | null
  visible: boolean
  currentType?: 'jar' | 'tag' | 'priority'
  onSelectRow: (row: MentionRow) => void
  onHoverIndex?: (index: number) => void
  onClickOutside?: () => void
  className?: string
}

export function MentionPopup({
  rows,
  highlightedIndex,
  position,
  visible,
  currentType,
  onSelectRow,
  onHoverIndex,
  onClickOutside,
  className = '',
}: MentionPopupProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside?.()
      }
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [visible, onClickOutside])

  if (!visible || !position || rows.length === 0) return null

  // Use createPortal to render outside of the container to avoid overflow
  // Note: Position provided must be relative to the viewport/document body
  return createPortal(
    <div
      ref={ref}
      className={`fixed z-[9999] w-72 ${className}`}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <Command className="rounded-md border border-white/20 bg-slate-900/95 text-sm text-white shadow-lg">
        <CommandList>
          <CommandEmpty className="px-3 py-2 text-xs text-white/60">
            No matches.
          </CommandEmpty>
          <CommandGroup>
            {rows.map((row, index) => {
              const isActive = index === highlightedIndex

              if (row.kind === 'typed') {
                return (
                  <CommandItem
                    key="typed"
                    value={row.label}
                    onSelect={() => onSelectRow(row)}
                    onMouseEnter={() => onHoverIndex?.(index)}
                    className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                      isActive ? 'bg-purple-500/20' : ''
                    }`}
                  >
                    <span className="text-white">{row.label}</span>
                    <span className="text-[11px] text-white/60">
                      {row.description}
                    </span>
                  </CommandItem>
                )
              }

              if (row.kind === 'priority') {
                return (
                  <CommandItem
                    key={row.option.code}
                    value={row.option.token}
                    onSelect={() => onSelectRow(row)}
                    onMouseEnter={() => onHoverIndex?.(index)}
                    className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                      isActive ? 'bg-purple-500/20' : ''
                    }`}
                  >
                    <span className="text-white">
                      !{row.option.token}
                    </span>
                    <span className="text-[11px] text-white/60">
                      {row.option.label} — {row.option.description}
                    </span>
                  </CommandItem>
                )
              }

              // suggestion row
              return (
                <CommandItem
                  key={row.item.id}
                  value={row.item.name}
                  onSelect={() => onSelectRow(row)}
                  onMouseEnter={() => onHoverIndex?.(index)}
                  className={`flex items-center gap-2 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
                    isActive ? 'bg-purple-500/20' : ''
                  } text-white`}
                >
                  <span>
                    {currentType === 'jar'
                      ? '@'
                      : currentType === 'tag'
                      ? '#'
                      : ''}
                    {row.item.name}
                  </span>
                  {row.item.description && (
                    <span className="ml-2 text-[11px] text-white/60 truncate">
                      {row.item.description}
                    </span>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>,
    document.body
  )
}
