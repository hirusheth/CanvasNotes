import { useEffect, useReducer, useState } from 'react';
import { useEditor, EditorContent, type Editor, Node, Mark, Extension, mergeAttributes, wrappingInputRule } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { setState } from '../store';
import { t } from '../i18n';

// "! " at the start of a line makes a callout box, as in Milanote.
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0],
  addInputRules() {
    return [wrappingInputRule({ find: /^!\s$/, type: this.type })];
  },
});

const SmallText = Mark.create({
  name: 'small',
  parseHTML: () => [{ tag: 'small' }],
  renderHTML: ({ HTMLAttributes }) => ['small', HTMLAttributes, 0],
});

// Paragraph and heading indent (Milanote's "Text indent"), outside of lists.
const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (attrs) => (attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * 1.5}em` } : {}),
          },
        },
      },
    ];
  },
});

function changeIndent(editor: Editor, delta: number) {
  const type = editor.isActive('heading') ? 'heading' : 'paragraph';
  const current = Number(editor.getAttributes(type).indent) || 0;
  editor.chain().focus().updateAttributes(type, { indent: Math.max(0, Math.min(6, current + delta)) }).run();
}

const FONTS = [
  { label: 'Default', value: null },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, Menlo, Consolas, monospace' },
  { label: 'Rounded', value: '"Nunito", "Varela Round", ui-rounded, system-ui, sans-serif' },
  { label: 'Handwritten', value: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' },
];
const SIZES = [null, '12px', '14px', '16px', '20px', '24px', '32px'];

export const TEXT_COLORS = ['#24262b', '#7a7f89', '#d6455d', '#e06f1f', '#b08800', '#2a9467', '#2f7fcc', '#7a5ad6'];
export const HIGHLIGHTS = ['#ffe066', '#ffc9a8', '#ffc2cf', '#d9ccff', '#bfe0ff', '#bdf0d6'];
const EMOJIS = '😀 😂 😍 🤔 😎 😢 👍 👎 🙏 👏 🎉 🔥 ⭐ ✅ ❌ ⚠️ ❗ ❓ 💡 📌 📎 📝 📅 ⏰ 💬 ❤️ 💯 🚀 🎯 🏁'.split(' ');

// Keys typed while a note is opening for editing (focus still on the page) are
// buffered until its editor exists, then inserted directly. Each key arrives once.
let pendingKeys = '';
let insertIntoActive: ((text: string) => void) | null = null;
export function bufferPendingKey(key: string) {
  if (insertIntoActive) insertIntoActive(key);
  else pendingKeys += key;
}

export function RichText({
  html,
  onChange,
  onDone,
  placeholder = 'Start typing…',
  autofocus = true,
}: {
  html: string;
  onChange(html: string): void;
  onDone(): void;
  placeholder?: string;
  autofocus?: boolean;
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
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Callout,
      SmallText,
      FontFamily,
      FontSize,
      ParagraphIndent,
    ],
    content: html,
    autofocus: autofocus ? 'end' : false,
    // Keys typed in the moment before the editor existed are replayed into it.
    onCreate: ({ editor }) => {
      insertIntoActive = (text) => editor.chain().focus('end').insertContent(text).run();
      const pending = pendingKeys;
      pendingKeys = '';
      if (pending) insertIntoActive(pending);
    },
    onDestroy: () => {
      insertIntoActive = null;
      pendingKeys = '';
    },
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

  // Tab / Shift Tab indent and un-indent list items.
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !editor.isFocused) return;
      const type = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
      e.preventDefault();
      if (!type) return changeIndent(editor, e.shiftKey ? -1 : 1);
      if (e.shiftKey) editor.chain().focus().liftListItem(type).run();
      else editor.chain().focus().sinkListItem(type).run();
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
  }, [editor]);

  return (
    <div data-editor className="rich-editor">
      {editor && <FormatBar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

type Pop = null | 'style' | 'color' | 'emoji' | 'align' | 'font';

function FormatBar({ editor }: { editor: Editor }) {
  // Re-render on every transaction so active states stay current.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [pop, setPop] = useState<Pop>(null);
  useEffect(() => {
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const chain = () => editor.chain().focus();
  const btn = (label: React.ReactNode, title: string, active: boolean, run: () => void, cls = '') => (
    <button
      type="button"
      title={t(title)}
      className={`${active ? 'active' : ''} ${cls}`}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {label}
    </button>
  );
  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p));
  const styleLabel = editor.isActive('heading', { level: 1 })
    ? 'Large heading'
    : editor.isActive('heading', { level: 2 })
      ? 'Heading'
      : editor.isActive('heading', { level: 3 })
        ? 'Small heading'
        : editor.isActive('callout')
          ? 'Callout'
          : editor.isActive('blockquote')
            ? 'Quote'
            : editor.isActive('codeBlock')
              ? 'Code block'
              : editor.isActive('small')
                ? t('Small text')
                : t('Normal text');

  const styles: [string, () => void, boolean][] = [
    ['Normal text', () => chain().setParagraph().unsetMark('small').run(), styleLabel === 'Normal text'],
    ['Large heading', () => chain().toggleHeading({ level: 1 }).run(), styleLabel === 'Large heading'],
    ['Heading', () => chain().toggleHeading({ level: 2 }).run(), styleLabel === 'Heading'],
    ['Small heading', () => chain().toggleHeading({ level: 3 }).run(), styleLabel === 'Small heading'],
    ['Small text', () => chain().toggleMark('small').run(), editor.isActive('small')],
    ['Quote', () => chain().toggleBlockquote().run(), editor.isActive('blockquote')],
    ['Callout', () => chain().toggleWrap('callout').run(), editor.isActive('callout')],
    ['Code block', () => chain().toggleCodeBlock().run(), editor.isActive('codeBlock')],
  ];

  return (
    <div className="format-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="fb-pop-anchor">
        {btn(<span className="fb-style">{styleLabel} ▾</span>, 'Text style', pop === 'style', () => toggle('style'))}
        {pop === 'style' && (
          <div className="fb-pop">
            {styles.map(([label, run, active]) => (
              <button key={label} className={active ? 'active' : ''} onMouseDown={(e) => (e.preventDefault(), run(), setPop(null))}>
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="fb-pop-anchor">
        {btn('Aa', 'Font and size', pop === 'font', () => toggle('font'))}
        {pop === 'font' && (
          <div className="fb-pop fb-fonts">
            <div className="menu-label">{t('Font')}</div>
            {FONTS.map((f) => (
              <button
                key={f.label}
                style={f.value ? { fontFamily: f.value } : undefined}
                className={(editor.getAttributes('textStyle').fontFamily ?? null) === f.value ? 'active' : ''}
                onMouseDown={(e) => (e.preventDefault(), f.value ? chain().setFontFamily(f.value).run() : chain().unsetFontFamily().run())}
              >
                {f.label}
              </button>
            ))}
            <div className="menu-label">{t('Size')}</div>
            <div className="fb-row">
              {SIZES.map((size) => (
                <button
                  key={size ?? 'auto'}
                  className={(editor.getAttributes('textStyle').fontSize ?? null) === size ? 'active' : ''}
                  onMouseDown={(e) => (e.preventDefault(), size ? chain().setFontSize(size).run() : chain().unsetFontSize().run())}
                >
                  {size ? parseInt(size) : 'Auto'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {btn('B', 'Bold (Ctrl B)', editor.isActive('bold'), () => chain().toggleBold().run(), 'fb-bold')}
      {btn('I', 'Italic (Ctrl I)', editor.isActive('italic'), () => chain().toggleItalic().run(), 'fb-italic')}
      {btn('U', 'Underline (Ctrl U)', editor.isActive('underline'), () => chain().toggleUnderline().run(), 'fb-underline')}
      {btn('S', 'Strikethrough', editor.isActive('strike'), () => chain().toggleStrike().run(), 'fb-strike')}
      {btn('`', 'Inline code', editor.isActive('code'), () => chain().toggleCode().run(), 'fb-code')}
      <div className="fb-pop-anchor">
        {btn(<span className="fb-color-a">A</span>, 'Text colour & highlight', pop === 'color', () => toggle('color'))}
        {pop === 'color' && (
          <div className="fb-pop fb-colors">
            <div className="menu-label">{t('Colour')}</div>
            <div className="menu-colors">
              <button className="swatch-dot no-color" title={t('Default')} onMouseDown={(e) => (e.preventDefault(), chain().unsetColor().run())} />
              {TEXT_COLORS.map((c) => (
                <button key={c} className="swatch-dot" style={{ background: c }} onMouseDown={(e) => (e.preventDefault(), chain().setColor(c).run())} />
              ))}
            </div>
            <div className="menu-label">{t('Highlight')}</div>
            <div className="menu-colors">
              <button className="swatch-dot no-color" title={t('None')} onMouseDown={(e) => (e.preventDefault(), chain().unsetHighlight().run())} />
              {HIGHLIGHTS.map((c) => (
                <button key={c} className="swatch-dot" style={{ background: c }} onMouseDown={(e) => (e.preventDefault(), chain().setHighlight({ color: c }).run())} />
              ))}
            </div>
          </div>
        )}
      </div>
      <span className="fb-sep" />
      {btn('•', 'Bullet list (* space)', editor.isActive('bulletList'), () => chain().toggleBulletList().run())}
      {btn('1.', 'Numbered list (1. space)', editor.isActive('orderedList'), () => chain().toggleOrderedList().run())}
      {btn('☐', 'Checklist ([] space)', editor.isActive('taskList'), () => chain().toggleTaskList().run())}
      {btn('⇥', 'Indent (Tab)', false, () => {
        const type = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
        if (type) chain().sinkListItem(type).run();
        else changeIndent(editor, 1);
      })}
      {btn('⇤', 'Un-indent (Shift Tab)', false, () => {
        const type = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
        if (type) chain().liftListItem(type).run();
        else changeIndent(editor, -1);
      })}
      <div className="fb-pop-anchor">
        {btn('≡', 'Alignment', pop === 'align', () => toggle('align'))}
        {pop === 'align' && (
          <div className="fb-pop fb-row">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={editor.isActive({ textAlign: a }) ? 'active' : ''} onMouseDown={(e) => (e.preventDefault(), chain().setTextAlign(a).run(), setPop(null))}>
                {a === 'left' ? 'Left' : a === 'center' ? t('Center') : t('Right')}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="fb-sep" />
      {btn('🔗', 'Hyperlink', editor.isActive('link'), () => {
        if (editor.isActive('link')) return chain().unsetLink().run();
        const url = window.prompt('Link URL');
        if (url) chain().extendMarkRange('link').setLink({ href: /^[a-z]+:|^#/i.test(url) ? url : `https://${url}` }).run();
      })}
      {btn('▦', 'Link to board', false, () =>
        setState({
          modal: {
            kind: 'boardLink',
            onPick: (id, title) => {
              const href = id === 'root' ? '#/' : `#/b/${id}`;
              const { empty } = editor.state.selection;
              if (empty) editor.chain().focus().insertContent(`<a href="${href}">${title.replace(/</g, '&lt;')}</a> `).run();
              else editor.chain().focus().setLink({ href }).run();
            },
          },
        }),
      )}
      <div className="fb-pop-anchor">
        {btn('☺', 'Insert emoji', pop === 'emoji', () => toggle('emoji'))}
        {pop === 'emoji' && (
          <div className="fb-pop fb-emoji">
            {EMOJIS.map((em) => (
              <button key={em} onMouseDown={(e) => (e.preventDefault(), chain().insertContent(em).run(), setPop(null))}>
                {em}
              </button>
            ))}
          </div>
        )}
      </div>
      {btn('—', 'Divider line (---)', false, () => chain().setHorizontalRule().run())}
      {btn('⌫', 'Clear formatting', false, () => chain().unsetAllMarks().clearNodes().run())}
    </div>
  );
}
