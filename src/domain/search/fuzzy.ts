// Fuzzy search (both pickers). Every typed word has to match the entry somewhere: as a word, the start
// of a word or part of one; across punctuation ("jp2c" finds JP-2C); as letters in order inside one
// word, or two adjacent words, that start the same ("ecsty" finds Ecstasy, "mkiic" Mark IIC); with
// shorthand forms (mk = mark, Roman numerals = digits: "mk2c", "mkiic"); or with a typo (one wrong,
// missing, extra or swapped letter; two in words of eight letters or more). Results keep their group
// headers, with the better matches first in each group; matches scoring half the best or less are
// dropped, so typo matches only show when nothing matches properly.

export interface FuzzyIndex {
  words: string[];
  /** Adjacent words joined, for letters-in-order across them ("mkiic" in "mark" + "iic"). */
  pairs: string[];
  compact: string;
}

const COMBINING = /[\u0300-\u036f]/g;
export const fzNorm = (s: string): string =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/[®™]/g, '');
export const fzWords = (s: string): string[] =>
  fzNorm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Roman numerals as digits ("iic" → "2c", "mkiii" → "mk3"), "mk" as "mark": the forms gear names use.
const FZ_ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
export const fzRoman = (w: string): string => w.replace(/(iii|ii|iv|vi|v|i)(?=[a-z]?$)/, (m) => String(FZ_ROMAN[m]));
export function fzVariants(t: string): string[] {
  const out = new Set([t, fzRoman(t)]);
  [...out].forEach((v) => {
    if (/^mk(?=[0-9ivx])/.test(v)) out.add(v.replace(/^mk/, 'mark'));
  });
  return [...out];
}

export function fzIndex(text: string): FuzzyIndex {
  const base = fzWords(text),
    words = [...new Set(base.concat(base.map(fzRoman)))];
  const pairs = base.slice(1).map((w, i) => base[i] + w);
  return { words, pairs, compact: base.join('') };
}

/** Damerau–Levenshtein distance (adjacent swaps count as one edit), giving up past max. */
export function fzEdit(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] | null = null,
    prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      row.push(v);
      low = Math.min(low, v);
    }
    if (low > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/** Letters of t in order inside w (same first letter): the number of gaps, or -1. */
function fzGaps(t: string, w: string): number {
  if (w[0] !== t[0]) return -1;
  let i = 0,
    gaps = 0,
    last = -1;
  for (let j = 0; j < w.length && i < t.length; j++)
    if (w[j] === t[i]) {
      if (last >= 0 && j > last + 1) gaps++;
      last = j;
      i++;
    }
  return i === t.length ? gaps : -1;
}

/** How well one typed word matches an entry (0 = not at all, 10 = a whole word). */
export function fzToken(t: string, ix: FuzzyIndex): number {
  return Math.max(...fzVariants(t).map((v) => fzTokenOne(v, ix)));
}
function fzTokenOne(t: string, ix: FuzzyIndex): number {
  let best = 0;
  for (const w of ix.words) {
    if (w === t) return 10;
    best = Math.max(best, w.startsWith(t) ? 8 : w.includes(t) ? 6 : 0);
  }
  if (best || ix.compact.includes(t)) return best || 6;
  // inside one word from three letters; across two adjacent words from four (so "ch2" doesn't match "Ch1 2")
  if (t.length >= 3)
    for (const w of t.length >= 4 ? ix.words.concat(ix.pairs) : ix.words) {
      const g = fzGaps(t, w);
      if (g >= 0) best = Math.max(best, 4 - Math.min(g, 2));
    }
  if (t.length >= 4) for (const w of ix.words) best = Math.max(best, fzTypo(t, w));
  return best;
}

// Typo score of t against w: against the whole word, or (five letters or more) against the start of a
// longer word. Words repeat across entries, so results are kept per typed word.
const FZ_TYPO = new Map<string, Map<string, number>>();
function fzTypo(t: string, w: string): number {
  let memo = FZ_TYPO.get(t);
  if (!memo) {
    if (FZ_TYPO.size > 64) FZ_TYPO.clear();
    FZ_TYPO.set(t, (memo = new Map()));
  }
  let v = memo.get(w);
  if (v === undefined) {
    const max = t.length >= 8 ? 2 : 1;
    const d = Math.min(
      fzEdit(t, w, max),
      t.length >= 5 && w.length > t.length + max ? fzEdit(t, w.slice(0, t.length), max) : max + 1,
    );
    memo.set(w, (v = d <= max ? 3 - d : 0));
  }
  return v;
}

/** An entry's score for the typed words: their average, or 0 if any word doesn't match. */
export function fzScore(tokens: string[], ix: FuzzyIndex): number {
  let s = 0;
  for (const tk of tokens) {
    const v = fzToken(tk, ix);
    if (!v) return 0;
    s += v;
  }
  return tokens.length ? s / tokens.length : 0;
}

/** The items (in display order) that match the query: groups (group(x), e.g. category headers) keep
 *  their place, better matches come first inside each group, and weak matches are dropped. */
export function fzFilter<T>(items: T[], query: string, indexOf: (x: T) => FuzzyIndex, group: (x: T) => string): T[] {
  const tokens = fzWords(query),
    first = new Map<string, number>();
  const scored = items
    .map((x, i): [number, number, T, string] => {
      const g = group(x);
      if (!first.has(g)) first.set(g, i);
      return [fzScore(tokens, indexOf(x)), i, x, g];
    })
    .filter((s) => s[0] > 0);
  const top = Math.max(0, ...scored.map((s) => s[0]));
  return scored
    .filter((s) => s[0] > top / 2)
    .sort((a, b) => first.get(a[3])! - first.get(b[3])! || b[0] - a[0] || a[1] - b[1])
    .map((s) => s[2]);
}
