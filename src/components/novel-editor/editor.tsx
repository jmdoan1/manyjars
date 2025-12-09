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
} from "novel";
import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { defaultExtensions } from "./extensions";
import { slashCommand, suggestionItems } from "./slash-command";
import { EditorBubbleMenu } from "./bubble-menu";
import { EditorToolbar } from "./toolbar";
import "./styles.css";

const extensions = [...defaultExtensions, slashCommand];

export type MentionType = "jar" | "tag" | "priority";

export interface ActiveMention {
  type: MentionType;
  query: string;
  start: number;
  end: number;
}

export interface MentionPosition {
  top: number;
  left: number;
}

export interface NovelEditorProps {
  initialContent?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  onHTMLChange?: (html: string) => void;
  onTextChange?: (text: string) => void;
  onMentionChange?: (mention: ActiveMention | null, position: MentionPosition | null) => void;
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
  className?: string;
  editorClassName?: string;
  editorKey?: string | number;
  showToolbar?: boolean;
}

export interface NovelEditorHandle {
  replaceText: (start: number, end: number, replacement: string) => void;
  focus: () => void;
}

function getActiveMention(text: string, caret: number): ActiveMention | null {
  const beforeCaret = text.slice(0, caret);

  const lastSeparator = Math.max(
    beforeCaret.lastIndexOf(" "),
    beforeCaret.lastIndexOf("\n"),
    beforeCaret.lastIndexOf("\t"),
  );

  const tokenStart = lastSeparator + 1;
  const token = beforeCaret.slice(tokenStart);

  if (token.startsWith("@")) {
    return {
      type: "jar",
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    };
  }

  if (token.startsWith("#")) {
    return {
      type: "tag",
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    };
  }

  if (token.startsWith("!")) {
    return {
      type: "priority",
      query: token.slice(1),
      start: tokenStart,
      end: caret,
    };
  }

  return null;
}

export const NovelEditor = forwardRef<NovelEditorHandle, NovelEditorProps>(function NovelEditor({
  initialContent,
  onChange,
  onHTMLChange,
  onTextChange,
  onMentionChange,
  onKeyDown,
  className = "",
  editorClassName = "",
  editorKey,
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

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    replaceText: (start: number, end: number, replacement: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      
      // In ProseMirror, positions are 1-indexed from the start of the document
      // and account for node boundaries. For plain text offsets, we need to
      // calculate the actual ProseMirror positions.
      const doc = editor.state.doc;
      let charCount = 0;
      let startPos = 0;
      let endPos = 0;
      
      doc.descendants((node: any, nodePos: number) => {
        if (node.isText) {
          const textStart = charCount;
          const textEnd = charCount + node.text.length;
          
          if (start >= textStart && start <= textEnd && startPos === 0) {
            startPos = nodePos + (start - textStart);
          }
          if (end >= textStart && end <= textEnd && endPos === 0) {
            endPos = nodePos + (end - textStart);
          }
          
          charCount += node.text.length;
        } else if (node.isBlock && charCount > 0) {
          // Account for newlines between blocks
          charCount += 1;
        }
        return true;
      });
      
      if (startPos > 0 && endPos > 0) {
        editor.chain()
          .focus()
          .deleteRange({ from: startPos, to: endPos })
          .insertContent(replacement)
          .run();
      }
    },
    focus: () => {
      editorRef.current?.commands?.focus();
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
        const { from } = editor.state.selection;
        const mention = getActiveMention(text, from);
        const position = mention ? getCursorPosition(editor) : null;
        onMentionChange(mention, position);
      }

      editorRef.current = editor;
    },
    [onChange, onHTMLChange, onTextChange, onMentionChange, getCursorPosition]
  );

  const handleSelectionUpdate = useCallback(
    ({ editor }: { editor: any }) => {
      if (onMentionChange) {
        const text = editor.getText();
        const { from } = editor.state.selection;
        const mention = getActiveMention(text, from);
        const position = mention ? getCursorPosition(editor) : null;
        onMentionChange(mention, position);
      }
      editorRef.current = editor;
    },
    [onMentionChange, getCursorPosition]
  );

  const handleKeyDown = useCallback(
    (_view: any, event: KeyboardEvent) => {
      // Let parent handle keyboard events first
      if (onKeyDown) {
        const handled = onKeyDown(event);
        if (handled) {
          event.preventDefault();
          return true;
        }
      }
      // Then handle slash command navigation
      return handleCommandNavigation(event);
    },
    [onKeyDown]
  );

  return (
    <div className={`relative ${className}`} key={editorKey} ref={containerRef}>
      <EditorRoot>
        <EditorContent
          initialContent={content}
          extensions={extensions}
          className={`min-h-[100px] w-full rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white overflow-hidden ${editorClassName}`}
          editorProps={{
            handleDOMEvents: {
              keydown: handleKeyDown,
            },
            attributes: {
              class:
                "prose prose-invert prose-sm sm:prose-base max-w-full focus:outline-none px-4 py-3 min-h-[100px] prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-em:text-white/90 prose-code:text-blue-300 prose-blockquote:text-white/80 prose-li:text-white/90",
            },
          }}
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
        </EditorContent>
      </EditorRoot>
    </div>
  );
});

export default NovelEditor;
