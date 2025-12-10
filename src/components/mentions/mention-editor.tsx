
import { forwardRef, useRef, useImperativeHandle } from 'react'
import { NovelEditor, type NovelEditorHandle } from '@/components/novel-editor'
import {
  useMentionSuggestions,
  type MentionItem,
  type MentionRow,
  buildMentionReplacement,
} from '@/hooks/use-mentions'
import { MentionPopup } from './mention-popup'

export interface MentionEditorProps {
  jars: MentionItem[]
  tags: MentionItem[]
  enablePriority?: boolean
  onHTMLChange?: (html: string) => void
  onTextChange?: (text: string) => void
  onSubmit?: () => void
  className?: string
  editorClassName?: string
  showToolbar?: boolean
  placeholder?: string
  initialContent?: string
  onKeyDown?: (e: any) => void | boolean | undefined
}

export interface MentionEditorHandle {
  focus: () => void
  clear: () => void
  replaceText: (start: number, end: number, text: string) => void
}

export const MentionEditor = forwardRef<MentionEditorHandle, MentionEditorProps>(
  function MentionEditor(
    { jars, tags, enablePriority = false, ...editorProps },
    ref,
  ) {
    const novelRef = useRef<NovelEditorHandle | null>(null)

    const mention = useMentionSuggestions({ jars, tags })

    useImperativeHandle(ref, () => ({
      focus: () => novelRef.current?.focus(),
      clear: () => novelRef.current?.clear(),
      replaceText: (start, end, text) =>
        novelRef.current?.replaceText(start, end, text),
    }))

    const applyMention = (row: MentionRow) => {
      const m = mention.activeMention
      if (!m || !novelRef.current) return

      if (row.kind === 'typed') {
        mention.close()
        return
      }

      const value =
        row.kind === 'priority'
          ? row.option.token
          : row.item.name

      const replacement = buildMentionReplacement(m.type, value)

      novelRef.current.replaceText(m.start, m.end, replacement)
      mention.close()
    }

    const { onKeyDown, ...otherProps } = editorProps

    return (
      <div className="relative">
        <NovelEditor
          ref={novelRef}
          onMentionChange={(m, pos) => {
            mention.setActiveMention(m)
            mention.setMentionPosition(pos)
          }}
          onKeyDown={(event) => {
            const { handled, selectedRow } = mention.handleKeyDown(
              event.key,
              event.shiftKey,
            )
            if (handled) {
              event.preventDefault() // NovelEditor might accept returning boolean, but preventDefault is safer if event is passed
              if (selectedRow) applyMention(selectedRow)
              return true
            }
            
            if (onKeyDown) {
               // NovelEditor onKeyDown might expect a boolean return or void?
               // Looking at the code, typical Novel/tiptap editors handle enter/etc.
               // If the user passed onKeyDown, they might expect to handle it.
               return onKeyDown(event)
            }
             
            return false
          }}
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
          onSelectRow={applyMention}
          onHoverIndex={mention.setHighlightedIndex}
          // Adjust position for editor if needed, or pass class to popup
          className="" 
        />
      </div>
    )
  },
)
