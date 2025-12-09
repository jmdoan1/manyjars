import { EditorBubble, EditorBubbleItem, useEditor } from "novel";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  CodeIcon,
  Link2Icon,
  Link2OffIcon,
} from "lucide-react";
import { useState } from "react";

export function EditorBubbleMenu() {
  const { editor } = useEditor();
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  if (!editor) return null;

  const items = [
    {
      name: "bold",
      isActive: () => editor.isActive("bold"),
      command: () => editor.chain().focus().toggleBold().run(),
      icon: BoldIcon,
    },
    {
      name: "italic",
      isActive: () => editor.isActive("italic"),
      command: () => editor.chain().focus().toggleItalic().run(),
      icon: ItalicIcon,
    },
    {
      name: "underline",
      isActive: () => editor.isActive("underline"),
      command: () => editor.chain().focus().toggleUnderline().run(),
      icon: UnderlineIcon,
    },
    {
      name: "strike",
      isActive: () => editor.isActive("strike"),
      command: () => editor.chain().focus().toggleStrike().run(),
      icon: StrikethroughIcon,
    },
    {
      name: "code",
      isActive: () => editor.isActive("code"),
      command: () => editor.chain().focus().toggleCode().run(),
      icon: CodeIcon,
    },
  ];

  const handleSetLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl("");
      setShowLinkInput(false);
    }
  };

  const handleUnsetLink = () => {
    editor.chain().focus().unsetLink().run();
    setShowLinkInput(false);
  };

  return (
    <EditorBubble
      tippyOptions={{
        placement: "top",
      }}
      className="flex w-fit max-w-[90vw] overflow-hidden rounded-md border border-white/20 bg-black/95 shadow-xl"
    >
      {showLinkInput ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Enter URL..."
            className="w-48 bg-transparent text-white text-sm outline-none placeholder:text-white/40"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSetLink();
              }
              if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkUrl("");
              }
            }}
            autoFocus
          />
          <button
            onClick={handleSetLink}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl("");
            }}
            className="text-xs text-white/60 hover:text-white px-2 py-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <EditorBubbleItem
              key={item.name}
              onSelect={item.command}
              className={`p-2 hover:bg-white/10 cursor-pointer ${
                item.isActive() ? "text-blue-400" : "text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
            </EditorBubbleItem>
          ))}
          
          <div className="w-px bg-white/20 mx-1" />
          
          {editor.isActive("link") ? (
            <EditorBubbleItem
              onSelect={handleUnsetLink}
              className="p-2 hover:bg-white/10 cursor-pointer text-blue-400"
            >
              <Link2OffIcon className="h-4 w-4" />
            </EditorBubbleItem>
          ) : (
            <EditorBubbleItem
              onSelect={() => setShowLinkInput(true)}
              className="p-2 hover:bg-white/10 cursor-pointer text-white"
            >
              <Link2Icon className="h-4 w-4" />
            </EditorBubbleItem>
          )}
        </>
      )}
    </EditorBubble>
  );
}
