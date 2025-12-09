"use client";

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  EditorRoot,
  type JSONContent,
  handleCommandNavigation,
  useEditor,
} from "novel";
import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { defaultExtensions } from "./extensions";
import { slashCommand, suggestionItems } from "./slash-command";
import { EditorBubbleMenu } from "./bubble-menu";
import { EditorToolbar } from "./toolbar";
import { getActiveMention, type ActiveMention, type MentionPosition } from "@/hooks/use-mentions";
import "./styles.css";

const extensions = [...defaultExtensions, slashCommand];

// Re-export types for convenience
export type { ActiveMention, MentionPosition, MentionType } from "@/hooks/use-mentions";

export interface NovelEditorProps {
  initialContent?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  onHTMLChange?: (html: string) => void;
  onTextChange?: (text: string) => void;
  onMentionChange?: (mention: ActiveMention | null, position: MentionPosition | null) => void;
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
  onSubmit?: () => void;
  className?: string;
  editorClassName?: string;
  showToolbar?: boolean;
}

export interface NovelEditorHandle {
  replaceText: (start: number, end: number, replacement: string) => void;
  focus: () => void;
  clear: () => void;
}

// Helper component to sync editor instance to parent ref
function EditorRefSync({ editorRef }: { editorRef: React.MutableRefObject<any> }) {
  const { editor } = useEditor();
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);
  return null;
}

export const NovelEditor = forwardRef<NovelEditorHandle, NovelEditorProps>(function NovelEditor({
  initialContent,
  onChange,
  onHTMLChange,
  onTextChange,
  onMentionChange,
  onKeyDown,
  onSubmit,
  className = "",
  editorClassName = "",
  showToolbar = true,
}, ref) {
  const [content, setContent] = useState<JSONContent | undefined>(
    typeof initialContent === "string" ? undefined : initialContent
  );
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof initialContent === "object") {
      setContent(initialContent);
    }
  }, [initialContent]);

  /**
   * Get the text content before cursor in the current block/node.
   * This avoids complex position mapping by working directly with the resolved position.
   */
  const getTextBeforeCursor = useCallback((editor: any): { text: string; blockStart: number } => {
    const { from } = editor.state.selection;
    const $from = editor.state.doc.resolve(from);
    
    // Get the parent node (paragraph, taskItem content, etc.)
    const parent = $from.parent;
    const parentOffset = $from.parentOffset;
    
    // Get text content from start of parent to cursor
    let text = '';
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child.isText) {
        const childText = child.text || '';
        const endPos = text.length + childText.length;
        if (endPos >= parentOffset) {
          // Cursor is within or after this text node
          text += childText.slice(0, parentOffset - text.length);
          break;
        }
        text += childText;
      }
    }
    
    // blockStart is the ProseMirror position where this parent node's content starts
    const blockStart = from - parentOffset;
    
    return { text, blockStart };
  }, []);

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    replaceText: (start: number, end: number, replacement: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      
      // start and end are offsets within the current block
      // We need to add the block start position
      const { from } = editor.state.selection;
      const $from = editor.state.doc.resolve(from);
      const blockStart = from - $from.parentOffset;
      
      const pmStart = blockStart + start;
      const pmEnd = blockStart + end;
      
      editor.chain()
        .focus()
        .deleteRange({ from: pmStart, to: pmEnd })
        .insertContent(replacement)
        .run();
    },
    focus: () => {
      editorRef.current?.commands?.focus();
    },
    clear: () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.commands.clearContent();
      setContent(undefined);
    },
  }), []);

  const getCursorPosition = useCallback((editor: any): MentionPosition | null => {
    try {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      if (!containerRect) return null;
      
      return {
        top: coords.bottom - containerRect.top + 4,
        left: coords.left - containerRect.left,
      };
    } catch {
      return null;
    }
  }, []);

  /**
   * Detect mention in the current block where cursor is.
   * Returns mention with positions relative to the block start.
   */
  const detectMention = useCallback((editor: any): ActiveMention | null => {
    const { text } = getTextBeforeCursor(editor);
    const caret = text.length;
    return getActiveMention(text, caret);
  }, [getTextBeforeCursor]);

  const handleUpdate = useCallback(
    ({ editor }: { editor: any }) => {
      const json = editor.getJSON();
      const html = editor.getHTML();
      const text = editor.getText();

      setContent(json);
      onChange?.(json);
      onHTMLChange?.(html);
      onTextChange?.(text);

      // Check for mentions
      if (onMentionChange) {
        const mention = detectMention(editor);
        const position = mention ? getCursorPosition(editor) : null;
        onMentionChange(mention, position);
      }

      editorRef.current = editor;
    },
    [onChange, onHTMLChange, onTextChange, onMentionChange, getCursorPosition, detectMention]
  );

  const handleSelectionUpdate = useCallback(
    ({ editor }: { editor: any }) => {
      if (onMentionChange) {
        const mention = detectMention(editor);
        const position = mention ? getCursorPosition(editor) : null;
        onMentionChange(mention, position);
      }
      editorRef.current = editor;
    },
    [onMentionChange, getCursorPosition, detectMention]
  );

  const handleEditorKeyDown = useCallback(
    (_view: any, event: KeyboardEvent) => {
      // Handle Cmd+Enter (Mac) or Ctrl+Enter (Windows) for submission
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSubmit?.();
        return true;
      }
      
      // Let parent handle keyboard events first
      if (onKeyDown) {
        const handled = onKeyDown(event);
        if (handled) {
          return true;
        }
      }
      // Then handle slash command navigation
      return handleCommandNavigation(event);
    },
    [onKeyDown, onSubmit]
  );

  const handleCreate = useCallback(({ editor }: { editor: any }) => {
    editorRef.current = editor;
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <EditorRoot>
        <EditorContent
          initialContent={content}
          extensions={extensions}
          className={`min-h-[100px] w-full rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white overflow-hidden ${editorClassName}`}
          editorProps={{
            handleKeyDown: handleEditorKeyDown,
            attributes: {
              class:
                "prose prose-invert prose-sm sm:prose-base max-w-full focus:outline-none px-4 py-3 min-h-[100px] prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-em:text-white/90 prose-code:text-blue-300 prose-blockquote:text-white/80 prose-li:text-white/90",
            },
          }}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onSelectionUpdate={handleSelectionUpdate}
          slotBefore={showToolbar ? <EditorToolbar /> : undefined}
        >
          <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-white/20 bg-black/95 px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-white/60">
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item.command?.(val)}
                  className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-white hover:bg-white/10 aria-selected:bg-white/20"
                  key={item.title}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-white/5">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-white/60">{item.description}</p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <EditorBubbleMenu />
          <EditorRefSync editorRef={editorRef} />
        </EditorContent>
      </EditorRoot>
    </div>
  );
});

export default NovelEditor;
