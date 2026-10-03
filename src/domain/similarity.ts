// Settings similarity: how close a capture's recorded settings are to the dialled-in ones —
// weighted explicit settings, with coverage penalties, the channel, and the pedal chain.
import type { Capture, ChainItem, Control, ControlValue, GearDef, RangeControl, Values } from '../../shared/schema';
import { chainKey, chainName, pedalValue } from './chains';
import { captureChannelLabel, channelLabel } from './channels';
import { available, getValue, multiCh } from './controls';
import { f1, nice, optLabel } from './format';
import type { GearLookup, GearSettings, Reason, ReasonKind, Similarity } from './types';

/** Scores from here up are partial matches; below, low similarity. */
export const STRONG_MATCH_MIN = 60;
/** A different chain (or a pedal on one side only) keeps a match at most this fraction. */
export const PEDAL_MISS = 0.6;
/** The same chain's pedal knobs count for this share of the score. */
export const PEDAL_SHARE = 0.25;

/** A difference on a 0–10 scale, whatever the control's range. */
export const norm10 = (c: RangeControl, d: number): number => (d / Math.max(c.max - c.min, 0.001)) * 10;
export const diffKind = (d10: number): ReasonKind => (d10 <= 0.5 ? 'match' : d10 <= 1.5 ? 'near' : 'off');

/** The values a capture records for channel n (multi-channel captures keep each channel's own). */
export function captureValues(cap: Capture, n: number | null): Values {
  const s = cap.settings;
  if (!s) return {};
  // Multi-channel captures retain independent control values instead of
  // overwriting one channel's settings with the next channel's block.
  const cs = s.byChannel || {};
  if (Object.keys(cs).length > 1) return Object.assign({}, s.values, (n != null && cs[n]) || {});
  return s.values || {};
}

/** A switch value as compared: the JP-2C's Shred is on for "ch23", and for "ch2" on channel 2. */
export function switchValue(
  c: Control,
  v: ControlValue | null | undefined,
  n: number | null,
): ControlValue | null | undefined {
  if (c.key === 'shred') return v == null ? null : v === 'ch23' || (v === 'ch2' && n === 2);
  return v;
}

/** Whether the capture states the control as N/A (on channel n). */
export function notApplicable(cap: Capture, c: Control, n: number | null): boolean {
  const s = cap.settings;
  if (!s) return false;
  const multiple = Object.keys(s.byChannel || {}).length > 1;
  return (s.notApplicable || []).some((x) => x.key === c.key && (!multiple || x.channel == null || x.channel === n));
}

export interface ComparisonRow {
  kind: ReasonKind;
  note: string;
  /** The capture's value. */
  cv: ControlValue | null | undefined;
  /** Yours. */
  uv: ControlValue | undefined;
}

/** One control compared between a capture and your settings. */
export function comparisonStatus(
  cap: Capture,
  def: GearDef,
  as: GearSettings,
  c: Control,
  n: number | null,
): ComparisonRow {
  const vals = captureValues(cap, n),
    cv = vals[c.key],
    uv = getValue(as, c, n);
  if (notApplicable(cap, c, n)) return { kind: 'none', note: 'not applicable', cv: null, uv };
  if (!c.weight) return { kind: 'none', note: 'not matched', cv, uv };
  if (c.requires) {
    const req = def.controls.find((x) => x.key === c.requires)!;
    if (getValue(as, req, n) !== true || vals[c.requires] !== true)
      return {
        kind: 'none',
        note: vals[c.requires] == null ? 'not compared: enablement not stated' : 'not compared: disabled',
        cv,
        uv,
      };
  }
  if (cv == null || uv == null) return { kind: 'none', note: 'not stated', cv, uv };
  return {
    kind:
      c.kind === 'switch'
        ? switchValue(c, cv, n) === switchValue(c, uv, n)
          ? 'match'
          : 'off'
        : diffKind(norm10(c, Math.abs((cv as number) - (uv as number)))),
    note: '',
    cv,
    uv,
  };
}

/** Knob/switch similarity of the same pedal chain (each pedal with its own weights): only the knobs the
 *  capture states count, since pedal notes in descriptions are often partial. */
