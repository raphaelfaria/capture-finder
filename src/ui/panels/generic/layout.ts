// Generic panels (gear without a custom panel) are laid out by heuristics with nothing gear-specific.
// Amps are wide, so everything runs horizontally: the gear name on one line on top, then one section per
// channel (plus any global controls), as many side by side as fit. Inside a section the blocks sit left to
// right: switches (up to three rows tall), knobs, EQ sliders. Knobs follow a typical signal-flow order
// (gain stages, the tone stack bass → treble, presence-type controls, others, output levels last) on one
// row when it fits, else on two rows read column by column (Gain 1 over Gain 2, Bass over Middle…).
// Switches come in the order of the knob their name relates to (a shared word such as Gain More/Less →
// Gain, or a usual pairing such as Bright → Treble), with unrelated ones (modes, voicings) first. Blocks
// wrap under each other only when even that doesn't fit.
import type { Control, SwitchControl } from '../../../../shared/schema';
import { optionsFor } from '../../../domain/controls';
import { nice } from '../../../domain/format';

/** Sizes (px): knob width and gap, gap between blocks, section padding and gap, header, switch row,
 *  knob row, fader block height, fader width. */
export const GL = { kw: 66, kgap: 8, bgap: 16, pad: 26, sgap: 8, head: 40, swh: 56, krow: 92, frow: 166, fw: 38 };
type Labelled = Pick<Control, 'label'>;

const G_OUT = /\b(master|output|level|out)\b/,
  G_STAGE = /\b(input|pre-?amp|gain|drive|overdrive|distortion|fuzz|sustain|saturation)\b/;
// first match wins: output levels, then tone-stack words (so "Treble Crunch" is a treble knob), then gain stages
const G_RANK: [RegExp, number][] = [
  [G_OUT, 9],
  [/\blo(?:w)?[ -]?mids?\b/, 4],
  [/\bhi(?:gh)?[ -]?mids?\b/, 6],
  [/\b(bass|lows?)\b/, 3],
  [/\b(mid|mids|middle|midrange)\b/, 5],
  [/\b(treble|highs?)\b/, 7],
  [/\btone\b/, 6],
  [/\b(presence|resonance|depth|deep|contour|bright|air|focus|texture|shape)\b/, 8],
  [G_STAGE, 1],
];
/** A label as words ("Gain2" reads as "gain 2"). */
const gLabel = (c: Labelled) =>
  String(nice(c.label))
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2');

function gRank<T extends Labelled>(c: T, knobs: T[]): number {
  const l = gLabel(c);
  // "Volume" is a gain stage, unless the section also has a gain/drive knob and no master
  if (/\bvol(?:ume)?\b/.test(l) && !/\b(master|output|level)\b/.test(l)) {
    const stage = knobs.some((k) => k !== c && G_STAGE.test(gLabel(k))),
      master = knobs.some((k) => G_OUT.test(gLabel(k)));
    return stage && !master ? 9 : 1;
  }
  const hit = G_RANK.find(([re]) => re.test(l));
  return hit ? hit[1] : 8.5;
}

/** Knobs in signal-flow order. */
export function gOrder<T extends Labelled>(knobs: T[]): T[] {
  const num = (c: T) => {
    const m = gLabel(c).match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  };
  return knobs
    .map((c, i): [number, number, number, T] => [gRank(c, knobs), num(c), i, c])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .map((x) => x[3]);
}

// Which knob a switch belongs with, from their names: a shared word first (Gain More/Less → Gain 1,
// Open/Focused → Mid Open), else a usual pairing (Bright → Treble, Scoop → Middle, Deep → Bass,
// Boost → Gain, Power → Master). -1 when nothing relates.
const G_STOP = new Set([
  'on',
  'off',
  'switch',
  'pull',
  'push',
  'mode',
  'ch',
  'channel',
  'select',
  'the',
  'and',
  'lo',
  'hi',
  'low',
  'high',
  'in',
  'out',
  'auto',
  'vol',
  'volume',
]);
const G_PAIR: [string, RegExp][] = [
  ['gain', /\b(gain|drive|overdrive|boost|more|less|crunch|saturation|input)\b/],
  ['treble', /\b(treble|bright|brilliance|sparkle|highs?)\b/],
  ['mid', /\b(mid|mids|middle|scoop|contour)\b/],
  ['bass', /\b(bass|deep|depth|bottom|thick|fat|lows?)\b/],
  ['presence', /\bpresence\b/],
  ['out', /\b(master|output|level|power)\b/],
];
const gWords = (c: Labelled) =>
  gLabel(c)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !G_STOP.has(w) && !/^\d+$/.test(w));
