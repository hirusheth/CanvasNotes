// Element model. Like Milanote's, every item is an element with a type, a
// board it belongs to (parentId), a section (canvas or trash) and either a
// free canvas position or an order inside a column.

export type ElementType = 'note' | 'board' | 'column' | 'todo' | 'image' | 'link' | 'line' | 'swatch' | 'file';

export type Section = 'canvas' | 'trash';

export const ROOT_ID = 'root';

export interface NoteContent {
  html: string;
}
export interface BoardContent {
  title: string;
  icon?: string;
}
export interface ColumnContent {
  title: string;
  collapsed?: boolean;
}
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}
export interface TodoContent {
  title: string;
  items: TodoItem[];
}
export interface ImageContent {
  src: string;
  caption?: string;
  ratio?: number;
}
export interface LinkContent {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site?: string | null;
  loading?: boolean;
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

export interface ContentByType {
  note: NoteContent;
  board: BoardContent;
  column: ColumnContent;
  todo: TodoContent;
  image: ImageContent;
  link: LinkContent;
  line: LineContent;
  swatch: SwatchContent;
  file: FileContent;
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
  board: 110,
  column: 300,
  todo: 270,
  image: 300,
  link: 300,
  line: 0,
  swatch: 120,
  file: 270,
};

// Types that may live inside a column.
export const COLUMN_CHILD_TYPES: ElementType[] = ['note', 'board', 'todo', 'image', 'link', 'swatch', 'file'];

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
