// Settings: reading a description's setting rows and parsing them against a gear definition.
import type {
  CaptureSettings,
  Control,
  ControlValue,
  GearDef,
  NotApplicable,
  ParseRules,
  ValueAliases,
  Values,
} from '../../shared/schema';
import { W, escapeRe, lines, norm } from '../lib/text';
import { channelToken, channelsFromDescription, isChannelHeader } from './channels';
import { TRADEMARK_RE } from './identity';
import type { Entry, Row } from './types';

export const NA = new Set(['n/a', 'na', 'not applicable']);
const VALUE_SUFFIXES = [
  'left position',
  'right position',
  'middle position',
  'pre eq',
  'post eq',
  'disengaged',
  'disabled',
  'engaged',
  'enabled',
  'reversed',
  'reverse',
  'normal',
  'boost',
  'active',
  'passive',
  'high',
  'low',
  'down',
  'up',
  'off',
  'on',
  'out',
  'in',
  'lo',
  'hi',
];
const SUFFIX_RES = [...VALUE_SUFFIXES]
  .sort((a, b) => b.length - a.length)
  .map((s) => new RegExp('^(.+?)\\s+' + escapeRe(s) + '$', 'i'));

/** Control name of a setting line that omits the colon before its value. */
export function bareControlName(line: string): string {
  if (!line || TRADEMARK_RE.test(line) || isChannelHeader(line)) return '';
  if (/^\(?no specific settings captured\)?$/i.test(line)) return '';
  for (const re of SUFFIX_RES) {
    const m = line.match(re);
    if (m) return m[1]!.trim();
  }
  const value = line.match(/^(.+?)\s+([+-]?(?:\d+(?:[.,]\d+)?|\.\d+)(?:\s*(?:dB|kHz|Hz|MHz|%))?|n\/?a)$/i);
  if (value) return value[1]!.trim();
  // A few settings repeat a selector value after a slash, e.g. "VMT / B3K VMT".
  const repeated = line.match(/^(.+?\/\s*.+?)\s+([A-Z][A-Z0-9/-]*)$/);
  if (repeated && repeated[1]!.split(/\s+/).filter(Boolean).at(-1)!.toLowerCase() === repeated[2]!.toLowerCase())
    return repeated[1]!.trim();
  return '';
}

/** [setting rows, unparsed lines, channel token] of the first amplifier block only, never the
 *  subsequent pedal settings. A device header such as "Power amp: Mesa Boogie® 2:Ninety…" ends the
 *  block unless its label is in readOn (parse.readOn): then the header is kept as a row and reading
 *  goes on (pair it with parse.sections). */
export function settingLines(
  row: Pick<Row, 'description' | 'name'>,
  readOn: string[] = [],
): [Entry[], string[], string | null] {
  const keepReading = new Set(readOn.map(norm));
  const ls = lines(row.description || '');
  let channel: string | null = null;
  for (const line of ls) {
    if (/^\s*(?:Settings|Amp settings|AMP\s*\(|AMP\s*:)/i.test(line)) break;
    if (/^\s*(?:This is a capture|Full rig|Raw Capture)/i.test(line)) {
      const found = channelsFromDescription(line);
      if (found.length === 1) channel = found[0]!;
    }
  }
  if (channel === null) {
    const found = channelsFromDescription('', row.name || '');
    if (found.length === 1) channel = found[0]!;
  }
  let active = false;
  const settings: Entry[] = [],
    unparsed: string[] = [];
  for (const rawLine of ls) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:Pedal\s*\d+|Pedal settings|Over Drive)\s*:/i.test(line)) break;
    const header = line.match(/^([^:]+):\s*(.*)$/);
    if (active && header && keepReading.has(norm(header[1]))) {
      settings.push({ label: header[1]!.trim(), raw: header[2]!.trim() || '-', channel });
      continue;
    }
    if (active && /[®™]/.test(line)) break;
    const start = line.match(/^(?:Settings|Amp settings|AMP(?:\s*\(Ch\.?\s*(\d+)\))?)\s*:\s*(.*)$/i);
    if (!active && /^(?:B7K|VU)(?:\s*\(Legacy\))?\s*:/i.test(line)) {
      active = true;
      continue;
    }
    if (start) {
      if (active) break;
      active = true;
      if (start[1]) channel = start[1];
      if (['n/a', 'na'].includes(start[2]!.toLowerCase())) break;
      continue;
    }
    if (!active) continue;
    if (/^(?:CAB|EQUALIZER|GRAPHIC EQ)\s*:\s*$/i.test(line)) break;
    const m = line.match(/^(Channel|CH)\s*:\s*(.*)$/i);
    const heading = line.match(new RegExp('^((?:' + W + '|-)+)\\s+Channel$', 'iu'));
    const numbered = line.match(/^Channel\s+(\d+)\s*:\s*(.*)$/i);
    if (m || heading || numbered) {
      if (m && ['on', 'off'].includes(m[2]!.trim().toLowerCase())) {
        settings.push({ label: 'Channel switch', raw: m[2]!.trim(), channel });
        continue;
      }
      channel = channelToken(m ? m[2]! : heading ? heading[1]! : numbered![1]!);
      if (numbered && numbered[2]) {
        const rest = numbered[2],
          name = bareControlName(rest);
        if (name) settings.push({ label: name, raw: rest.slice(name.length).trim(), channel });
      }
      continue;
    }
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (kv) {
      const label = kv[1]!.trim(),
        value = kv[2]!.trim();
      if (value) settings.push({ label, raw: value, channel });
      continue;
    }
    const label = bareControlName(line);
    if (label) settings.push({ label, raw: line.slice(label.length).trim(), channel });
    else if (!['(no specific settings captured)', 'in efx loop'].includes(line.toLowerCase())) unparsed.push(line);
  }
  return [settings, unparsed, channel];
}

