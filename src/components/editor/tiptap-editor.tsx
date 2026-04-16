"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
}

export function TipTapEditor({
  content,
  onChange,
  editable = true,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  // Sync editable prop
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
    // Only re-sync when content prop changes, not on every editor update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="border border-border rounded-[8px] bg-white overflow-hidden">
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-surface-secondary/50">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <Italic size={15} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            active={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={15} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={15} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            active={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={15} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Ordered List"
          >
            <ListOrdered size={15} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            title="Code"
          >
            <Code size={15} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={15} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo size={15} />
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm max-w-none px-4 py-3 min-h-[240px] focus-within:outline-none",
          "[&_.tiptap]:outline-none",
          "[&_.tiptap_h1]:text-[22px] [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-3",
          "[&_.tiptap_h2]:text-[18px] [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-2",
          "[&_.tiptap_h3]:text-[15px] [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-2",
          "[&_.tiptap_p]:text-[14px] [&_.tiptap_p]:leading-relaxed [&_.tiptap_p]:mb-2",
          "[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:mb-2",
          "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_ol]:mb-2",
          "[&_.tiptap_code]:bg-surface-secondary [&_.tiptap_code]:px-1 [&_.tiptap_code]:rounded",
          "[&_.tiptap_pre]:bg-surface-secondary [&_.tiptap_pre]:p-3 [&_.tiptap_pre]:rounded-[4px] [&_.tiptap_pre]:mb-2",
        )}
      />
    </div>
  );
}

// ─── Toolbar sub-components ─────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center justify-center h-7 w-7 rounded-[4px] transition-colors duration-100",
        "text-text-secondary hover:bg-surface-secondary hover:text-text",
        "disabled:opacity-30 disabled:pointer-events-none",
        active && "bg-brand-lighter text-brand",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-1" />;
}
