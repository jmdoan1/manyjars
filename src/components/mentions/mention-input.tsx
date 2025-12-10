
import React, { useRef } from 'react'
import {
  useInputMention,
  type MentionItem,
} from '@/hooks/use-mentions'
import { MentionPopup } from './mention-popup'

interface MentionInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  jars: MentionItem[]
  tags: MentionItem[]
  enablePriority?: boolean
}

export function MentionInput({
  value,
  onChange,
  jars,
  tags,
  enablePriority = true,
  className,
  ...rest
}: MentionInputProps) {
  const { onKeyDown, ...otherProps } = rest
  const inputRef = useRef<HTMLInputElement | null>(null)

  const mention = useInputMention({
    inputRef,
    value,
    onChange,
    jars,
    tags,
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    mention.handleKeyDownEvent(e)
    if (!e.defaultPrevented && onKeyDown) {
      onKeyDown(e)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={mention.handleInputChange}
        onSelect={mention.handleSelectionChange}
        onKeyDown={handleKeyDown}
        className={className}
        {...otherProps}
      />
      <MentionPopup
        rows={
          enablePriority
            ? mention.rows
            : mention.rows.filter(r => r.kind !== 'priority')
        }
        highlightedIndex={mention.highlightedIndex}
        position={mention.mentionPosition}
        visible={mention.isOpen}
        currentType={mention.activeMention?.type}
        onSelectRow={mention.applyMention}
        onHoverIndex={mention.setHighlightedIndex}
        onClickOutside={mention.close}
      />
    </div>
  )
}