export function chainSimilarity(
  theirs: ChainItem[],
  yours: ChainItem[],
  gear: GearLookup,
): { sim: number; worst: { d: number; text: string } | null } | null {
  let num = 0,
    den = 0,
    worst: { d: number; text: string } | null = null;
  theirs.forEach((p, i) => {
    const d = p.id ? gear(p.id) : null;
    if (!d || !p.values) return;
    d.controls
      .filter((c) => c.weight > 0 && !c.channels)
      .forEach((c) => {
        const cv = p.values![c.key],
          uv = pedalValue(yours, i, c.key, gear);
        if (cv == null || uv == null) return;
        den += c.weight;
        if (c.kind === 'switch') {
          num += c.weight * (cv === uv ? 1 : 0);
          if (cv !== uv && (!worst || worst.d < 4))
            worst = {
              d: 4,
              text: d.model + ' ' + nice(c.label) + ' ' + nice(optLabel(c, cv)) + ' · yours ' + nice(optLabel(c, uv)),
            };
          return;
        }
        const d10 = norm10(c, Math.abs((cv as number) - (uv as number)));
        num += c.weight * Math.max(0, 1 - d10 / 4);
        if (!worst || d10 > worst.d)
          worst = {
            d: d10,
            text: d.model + ' ' + nice(c.label) + ' ' + f1(cv as number) + ' vs your ' + f1(uv as number),
          };
      });
  });
  return den ? { sim: num / den, worst } : null;
}

/** How close a capture is to your settings: a 0–100 score with the reasons behind it, or 'unparsed'
 *  when nothing can be compared. `def` carries the effective (possibly edited) weights. */
