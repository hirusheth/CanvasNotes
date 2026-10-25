// Interface language (Milanote: Settings → Localization → Language).
// Keys are the English strings themselves, so untranslated text falls back to English.
import { TRANSLATIONS } from './translations';

export type Lang = 'en' | 'es' | 'fr' | 'pt';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'pt', label: 'Português' },
];

const KEY = 'cn:lang';
const listeners = new Set<() => void>();

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES.some((l) => l.id === saved)) return saved as Lang;
  } catch {}
  const browser = (navigator.language || 'en').slice(0, 2);
  return (LANGUAGES.some((l) => l.id === browser) ? browser : 'en') as Lang;
}

let lang: Lang = initial();
document.documentElement.lang = lang;

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  lang = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  listeners.forEach((l) => l());
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Translates an English UI string. `{name}` placeholders are filled from `vars`.
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = lang === 'en' ? text : TRANSLATIONS[lang]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars[k] ?? '')) : out;
}