/** Number, boolean (on/off), text, or null for N/A. */
export function valueOf(raw: string): ControlValue | null {
  if (NA.has(raw.toLowerCase().trim())) return null;
  const m = raw.match(/^([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(dB|Hz|kHz|%)?$/i);
  if (m) return parseFloat(m[1]!.replace(',', '.'));
  if (['on', 'off'].includes(raw.toLowerCase())) return raw.toLowerCase() === 'on';
  return raw.trim();
}

function channelNumber(definition: GearDef, token: string | null | undefined): number | null {
  if (token === null || token === undefined) return null;
  for (const ch of definition.channels || []) {
    const names = new Set([norm(ch.name), ...(ch.aliases || []).map(norm)]);
    if (!(ch.aliases || []).length) names.add(norm(ch.n));
    if (names.has(norm(token))) return ch.n;
  }
  return null;
}

function customValue(control: Control, raw: string): ControlValue | null {
  const value = valueOf(raw);
  if (control.kind !== 'switch')
    return typeof value === 'number' && control.min <= value && value <= control.max ? value : null;
  for (const option of control.options) {
    if (value === option.v) return value;
    if ([option.label, option.v, ...(option.aliases || [])].some((a) => norm(a) === norm(raw))) return option.v;
  }
  return null;
}

/** Description-structure rules from a custom amp's "parse" block. */
function applyParseRules(
  rules: ParseRules,
  entries: Entry[],
  token: string | null,
  leftovers: string[],
): [Entry[], string | null, string[]] {
  const rows = new Set((rules.channelFromRows || []).map(norm));
  if (rows.size) {
    const modes = entries.filter((e) => rows.has(norm(e.label)));
    const picked = modes.filter((e) => valueOf(e.raw) !== null);
    if (picked.length === 1) token = picked[0]!.label + ' ' + picked[0]!.raw;
    else if (picked.length > 1) leftovers = [...leftovers, 'Conflicting ' + rules.channelFromRows!.join('/') + ' rows'];
    entries = entries.filter((e) => !modes.includes(e));
  }
  const ignore = new Set((rules.ignoreWhenNA || []).map(norm));
  entries = entries.filter((e) => !(ignore.has(norm(e.label)) && valueOf(e.raw) === null));
  for (const section of rules.sections || []) {
    const split = entries.findIndex((e) => norm(e.label) === norm(section.startsAt));
    if (split >= 0) {
      const rename = Object.fromEntries(Object.entries(section.rename || {}).map(([k, v]) => [norm(k), v]));
      entries = [
        ...entries.slice(0, split),
        ...entries.slice(split + 1).map((e) => ({ ...e, label: rename[norm(e.label)] ?? e.label })),
      ];
    }
  }
  return [entries, token, leftovers];
}

/** Value spellings ({label: {spelling: value}}) → a function mapping a setting row's raw value. */
export function valueAliaser(valueAliases: ValueAliases | null | undefined): (e: Entry) => Entry {
  const map = new Map(
    Object.entries(valueAliases || {}).map(([label, vals]) => [
      norm(label),
      new Map(Object.entries(vals).map(([from, to]) => [norm(from), to])),
    ]),
  );
  return map.size
    ? (e) => {
        const to = map.get(norm(e.label))?.get(norm(e.raw));
        return to === undefined ? e : { ...e, raw: to as string };
      }
    : (e) => e;
}

/** [settings | null, uninterpreted lines] for one capture against a gear definition. */
export function parseSettings(
  row: Pick<Row, 'description' | 'name'>,
  definition: GearDef,
  parsed: [Entry[], string[], string | null] | null = null,
): [CaptureSettings | null, string[]] {
  const readOn = (definition.parse && definition.parse.readOn) || [];
  let [entries, leftovers, token] = parsed && !readOn.length ? parsed : settingLines(row, readOn);
  [entries, token, leftovers] = applyParseRules(definition.parse || {}, entries, token, leftovers);
  entries = entries.map(valueAliaser(definition.valueAliases));
  const values: Values = {},
    channelValues = new Map<number, Values>(),
    rejected = [...leftovers],
    collisions = new Set<string>();
  let na: NotApplicable[] = [],
    n = channelNumber(definition, token);
  // Several controls can share a label (a knob and a switch both written "Gain"): numbers go to
  // the knob, text to the switch whose options contain it.
  const aliasMap = new Map<string, Control[]>();
  for (const control of definition.controls)
    for (const alias of new Set([control.label, control.key, ...(control.aliases || [])].map(norm))) {
      if (!aliasMap.has(alias)) aliasMap.set(alias, []);
      aliasMap.get(alias)!.push(control);
    }
  // Repeated lines of one label fill its controls in order (first unused one that fits).
  const used = new Set<string>();
  const controlFor = (label: string, raw: string, n: number | null): Control | undefined => {
    let cands = aliasMap.get(norm(label));
    // An N/A line among several same-label controls is the next unused one in definition order, whatever its
    // channel: descriptions that list every channel's knobs write the other channel's ones as N/A.
    if (cands && cands.length > 1 && NA.has(String(raw).trim().toLowerCase())) {
      const next = cands.find((c) => !used.has(c.key));
      if (next) {
        used.add(next.key);
        return next;
      }
    }
    // controls that share a label on different channels (e.g. a "Volume" knob per channel)
    if (cands && cands.length > 1 && n !== null && definition.channels) {
      const here = cands.filter((c) => !c.channels || c.channels.includes(n));
      if (here.length) cands = here;
    }
    if (!cands || cands.length === 1) return cands ? cands[0] : undefined;
    const v = valueOf(raw),
      fresh = cands.filter((c) => !used.has(c.key));
    const pick = (list: Control[]) =>
      typeof v === 'number'
        ? list.find((c) => c.kind !== 'switch')
        : list.find((c) => c.kind === 'switch' && customValue(c, raw) !== null) ||
          list.find((c) => c.kind === 'switch');
    const c = pick(fresh) || pick(cands) || cands[0]!;
    used.add(c.key);
    return c;
  };
  for (const entry of entries) {
    const control = controlFor(entry.label, entry.raw, channelNumber(definition, entry.channel));
    if (!control) {
      rejected.push(entry.label + ': ' + entry.raw);
      continue;
    }
    const key = control.key,
      entryN = channelNumber(definition, entry.channel);
    if (NA.has(entry.raw.toLowerCase())) {
      na.push({ key, channel: entryN });
      continue;
    }
    if (definition.channels && entryN !== null && control.channels && !control.channels.includes(entryN)) continue;
    const value = customValue(control, entry.raw);
    if (value === null) {
      rejected.push(entry.label + ': ' + entry.raw);
      continue;
    }
    if (entryN !== null && !channelValues.has(entryN)) channelValues.set(entryN, {});
    const target = entryN !== null ? channelValues.get(entryN)! : values,
      collision = entryN + '|' + key;
    if (key in target && target[key] !== value) {
      collisions.add(collision);
      delete target[key];
      rejected.push('Conflicting ' + entry.label + ' values');
    } else if (!collisions.has(collision)) target[key] = value;
  }
  if (channelValues.size === 1) {
    n = [...channelValues.keys()][0]!;
    Object.assign(values, channelValues.get(n));
  } else if (channelValues.size > 1) n = null;
  if (!Object.keys(values).length && ![...channelValues.values()].some((v) => Object.keys(v).length))
    return [null, rejected];
  na = na.filter(
    (e) => !(e.key in (e.channel !== null && channelValues.has(e.channel) ? channelValues.get(e.channel)! : values)),
  );
  const assumed: string[] = [];
  for (const [key, value] of Object.entries((definition.parse || {}).assumeWhenMissing || {})) {
    const stated = key in values || [...channelValues.values()].some((v) => key in v) || na.some((e) => e.key === key);
    if (!stated) {
      values[key] = value;
      assumed.push(key);
    }
  }
  return [
    {
      channel: n,
      values,
      byChannel: Object.fromEntries(channelValues),
      notApplicable: na,
      ...(assumed.length ? { assumed } : {}),
    },
    rejected,
  ];
}
