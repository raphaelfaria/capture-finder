// Small string helpers shared by the data tools.
/* eslint-disable no-control-regex -- ASCII ranges and the record/group/file separators are intended */

/** Split on every kind of line break the descriptions use. */
export const lines = (text: string): string[] => text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
export const stripChars = (s: string, chars: string): string => {
  let a = 0,
    b = s.length;
  while (a < b && chars.includes(s[a]!)) a++;
  while (b > a && chars.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
};
export const rstripChars = (s: string, chars: string): string => {
  let b = s.length;
  while (b > 0 && chars.includes(s[b - 1]!)) b--;
  return s.slice(0, b);
};
export const isDigits = (s: string): boolean => /^\d+$/.test(s);
export const titleCase = (s: string): string =>
  s.toLowerCase().replace(/\p{L}+/gu, (w) => w[0]!.toUpperCase() + w.slice(1));
export const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);
/** Values parsed from descriptions are numbers; labels keep the "5.0" spelling the data has always used. */
export const valueLabel = (v: unknown): string =>
  typeof v === 'number' && Number.isInteger(v) ? v.toFixed(1) : String(v);
/** A word character in any script (for headings like "Crunch Channel"). */
export const W = '[\\p{L}\\p{M}\\p{N}_]';

/** Lowercase ASCII letters and digits only: how labels, tags and names are compared. */
export function norm(text: unknown): string {
  return String(text)
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Gear ids: lowercase ASCII words joined by dashes. */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Plain string order (code units), used where the output order must stay stable. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
