// src/hooks/use-mentions.ts
// Centralized mention detection and suggestion logic for @jar, #tag, !priority

import { useState, useCallback, useMemo, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

export type MentionType = 'jar' | 'tag' | 'priority'

export interface ActiveMention {
  type: MentionType
  query: string
  /** Character offset where the mention token starts (e.g., position of @) */
  start: number
  /** Character offset where the mention token ends (cursor position) */
  end: number
}

export interface MentionPosition {
  top: number
  left: number
}

export type PriorityCode =
  | 'VERY_LOW'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'VERY_HIGH'

export interface PriorityOption {
  code: PriorityCode
  token: string
  label: string
  description: string
}

export interface MentionItem {
  id: string
  name: string
  description?: string | null
}

export type MentionRow =
  | { kind: 'typed'; label: string; description: string }
  | { kind: 'suggestion'; item: MentionItem }
  | { kind: 'priority'; option: PriorityOption }

// ============================================================================
// Constants
// ============================================================================

export const PRIORITY_OPTIONS: PriorityOption[] = [
  { code: 'VERY_LOW', token: 'very-low', label: 'Very low', description: 'Lowest urgency' },
  { code: 'LOW', token: 'low', label: 'Low', description: 'Nice to do' },
  { code: 'MEDIUM', token: 'medium', label: 'Medium', description: 'Default priority' },
  { code: 'HIGH', token: 'high', label: 'High', description: 'Important soon' },
  { code: 'VERY_HIGH', token: 'very-high', label: 'Very high', description: 'Top of your stack' },
]

export const PRIORITY_TOKEN_MAP: Record<string, PriorityCode> = {
  'very-low': 'VERY_LOW',
  vlow: 'VERY_LOW',
  vl: 'VERY_LOW',
  low: 'LOW',
  l: 'LOW',
  medium: 'MEDIUM',
  med: 'MEDIUM',
  m: 'MEDIUM',
  high: 'HIGH',
  h: 'HIGH',
  'very-high': 'VERY_HIGH',
  vhigh: 'VERY_HIGH',
  vh: 'VERY_HIGH',
}

export const PRIORITY_LABEL: Record<PriorityCode, string> = {
  VERY_LOW: 'Very low',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  VERY_HIGH: 'Very high',
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Detects if there's an active mention at the cursor position.
 * Works with plain text - pass the text content and cursor position.
 */
export function getActiveMention(text: string, caret: number): ActiveMention | null {
  const beforeCaret = text.slice(0, caret)

  const lastSeparator = Math.max(
    beforeCaret.lastIndexOf(' '),
    beforeCaret.lastIndexOf('\n'),
    beforeCaret.lastIndexOf('\t'),
  )

  const tokenStart = lastSeparator + 1
  const token = beforeCaret.slice(tokenStart)

  if (token.startsWith('@')) {
    return {
      type: 'jar',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  if (token.startsWith('#')) {
    return {
      type: 'tag',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  if (token.startsWith('!')) {
    return {
      type: 'priority',
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    }
  }

  return null
}

/**
 * Parses text to extract all jars, tags, and priority.
 */
export function parseMentions(text: string): {
  jars: string[]
  tags: string[]
  priority?: PriorityCode
} {
  const jarNames = new Set<string>()
  const tagNames = new Set<string>()

  const jarRegex = /@([a-zA-Z0-9_-]+)/g
  const tagRegex = /#([a-zA-Z0-9_-]+)/g

  let m: RegExpExecArray | null
  while ((m = jarRegex.exec(text)) !== null) {
    jarNames.add(m[1])
  }
  while ((m = tagRegex.exec(text)) !== null) {
    tagNames.add(m[1])
  }

  let priority: PriorityCode | undefined
  const pMatch = text.match(/!([a-zA-Z-]+)/)
  if (pMatch) {
    const key = (pMatch[1] ?? '').toLowerCase()
    priority = PRIORITY_TOKEN_MAP[key]
  }

  return {
    jars: Array.from(jarNames),
    tags: Array.from(tagNames),
    priority,
  }
}

/**
 * Strips priority tokens from text (for cleaned display/storage).
 */
export function stripPriorityTokens(text: string): string {
  return text
    .replace(/!([a-zA-Z-]+)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds the replacement string for a mention.
 */
export function buildMentionReplacement(type: MentionType, value: string): string {
  const prefix = type === 'jar' ? '@' : type === 'tag' ? '#' : '!'
  return `${prefix}${value} `
}

/**
 * Filters and builds suggestion rows for the popup.
 */
export function buildSuggestionRows(
  mention: ActiveMention | null,
  jars: MentionItem[],
  tags: MentionItem[],
  maxSuggestions = 5,
): MentionRow[] {
  if (!mention) return []

  const query = mention.query.toLowerCase()
  const rows: MentionRow[] = []

  if (mention.type === 'priority') {
    let opts = PRIORITY_OPTIONS
    if (query) {
      opts = opts.filter(
        (opt) =>
          opt.label.toLowerCase().includes(query) ||
          opt.token.startsWith(query),
      )
    }
    for (const opt of opts) {
      rows.push({ kind: 'priority', option: opt })
    }
  } else {
    // jar or tag
    const list = mention.type === 'jar' ? jars : tags
    let filtered = list
    if (query) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().startsWith(query),
      )
    }
    filtered = filtered.slice(0, maxSuggestions)

    // Add "typed" option first if user has typed something
    if (query) {
      const prefix = mention.type === 'jar' ? '@' : '#'
      rows.push({
        kind: 'typed',
        label: `${prefix}${mention.query}`,
        description:
          mention.type === 'jar'
            ? 'Use this as a new jar'
            : 'Use this as a new tag',
      })
    }

    for (const item of filtered) {
      rows.push({ kind: 'suggestion', item })
    }
  }

  return rows
}

// ============================================================================
// Hook: useMentionSuggestions
// ============================================================================

export interface UseMentionSuggestionsOptions {
  jars: MentionItem[]
  tags: MentionItem[]
  maxSuggestions?: number
}

export interface UseMentionSuggestionsReturn {
  /** The currently active mention (if any) */
  activeMention: ActiveMention | null
  /** Set the active mention (call when text/cursor changes) */
  setActiveMention: (mention: ActiveMention | null) => void
  /** Position for the popup */
  mentionPosition: MentionPosition | null
  /** Set the popup position */
  setMentionPosition: (pos: MentionPosition | null) => void
  /** Currently highlighted row index */
  highlightedIndex: number
  /** Set highlighted index */
  setHighlightedIndex: (index: number) => void
  /** The suggestion rows to display */
  rows: MentionRow[]
  /** Whether the popup should be visible */
  isOpen: boolean
  /** Close the popup */
  close: () => void
  /** Handle keyboard navigation - returns true if event was handled */
  handleKeyDown: (key: string, shiftKey: boolean) => { handled: boolean; selectedRow?: MentionRow }
  /** Get the selected row value (token like "jar-name" or "high") */
  getSelectedValue: (row: MentionRow) => string
}

export function useMentionSuggestions({
  jars,
  tags,
  maxSuggestions = 5,
}: UseMentionSuggestionsOptions): UseMentionSuggestionsReturn {
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null)
  const [mentionPosition, setMentionPosition] = useState<MentionPosition | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const rows = useMemo(
    () => buildSuggestionRows(activeMention, jars, tags, maxSuggestions),
    [activeMention, jars, tags, maxSuggestions],
  )

  const isOpen = activeMention !== null && rows.length > 0

  // Reset highlighted index when mention changes
  useEffect(() => {
    if (activeMention && rows.length > 0) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [activeMention, rows.length])

  const close = useCallback(() => {
    setActiveMention(null)
    setMentionPosition(null)
    setHighlightedIndex(-1)
  }, [])

  const getSelectedValue = useCallback((row: MentionRow): string => {
    if (row.kind === 'typed') {
      // Return just the query part (without prefix)
      return row.label.slice(1) // Remove @ or #
    }
    if (row.kind === 'suggestion') {
      return row.item.name
    }
    if (row.kind === 'priority') {
      return row.option.token
    }
    return ''
  }, [])

  const handleKeyDown = useCallback(
    (key: string, shiftKey: boolean): { handled: boolean; selectedRow?: MentionRow } => {
      if (!isOpen) return { handled: false }

      if (key === 'ArrowDown') {
        setHighlightedIndex((prev) => {
          if (rows.length === 0) return -1
          const next = prev < rows.length - 1 ? prev + 1 : 0
          return next
        })
        return { handled: true }
      }

      if (key === 'ArrowUp') {
        setHighlightedIndex((prev) => {
          if (rows.length === 0) return -1
          const next = prev > 0 ? prev - 1 : rows.length - 1
          return next
        })
        return { handled: true }
      }

      if ((key === 'Enter' || key === 'Tab') && !shiftKey) {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0
        const row = rows[idx]
        if (row) {
          return { handled: true, selectedRow: row }
        }
      }

      if (key === 'Escape') {
        close()
        return { handled: true }
      }

      return { handled: false }
    },
    [isOpen, rows, highlightedIndex, close],
  )

  return {
    activeMention,
    setActiveMention,
    mentionPosition,
    setMentionPosition,
    highlightedIndex,
    setHighlightedIndex,
    rows,
    isOpen,
    close,
    handleKeyDown,
    getSelectedValue,
  }
}

// ============================================================================
// Hook: useInputMention - For standard input/textarea elements
// ============================================================================

export interface UseInputMentionOptions extends UseMentionSuggestionsOptions {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  value: string
  onChange: (newValue: string) => void
  /** Optional callback when a mention is applied */
  onMentionApplied?: (type: MentionType, value: string) => void
}

export interface UseInputMentionReturn extends UseMentionSuggestionsReturn {
  /** Call this on input change */
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  /** Call this on selection change (click, arrow keys without popup) */
  handleSelectionChange: () => void
  /** Call this on keydown */
  handleKeyDownEvent: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  /** Apply a mention selection */
  applyMention: (row: MentionRow) => void
}

export function useInputMention({
  inputRef,
  value,
  onChange,
  onMentionApplied,
  ...suggestionOptions
}: UseInputMentionOptions): UseInputMentionReturn {
  const suggestions = useMentionSuggestions(suggestionOptions)

  const updateMentionState = useCallback(() => {
    const el = inputRef.current
    if (!el) return

    const caret = el.selectionStart ?? value.length
    const mention = getActiveMention(value, caret)
    suggestions.setActiveMention(mention)

    if (!mention) {
      suggestions.setMentionPosition(null)
      return
    }

    // Get caret coordinates for positioning
    // This requires the textarea-caret library for textareas
    // For inputs, we can approximate
    if ('getBoundingClientRect' in el) {
      const rect = el.getBoundingClientRect()
      // Simple approximation - could be improved with textarea-caret
      const charWidth = 8 // approximate
      suggestions.setMentionPosition({
        top: rect.height + 4,
        left: Math.min(caret * charWidth, rect.width - 100),
      })
    }
  }, [inputRef, value, suggestions])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value)
      requestAnimationFrame(() => updateMentionState())
    },
    [onChange, updateMentionState],
  )

  const handleSelectionChange = useCallback(() => {
    requestAnimationFrame(() => updateMentionState())
  }, [updateMentionState])

  const applyMention = useCallback(
    (row: MentionRow) => {
      const mention = suggestions.activeMention
      if (!mention) return

      const selectedValue = suggestions.getSelectedValue(row)
      
      // For "typed" rows, just close the popup (keep what they typed)
      if (row.kind === 'typed') {
        suggestions.close()
        return
      }

      const replacement = buildMentionReplacement(mention.type, selectedValue)
      const before = value.slice(0, mention.start)
      const after = value.slice(mention.end)
      const newValue = `${before}${replacement}${after}`

      onChange(newValue)
      suggestions.close()

      // Set cursor position after the replacement
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        const pos = before.length + replacement.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })

      onMentionApplied?.(mention.type, selectedValue)
    },
    [suggestions, value, onChange, inputRef, onMentionApplied],
  )

  const handleKeyDownEvent = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { handled, selectedRow } = suggestions.handleKeyDown(e.key, e.shiftKey)
      
      if (handled) {
        e.preventDefault()
        if (selectedRow) {
          applyMention(selectedRow)
        }
      }
    },
    [suggestions, applyMention],
  )

  return {
    ...suggestions,
    handleInputChange,
    handleSelectionChange,
    handleKeyDownEvent,
    applyMention,
  }
}
