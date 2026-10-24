import { useEffect, useReducer } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';

// The note editor. StarterKit's input rules give the markdown shortcuts that
// Milanote documents: "# ", "## ", "* ", "> ", "```", "---".
export function RichText({
  html,
  onChange,
  onDone,
  placeholder = 'Type something…',
}: {
  html: string;
  onChange(html: string): void;
  onDone(): void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
    ],
    content: html,
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'rich-text', spellcheck: 'true' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          onDone();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  });

  return (
    <div data-editor className="rich-editor">
      {editor && <FormatBar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function FormatBar({ editor }: { editor: Editor }) {
  // Re-render on selection changes so active states stay current.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const btn = (label: string, title: string, active: boolean, run: () => void, cls = '') => (
    <button
      type="button"
      title={title}
      className={`${active ? 'active' : ''} ${cls}`}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="format-bar" onPointerDown={(e) => e.stopPropagation()}>
      {btn('B', 'Bold (Ctrl B)', editor.isActive('bold'), () => chain().toggleBold().run(), 'fb-bold')}
      {btn('I', 'Italic (Ctrl I)', editor.isActive('italic'), () => chain().toggleItalic().run(), 'fb-italic')}
      {btn('S', 'Strikethrough', editor.isActive('strike'), () => chain().toggleStrike().run(), 'fb-strike')}
      {btn('H', 'Highlight', editor.isActive('highlight'), () => chain().toggleHighlight().run(), 'fb-mark')}
      <span className="fb-sep" />
      {btn('H1', 'Large heading (# space)', editor.isActive('heading', { level: 1 }), () => chain().toggleHeading({ level: 1 }).run())}
      {btn('H2', 'Heading (## space)', editor.isActive('heading', { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
      {btn('•', 'Bullet list (* space)', editor.isActive('bulletList'), () => chain().toggleBulletList().run())}
      {btn('1.', 'Numbered list (1. space)', editor.isActive('orderedList'), () => chain().toggleOrderedList().run())}
      {btn('☐', 'Checklist ([] space)', editor.isActive('taskList'), () => chain().toggleTaskList().run())}
      {btn('❝', 'Quote (> space)', editor.isActive('blockquote'), () => chain().toggleBlockquote().run())}
      {btn('</>', 'Code block (``` )', editor.isActive('codeBlock'), () => chain().toggleCodeBlock().run())}
      {btn('🔗', 'Link', editor.isActive('link'), () => {
        if (editor.isActive('link')) return chain().unsetLink().run();
        const url = window.prompt('Link URL');
        if (url) chain().extendMarkRange('link').setLink({ href: url }).run();
      })}
    </div>
  );
}
