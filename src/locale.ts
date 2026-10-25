// Localization settings (Milanote: Settings → Localization): how numbers,
// dates and times are written in tables and on cards, and the default currency.
// Stored per device.

export interface LocaleSettings {
  // BCP 47 locale for numbers and dates, or '' to follow the browser.
  format: string;
  currency: string;
  time: '12' | '24' | '';
}

const KEY = 'cn:locale';
const DEFAULTS: LocaleSettings = { format: '', currency: 'USD', time: '' };
const listeners = new Set<() => void>();

let current: LocaleSettings = read();

function read(): LocaleSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function getLocaleSettings(): LocaleSettings {
  return current;
}

export function setLocaleSettings(patch: Partial<LocaleSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  listeners.forEach((l) => l());
}

export function onLocaleChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Locale argument for Intl / toLocale* calls.
export function numLocale(): string | undefined {
  return current.format || undefined;
}

export function defaultCurrency(): string {
  return current.currency || 'USD';
}

// hour12 option for time formatting, or undefined to follow the locale.
export function hour12(): boolean | undefined {
  return current.time === '12' ? true : current.time === '24' ? false : undefined;
}

export const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Use browser language' },
  { value: 'en-US', label: 'English (US) — 1,234.5 · 1/31/2026' },
  { value: 'en-GB', label: 'English (UK) — 1,234.5 · 31/01/2026' },
  { value: 'en-IN', label: 'English (India) — 1,23,456.5 · 31/1/2026' },
  { value: 'de-DE', label: 'Deutsch — 1.234,5 · 31.1.2026' },
  { value: 'fr-FR', label: 'Français — 1 234,5 · 31/01/2026' },
  { value: 'es-ES', label: 'Español — 1234,5 · 31/1/2026' },
  { value: 'ja-JP', label: '日本語 — 1,234.5 · 2026/1/31' },
];

export const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SGD', 'AED'];