export function settingsSimilarity(cap: Capture, def: GearDef, as: GearSettings, gear: GearLookup): Similarity {
  const s = cap.settings;
  if (!s) return { status: 'unparsed' };
  const n = def.channels ? as.channel : null,
    vals = captureValues(cap, n);
  let num = 0,
    den = 0,
    maxDen = 0;
  const reasons: Reason[] = [],
    add = (w: number, sim: number) => {
      num += w * sim;
      den += w;
    };
  const recordedChannels = Object.keys(s.byChannel || {}).length;
  const channelRecorded = s.channel != null || recordedChannels > 1;
  const sameCh = !multiCh(def) || s.channel === n || (!!s.byChannel && n != null && !!s.byChannel[n]);
  if (multiCh(def)) {
    if (!channelRecorded) reasons.push({ kind: 'none', text: 'Channel not stated' });
    else if (sameCh)
      reasons.push({
        kind: 'match',
        text: (recordedChannels > 1 ? 'Capture includes ' : 'Same channel · ') + channelLabel(def, n),
      });
    else reasons.push({ kind: 'off', text: 'Different channel · capture uses ' + captureChannelLabel(def, cap) });
    if (recordedChannels > 1)
      reasons.push({ kind: 'none', text: 'Other recorded channels are not compared in this active-channel view' });
  }
  let worst: { c: Control; cv: number; uv: number } | null = null,
    worstD = -1,
    toneCount = 0,
    swSame = 0;
  const eqGaps: number[] = [],
    swOff: string[] = [];
  def.controls
    .filter((c) => c.weight > 0 && available(c, n))
    .forEach((c) => {
      if (notApplicable(cap, c, n)) return;
      if (c.requires) {
        const rc = def.controls.find((x) => x.key === c.requires)!;
        // Unknown enablement never implies ON. Unknown settings still reduce
        // coverage; explicitly disabled groups are excluded on both sides.
        if (getValue(as, rc, n) !== true || vals[c.requires] === false) return;
        maxDen += c.weight;
        if (vals[c.requires] !== true) return;
      } else {
        maxDen += c.weight;
      }
      const cv = vals[c.key];
      if (cv == null) return;
      const uv = getValue(as, c, n);
      if (c.kind === 'switch') {
        const same = switchValue(c, cv, n) === switchValue(c, uv, n);
        add(c.weight, same ? 1 : 0);
        if (same) swSame++;
        else swOff.push(nice(c.label) + ' ' + nice(optLabel(c, cv)) + ' · yours ' + nice(optLabel(c, uv)));
        return;
      }
      const d10 = norm10(c, Math.abs((cv as number) - (uv as number)));
      add(c.weight, Math.max(0, 1 - d10 / 4));
      if (c.group === 'eq') {
        eqGaps.push(d10);
        return;
      }
      if (c.primary) {
        reasons.push({
          kind: diffKind(d10),
          text: nice(c.label) + ' ' + f1(cv as number) + ' vs your ' + f1(uv as number),
        });
        return;
      }
      toneCount++;
      if (d10 > worstD) {
        worstD = d10;
        worst = { c, cv: cv as number, uv: uv as number };
      }
    });
  if (!den) return { status: 'unparsed' };
  if (def.controls.some((c) => c.group === 'eq') && vals.eqOn == null)
    reasons.push({ kind: 'none', text: 'EQ enablement not stated; band values are not compared' });
  if (toneCount) {
    const w = worst as { c: Control; cv: number; uv: number } | null;
    if (worstD > 1 && w)
      reasons.push({ kind: diffKind(worstD), text: nice(w.c.label) + ' ' + f1(w.cv) + ' vs your ' + f1(w.uv) });
    else reasons.push({ kind: 'match', text: 'Other knobs all within ' + f1(Math.max(worstD, 0)) });
  }
  if (eqGaps.length) {
    const avg = eqGaps.reduce((a, b) => a + b, 0) / eqGaps.length;
    reasons.push({
      kind: avg <= 0.6 ? 'match' : avg <= 1.5 ? 'near' : 'off',
      text: 'EQ sliders · average gap ' + f1(avg),
    });
  }
  swOff.forEach((t) => reasons.push({ kind: 'off', text: t }));
  if (!swOff.length && swSame)
    reasons.push({
      kind: 'match',
      text: swSame === 1 ? 'Switch setting matches' : 'All ' + swSame + ' switch settings match',
    });
  const base = den ? num / den : 0;
  const coverage = maxDen ? Math.min(1, den / maxDen) : 0;
  let total = base * coverage * (sameCh ? 1 : channelRecorded ? 0.5 : 0.8);
  // Pedals: a different chain (or one side without) keeps the match at most partial; the same
  // chain adds its pedals' knobs, which count for PEDAL_SHARE of the score.
  const yours = as.chain || [],
    theirs = cap.chain || [];
  if (yours.length || theirs.length) {
    if (chainKey(yours) !== chainKey(theirs)) {
      total *= PEDAL_MISS;
      reasons.push({
        kind: 'off',
        text:
          (theirs.length ? 'Pedals: ' + chainName(theirs, gear) : 'No pedals') +
          ' · yours ' +
          (yours.length ? chainName(yours, gear) : 'none'),
      });
    } else {
      const ps = chainSimilarity(theirs, yours, gear);
      const same = 'Same pedal' + (theirs.length > 1 ? 's' : '') + ' · ' + chainName(theirs, gear);
      if (ps) {
        total = total * (1 - PEDAL_SHARE) + ps.sim * PEDAL_SHARE;
        reasons.push({
          kind: ps.worst && ps.worst.d > 1 ? diffKind(ps.worst.d) : 'match',
          text: ps.worst && ps.worst.d > 1 ? ps.worst.text : same,
        });
      } else reasons.push({ kind: 'match', text: same });
    }
  }
  const score = Math.round(100 * total);
  if (coverage < 1)
    reasons.push({
      kind: 'none',
      text: Math.round(coverage * 100) + '% weighted settings coverage; missing controls reduce similarity',
    });
  return { status: 'scored', score, coverage, reasons };
}

/** The tier a score falls in: [label, css tier class]. */
export const tierOf = (score: number): [string, 't1' | 't2' | 't3'] =>
  score >= 80 ? ['Close match', 't1'] : score >= STRONG_MATCH_MIN ? ['Partial match', 't2'] : ['Low similarity', 't3'];

/** Up to three reasons for a card: the lead reason, then differences, then the rest, without repeats. */
export function cardReasons(list: Reason[]): Reason[] {
  const seen = new Set<string>();
  return [list[0]]
    .concat(
      list.filter((z) => z.kind === 'off'),
      list.slice(1),
    )
    .filter((z): z is Reason => !!z && !seen.has(z.text) && !!seen.add(z.text))
    .slice(0, 3);
}
