'use client';

import fr from './messages/fr.json';
import en from './messages/en.json';

export type Locale = 'fr' | 'en';

export const defaultLocale: Locale = 'fr';

const messages = { fr, en } as const;

type Messages = typeof fr;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

export function createT(locale: Locale = defaultLocale) {
  const dict = messages[locale] as unknown as Record<string, unknown>;
  return function t(key: string, vars?: Record<string, string>): string {
    let str = getNestedValue(dict, key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
      }
    }
    return str;
  };
}

// Default t() using fr locale — works in client components without context
export const t = createT('fr');

export type { Messages };