const gPair = (c: Labelled) => {
  const l = gLabel(c),
    p = G_PAIR.find(([, re]) => re.test(l));
  return p ? p[0] : null;
};
/** The knob (index into `knobs`) a switch relates to, and how: 2 a shared word, 1 a pairing, 0 none. */
export function gRelated(sw: Labelled, knobs: Labelled[]): { k: number; tier: number } {
  const ws = gWords(sw);
  let best = -1,
    most = 0;
  knobs.forEach((k, i) => {
    const shared = gWords(k).filter((w) => ws.includes(w)).length;
    if (shared > most) {
      most = shared;
      best = i;
    }
  });
  if (best >= 0) return { k: best, tier: 2 };
  const p = gPair(sw),
    i = p ? knobs.findIndex((k) => gPair(k) === p) : -1;
  return i >= 0 ? { k: i, tier: 1 } : { k: -1, tier: 0 };
}

/** Switches: unrelated ones first (as recorded), then in the order of the knob each relates to. */
export function gSwitchOrder<T extends Labelled>(switches: T[], knobs: Labelled[]): T[] {
  const rel = switches.map((c) => gRelated(c, knobs).k);
  return switches
    .map((c, i): [number, number, T] => [rel[i]!, i, c])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((x) => x[2]);
}

/** Estimated width of a switch: lever + its longest option label, or its title if wider. */
export const gSwitchW = (c: SwitchControl, n: number | null): number =>
  Math.max(
    62,
    30 + Math.max(...optionsFor(c, n).map((o) => String(o.label).length)) * 5.6,
    String(c.label).length * 6.4,
  );

export interface SwitchBlock {
  rows: number;
  width: number;
  height: number;
}
/** The switch block: up to three rows, filled column by column, columns as even as possible. */
export function gSwitchBlock(ws: number[]): SwitchBlock {
  const m = ws.length;
  if (!m) return { rows: 0, width: 0, height: 0 };
  const cols = Math.ceil(m / 3),
    rows = Math.ceil(m / cols);
  let width = (cols - 1) * GL.kgap * 2;
  for (let c = 0; c < cols; c++) width += Math.max(...ws.slice(c * rows, c * rows + rows));
  return { rows, width, height: rows * GL.swh };
}
const gKnobW = (cols: number) => (cols ? cols * GL.kw + (cols - 1) * GL.kgap : 0);

/** What a section's layout needs to know: a header, its knobs, switch widths and faders. */
export interface SectionShape {
  head: boolean;
  knobs: unknown[];
  swW: number[];
  faders: unknown[];
}
export interface SectionLayout {
  rows: number;
  sw: SwitchBlock;
  wrapped: boolean;
  width: number;
  height: number;
}
/** One section for an inner width: its blocks side by side, knobs on one row if that fits, else two; if
 *  even two rows don't fit, the blocks wrap and the knobs take as many rows as they need. */
export function gSecLayout(s: SectionShape, inner: number): SectionLayout {
  const n = s.knobs.length,
    sw = gSwitchBlock(s.swW),
    fw = s.faders.length * GL.fw,
    head = s.head ? GL.head : 0;
  const blocks = (kw: number) => [sw.width, kw, fw].filter(Boolean);
  for (const rows of n > 1 ? [1, 2] : [Math.min(n, 1)]) {
    const parts = blocks(gKnobW(Math.ceil(n / Math.max(rows, 1)))),
      width = parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * GL.bgap;
    if (width <= inner)
      return { rows, sw, wrapped: false, width, height: head + Math.max(sw.height, rows * GL.krow, fw ? GL.frow : 0) };
  }
  let rows = 2;
  while (rows < n && gKnobW(Math.ceil(n / rows)) > inner) rows++;
  const width = Math.max(sw.width, gKnobW(Math.ceil(n / rows)), fw);
  return { rows, sw, wrapped: true, width, height: head + sw.height + rows * GL.krow + (fw ? GL.frow : 0) };
}

/** How many sections side by side for the available width W (px): the most that fit without wrapping a
 *  section's blocks; only balanced rows of sections (four → 4 × 1 or 2 × 2, never 3 + 1). */
export function gPlan(secs: SectionShape[], W: number): { cols: number; lays: SectionLayout[] } {
  let fallback: { cols: number; lays: SectionLayout[] } | null = null;
  for (let cols = Math.min(secs.length, 4); cols >= 1; cols--) {
    const srows = Math.ceil(secs.length / cols);
    if (Math.ceil(secs.length / srows) !== cols) continue;
    const inner = (W - (cols - 1) * GL.sgap) / cols - GL.pad,
      lays = secs.map((s) => gSecLayout(s, inner));
    if (!lays.some((l) => l.wrapped)) return { cols, lays };
    fallback = { cols, lays };
  }
  return fallback!;
}

/** Room for a generic panel: the stage width minus the bench's side columns and the cabinet's padding;
 *  beside pedals (one scrolling row), the room they leave, unless that's too narrow. Without a measured
 *  stage (server rendering), 1100px. */
export function layoutWidth(stageWidth: number | null, chainWidth: number, withChain: boolean): number {
  const w = stageWidth;
  if (!w) return 1100;
  const wide = w > 700,
    alone = w - (wide ? 48 : 32) - (wide ? 112 : 0) - (w > 380 ? 46 : 18);
  if (!withChain) return alone;
  const beside = w - (wide ? 48 : 32) - 68 - chainWidth - 46 - (w > 380 ? 46 : 18);
  return beside >= 520 ? beside : alone;
}
