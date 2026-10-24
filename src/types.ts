// Element model. Like Milanote's, every item is an element with a type, a
// board it belongs to (parentId), a section (canvas or trash) and either a
// free canvas position or an order inside a column.

export type ElementType =
  | 'note'
  | 'heading'
  | 'board'
  | 'alias'
  | 'column'
  | 'todo'
  | 'image'
  | 'link'
  | 'line'
  | 'swatch'
  | 'file'
  | 'sketch'
  | 'table'
  | 'document'
  | 'comment'
  | 'label';

// canvas: on the board · inbox: the board's "Unsorted" panel · trash: removed.
export type Section = 'canvas' | 'inbox' | 'trash';

export const ROOT_ID = 'root';
// Pseudo-parents for elements that never appear on a board.
export const LABELS_PARENT = '__labels';
export const TEMPLATES_PARENT = '__templates';
export const SYSTEM_PARENT = '__system';

export interface NoteContent {
  html: string;
}
export interface BoardContent {
  title: string;
  icon?: string;
  iconImage?: string | null;
  // Board appearance (also stored on the hidden 'root' element for Home).
  background?: string | null;
  hideGrid?: boolean;
  template?: boolean;
}
export interface AliasContent {
  boardId: string;
}
export interface HeadingContent {
  text: string;
  size?: 'large' | 'medium' | 'small';
}
export interface ColumnContent {
  title: string;
  collapsed?: boolean;
}
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  due?: string | null;
  indent?: number;
}
export interface TodoContent {
  title: string;
  items: TodoItem[];
}
export interface Stroke {
  color: string;
  width: number;
  points: number[];
}
export interface ImageContent {
  src: string;
  caption?: string;
  ratio?: number;
  annotation?: Stroke[];
}
export interface LinkContent {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site?: string | null;
  loading?: boolean;
  kind?: 'video' | 'audio' | 'map' | null;
}
export interface LineEnd {
  id?: string | null;
  x: number;
  y: number;
}
export interface LineContent {
  from: LineEnd;
  to: LineEnd;
  label?: string;
  arrow: 'end' | 'both' | 'none';
  dashed?: boolean;
  weight?: number;
}
export interface SwatchContent {
  hex: string;
  name?: string;
}
export interface FileContent {
  src: string;
  name: string;
  size: number;
  mime: string;
}
export interface SketchContent {
  strokes: Stroke[];
  ratio: number;
}
export type CellType = 'auto' | 'text' | 'number' | 'currency' | 'percentage' | 'checkbox' | 'date';
export interface CellStyle {
  type?: CellType;
  align?: 'left' | 'center' | 'right';
  bg?: string | null;
  bold?: boolean;
}
export interface TableContent {
  title: string;
  cells: string[][];
  styles?: Record<string, CellStyle>;
  colWidths?: number[];
  header?: boolean;
}
export interface DocumentContent {
  title: string;
  html: string;
}
export interface CommentEntry {
  id: string;
  text: string;
  at: number;
  editedAt?: number;
}
export interface CommentContent {
  comments: CommentEntry[];
}
export interface LabelContent {
  name: string;
  color: string;
}

export interface ContentByType {
  note: NoteContent;
  heading: HeadingContent;
  board: BoardContent;
  alias: AliasContent;
  column: ColumnContent;
  todo: TodoContent;
  image: ImageContent;
  link: LinkContent;
  line: LineContent;
  swatch: SwatchContent;
  file: FileContent;
  sketch: SketchContent;
  table: TableContent;
  document: DocumentContent;
  comment: CommentContent;
  label: LabelContent;
}

export interface ElementOf<T extends ElementType> {
  id: string;
  type: T;
  parentId: string;
  section: Section;
  columnId?: string | null;
  order?: number;
  x: number;
  y: number;
  w: number;
  z: number;
  color?: string | null;
  // Free text shown under the card ("Add a description").
  caption?: string | null;
  labels?: string[];
  locked?: boolean;
  content: ContentByType[T];
  createdAt: number;
  updatedAt: number;
  trashedAt?: number | null;
}

export type El = { [T in ElementType]: ElementOf<T> }[ElementType];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_WIDTH: Record<ElementType, number> = {
  note: 270,
  heading: 360,
  board: 110,
  alias: 110,
  column: 300,
  todo: 270,
  image: 300,
  link: 300,
  line: 0,
  swatch: 120,
  file: 270,
  sketch: 300,
  table: 420,
  document: 270,
  comment: 280,
  label: 0,
};

// Types that may live inside a column.
export const COLUMN_CHILD_TYPES: ElementType[] = [
  'note',
  'heading',
  'board',
  'alias',
  'todo',
  'image',
  'link',
  'swatch',
  'file',
  'sketch',
  'table',
  'document',
  'comment',
];

// Types that show a "description" line under the card, like Milanote.
export const CAPTION_TYPES: ElementType[] = ['board', 'alias', 'link', 'file', 'swatch', 'sketch', 'table', 'document'];

export const CARD_COLORS: { name: string; value: string | null }[] = [
  { name: 'Default', value: null },
  { name: 'Butter', value: 'butter' },
  { name: 'Peach', value: 'peach' },
  { name: 'Rose', value: 'rose' },
  { name: 'Lilac', value: 'lilac' },
  { name: 'Sky', value: 'sky' },
  { name: 'Mint', value: 'mint' },
  { name: 'Sage', value: 'sage' },
  { name: 'Slate', value: 'slate' },
];

export const LABEL_COLORS = ['#e0566f', '#f0803c', '#e0b100', '#2fae78', '#3a8fd9', '#8a6be0', '#67707e'];
