#!/usr/bin/env node
// Part 2: build the app databases from data/captures-raw.json (made by har-to-captures.mjs).
//
// Reads the raw capture list (whitelisted API fields only, see FIELDS there), plus the hand-maintained
// data/custom-amps.json, and writes data/gear.json, data/captures.json and
// data/mapping-report.json. The app fetches gear.json and captures.json at runtime.
// The raw list is never modified.
//
// Amp-specific knowledge lives in data/custom-amps.json, not in this file:
// data/gear-identities.json holds rules for generic gear, keyed by gear id: identity rules for
// gear whose description wording the generic naming gets wrong ({"id", "brand", "model", "match"};
// the definition is still inferred from the captures), and/or "valueAliases" — other spellings of
// a control's values, mapped onto one value before inference and parsing:
//   {"id": "<gear id>", "valueAliases": {"<label>": {"<spelling>": "<value>"}}}
//
//   match    identity rules for a custom amp:
//              {"source": regex on the described amp, "tags": [tag, ...], "name": regex on the capture name}
//              (tags/name only apply when the description names no amp)
//   aliases  on controls (label spellings) and on switch options (value spellings)
//   parse    description-structure rules:
//              "channelFromRows": [row labels]  the one non-N/A row, "<label> <value>", is the channel
//              "ignoreWhenNA":    [row labels]  rows dropped when N/A (not matched controls)
//              "sections": [{"startsAt": label, "rename": {label: new label}}]
//                                                rows after the "startsAt" row belong to a second unit
//                                                (the startsAt row itself is dropped); repeated labels
//                                                there are renamed instead of conflicting
//              "assumeWhenMissing": {key: value}  a readable capture that doesn't state the control
//                                                gets this value, listed in settings.assumed
// Generic amps are inferred from the descriptions. No dependencies.
//
// Usage: node tools/build-data.mjs [data/captures-raw.json]   (npm run build:data)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AMP_TYPES = new Set(['amp_head', 'amp_combo', 'amp_and_cab', 'default']);
// Gear categories from Cortex Cloud device types; full rigs ("default") are amp captures.
const CATEGORY = { amp_head: 'Amps', amp_combo: 'Amps', amp_and_cab: 'Amps', default: 'Amps', compressor: 'Compressors', fuzz: 'Fuzz', overdrive: 'Overdrive', pedal: 'Pedals' };
export const categoryOf = (typeCode) => CATEGORY[typeCode] || (typeCode ? titleCase(typeCode.replace(/_/g, ' ')) : 'Other');
const ONOFF = [{ v: true, label: 'ON' }, { v: false, label: 'OFF' }];
const TYPE_LABELS = { amp_head: 'Amp Head', amp_and_cab: 'Amp + Cab', amp_combo: 'Amp Combo', cab: 'Cab', pedal: 'Pedal',
  fuzz: 'Fuzz', compressor: 'Compressor', overdrive: 'Overdrive', default: 'Default' };
const NA = new Set(['n/a', 'na', 'not applicable']);

// ---------- small string helpers ----------

const lines = (text) => text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const stripChars = (s, chars) => { let a = 0, b = s.length; while (a < b && chars.includes(s[a])) a++; while (b > a && chars.includes(s[b - 1])) b--; return s.slice(a, b); };
const rstripChars = (s, chars) => { let b = s.length; while (b > 0 && chars.includes(s[b - 1])) b--; return s.slice(0, b); };
const isDigits = (s) => /^\d+$/.test(s);
const titleCase = (s) => s.toLowerCase().replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
const capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
// Values parsed from descriptions are numbers; labels keep the "5.0" spelling the data has always used.
const valueLabel = (v) => typeof v === 'number' && Number.isInteger(v) ? v.toFixed(1) : String(v);
const W = '[\\p{L}\\p{M}\\p{N}_]';

export function norm(text) {
  return String(text).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
export function slug(text) {
  return text.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- raw capture fields ----------

/** First nonempty value among dotted paths of a raw API capture object. */
export function first(raw, ...paths) {
  for (const p of paths) {
    let value = raw;
    for (const part of p.split('.')) value = value && typeof value === 'object' && !Array.isArray(value) ? value[part] : undefined;
    if (value != null && value !== '' && !(Array.isArray(value) && !value.length) && !(typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)) return value;
  }
  return '';
}

/** The few fields description parsing needs, read from a raw capture object. */
export function record(raw) {
  let typeCode = first(raw, 'metadata.deviceType', 'deviceType', 'captureType', 'capture_type');
  if (!typeCode) {
    const productType = String(raw.type || raw.productType || '').toLowerCase();
    typeCode = productType === 'neural_capture' || productType === 'neuralcapture' ? '' : productType;
  }
  return { capture_id: String(first(raw, 'id', 'productId', 'captureId')), name: String(raw.name || raw.productName || ''),
    description: String(first(raw, 'description', 'metadata.description')), type_code: String(typeCode),
    tags: Array.isArray(raw.tags) ? raw.tags : [] };
}

// ---------- description text helpers ----------

const TRADEMARK_RE = /[®™]/;
const KEY_VALUE = /^\s*(.+?)\s*:\s*(.*?)\s*$/;
const VALUE_SUFFIXES = ['left position', 'right position', 'middle position', 'pre eq', 'post eq', 'disengaged', 'disabled', 'engaged',
  'enabled', 'reversed', 'reverse', 'normal', 'boost', 'active', 'passive', 'high', 'low', 'down', 'up', 'off', 'on', 'out', 'in', 'lo', 'hi'];
const SUFFIX_RES = [...VALUE_SUFFIXES].sort((a, b) => b.length - a.length).map((s) => new RegExp('^(.+?)\\s+' + escapeRe(s) + '$', 'i'));

/** The described source amp/model, not the user's capture nickname. */
export function sourceAmpName(description) {
  const ls = lines(description);
  for (const line of ls) { const m = line.match(/^\s*This is a capture of\s+(.+?)\s*$/i); if (m) return rstripChars(m[1], ' .'); }
  // In multi-device descriptions, Cortex Cloud lists the captured amp first, then pedals/processors.
  for (const line of ls) { const m = line.match(/^\s*Captured Devices?:\s*(.+?)\s*$/i); if (m) return rstripChars(m[1].split(',')[0].trim(), ' .'); }
  for (const line of ls) { const m = line.match(/^\s*AMP:\s*(.+?)\s*$/i); if (m && m[1].trim()) return rstripChars(m[1].trim(), ' .'); }
  // A few user-entered full-rig captures use prose instead of the standard labels.
  for (const line of ls) {
    const m = line.match(/^\s*(?:full\s+rig|raw)\s+capture\s+(?:(?:made\s+)?from|form)\s+(.+?)\s*$/i);
    if (m) return rstripChars(m[1].split(/\s+(?:ch(?:annel)?\.?\s*\d+|with\b|and\b|made\s+by\b)/i)[0].trim(), ' .');
  }
  return '';
}

/** [normalized manufacturer, source brand prefix] when identifiable. */
export function brandInfo(sourceName) {
  if (!sourceName) return ['', ''];
  // Product names ending in "by Neural DSP" name the software maker after "by".
  if (/\bby\s+Neural DSP\s*[®™]?\s*$/i.test(sourceName)) return ['Neural DSP', ''];
  // Mesa/Boogie sometimes marks the two words separately (Mesa® Boogie®).
  const mesa = sourceName.match(/^\s*mesa(?:\s*[®™]\s*|\s+)(?:\/\s*)?boogie/i);
  if (mesa) return ['Mesa/Boogie', mesa[0].replace(/[®™]/g, '').trim()];
  const mark = sourceName.search(TRADEMARK_RE);
  if (mark < 0) {
    // Unmarked "Maker’s Model" names the maker in the possessive.
    const possessive = sourceName.match(/^\s*([A-Z][\w&.\- ]*?)[’']s\s+(?=\S)/);
    return possessive ? [possessive[1].trim(), possessive[0].trim()] : ['', ''];
  }
  // Some stock descriptions put the amp's year before the manufacturer.
  const prefix = stripChars(sourceName.slice(0, mark), ' \t.,:;"\'“”‘’').replace(/^[’']?\d{2,4}\s+/, '');
  if (!prefix) return ['', ''];
  // The source descriptions consistently misspell Aguilar.
  const aliases = { aquilar: 'Aguilar', engl: 'ENGL', mesa: 'Mesa/Boogie', 'mesa boogie': 'Mesa/Boogie' };
  return [aliases[prefix.toLowerCase()] || prefix, prefix];
}

function channelValue(value) {
  value = stripChars(value.trim(), ' .,:;()[]');
  if (!value || ['n/a', 'na', 'none', 'not applicable'].includes(value.toLowerCase())) return '';
  value = value.replace(/^(?:channel|ch\.?)\s*/i, '').trim().replace(/\s+channel$/i, '').trim();
  if (/^[a-z]$/i.test(value)) return value.toUpperCase();
  if (/^\d+(?:[-+&]\d+)?$/.test(value)) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function channelsFromDescription(description, captureName = '') {
  const channels = [];
  const add = (value) => { const ch = channelValue(value); if (ch && !channels.some((c) => c.toLowerCase() === ch.toLowerCase())) channels.push(ch); };
  for (const line of lines(description)) {
    const stripped = line.trim();
    if (!stripped) continue;
    const kv = stripped.match(KEY_VALUE);
    if (kv) {
      const key = kv[1].trim(), value = kv[2].trim();
      const ampSection = key.match(/^amp\s*\(\s*ch\.?\s*(\d+(?:[-+&]\d+)?|[a-z])\s*\)$/i);
      if (ampSection) { add(ampSection[1]); continue; }
      if (/^(?:channel|ch)\s*$/i.test(key)) { add(value); continue; }
      const numberedKey = key.match(/^(?:channel|ch\.?)\s+(\d+(?:[-+&]\d+)?|[a-z])$/i);
      if (numberedKey) { add(numberedKey[1]); continue; }
    } else {
      const numberedHeading = stripped.match(/^(?:channel|ch\.?)\s*[-:#]?\s*(\d+(?:[-+&]\d+)?|[a-z])$/i);
      if (numberedHeading) { add(numberedHeading[1]); continue; }
      const namedHeading = stripped.match(/^([a-z0-9][a-z0-9 -]*?)\s+channel$/i);
      if (namedHeading) { add(namedHeading[1]); continue; }
      // Narrative source descriptions commonly say "amp channel 1".
      const narrative = stripped.match(/\b(?:channel|ch\.?)\s*\.?\s*(\d+(?:[-+&]\d+)?|[a-z])\b/i);
      if (narrative) add(narrative[1]);
      const namedNarrative = stripped.match(/\bamp(?:lifier)?(?:['’]s)?\s+([a-z0-9-]+)\s+channel\b/i);
      if (namedNarrative && namedNarrative[1].toLowerCase() !== 'channel') add(namedNarrative[1]);
    }
  }
  // Some records omit the model/channel sentence but include it in the capture title.
  if (!channels.length && captureName) {
    const t = captureName.match(/\b(?:channel|ch\.?)\s*\.?\s*(\d+(?:[-+&]\d+)?|[a-d])\b/i);
    if (t) add(t[1]);
  }
  return channels;
}

const isChannelHeader = (line) => /^(?:channel|ch\.?)\s*[-:#]?\s*(?:\d+(?:[-+&]\d+)?|[a-z])$/i.test(line) || /^([a-z0-9][a-z0-9 -]*?)\s+channel$/i.test(line);

/** Control name of a setting line that omits the colon before its value. */
export function bareControlName(line) {
  if (!line || TRADEMARK_RE.test(line) || isChannelHeader(line)) return '';
  if (/^\(?no specific settings captured\)?$/i.test(line)) return '';
  for (const re of SUFFIX_RES) { const m = line.match(re); if (m) return m[1].trim(); }
  const value = line.match(/^(.+?)\s+([+-]?(?:\d+(?:[.,]\d+)?|\.\d+)(?:\s*(?:dB|kHz|Hz|MHz|%))?|n\/?a)$/i);
  if (value) return value[1].trim();
  // A few settings repeat a selector value after a slash, e.g. "VMT / B3K VMT".
  const repeated = line.match(/^(.+?\/\s*.+?)\s+([A-Z][A-Z0-9/-]*)$/);
  if (repeated && repeated[1].split(/\s+/).filter(Boolean).at(-1).toLowerCase() === repeated[2].toLowerCase()) return repeated[1].trim();
  return '';
}

// ---------- gear identity ----------

const tagsOf = (row) => row.tags || [];

/** Identity from the "match" rules of custom amps and data/gear-identities.json entries. */
function customIdentity(customs, { source = null, row = null }) {
  for (const d of customs) {
    const m = d.match || {};
    const found = source !== null
      ? !!m.source && new RegExp(m.source, 'i').test(source)
      : tagsOf(row).some((t) => (m.tags || []).some((x) => norm(x) === norm(t))) || (!!m.name && new RegExp('^(?:' + m.name + ')').test(row.name || ''));
    if (found) return { id: d.id, brand: d.brand, model: d.model, source: source !== null ? 'description' : 'capture-family/tags' };
  }
  return null;
}

/** Explicit identity and mapping provenance; ambiguous rows stay unmapped. */
export function ampIdentity(row, customs = []) {
  const description = row.description || '';
  let source = sourceAmpName(description);
  const explicit = description.match(/^Amp:[ \t]*(\S[^\n]*)$/im);
  const explicitModel = explicit ? explicit[1].replace(/^Mesa(?:[ /]+Boogie)?\s+/i, '') : '';
  // The stock "MixBass" rows sometimes name different amps in the source sentence and AMP
  // section. Preserve the row for review, don't choose one.
  if (explicit && source && !norm(source).includes(norm(explicitModel))) return null;
  if (!source) {
    // Without a described source, only amp captures are identified (from tags or name rules).
    if (!AMP_TYPES.has(row.type_code)) return null;
    const tags = new Set(tagsOf(row).map(norm));
    const custom = customIdentity(customs, { row });
    if (custom) return custom;
    // Strict manufacturer + model pairs only. Do not infer from "Mesa" alone.
    if (tags.has('bogner') && (tags.has('ecstacy100b') || tags.has('ecstasy100b'))) {
      const variant = tags.has('preamp') ? ' Preamp section' : '';
      return { id: slug('Bogner Ecstasy 100B' + variant), brand: 'Bogner', model: 'Ecstasy 100B' + variant, source: 'manufacturer/model tags' };
    }
    if (tags.has('toneking') && tags.has('imperialmkii')) return { id: 'tone-king-imperial-mkii', brand: 'Tone King', model: 'Imperial MKII', source: 'manufacturer/model tags' };
    if ((tags.has('mesa') || tags.has('mesaboogie')) && tags.has('tremoverb')) return { id: 'mesa-boogie-trem-o-verb-dual-rectifier', brand: 'Mesa/Boogie', model: 'Trem-O-Verb Dual Rectifier', source: 'manufacturer/model tags' };
    return null;
  }
  // A distortion pedal + amplifier chain identifies the amp AFTER "with".
  const pedal = source.match(/\bpedal\s+with\s+/i);
  if (pedal) source = source.slice(pedal.index + pedal[0].length);
  const custom = customIdentity(customs, { source });
  if (custom) return custom;
  if (/by Neural DSP/i.test(source)) {
    const model = source.replace(/\s+by Neural DSP[®™]?\s*$/i, '');
    return { id: slug('Neural DSP ' + model), brand: 'Neural DSP', model, source: 'description (software capture)' };
  }
  let [brand, prefix] = brandInfo(source);
  let plain = rstripChars(source.replace(/[®™]/g, '').trim(), '.').replace(/^[’']?\d{2,4}\s+/, '');
  if (prefix) plain = plain.replace(new RegExp('^' + escapeRe(prefix) + '\\s*', 'i'), '');
  brand = { Douglas: 'Darkglass', Tech21: 'Tech 21' }[brand] || brand;
  let suffix = '';
  if (brand === 'Hermansson') { brand = 'Hiwatt'; plain = plain.replace(/^modded Hiwatt\s*/i, ''); suffix = ' (Hermansson modified)'; }
  else if (brand === 'Two Notes' && plain.startsWith('Supro')) { brand = 'Supro'; plain = plain.replace(/^Supro\s*/, ''); suffix = ' (Two Notes setup)'; }
  // Keep separately captured preamps/power sections distinct from full heads.
  const variant = /preamp section/i.test(plain) ? ' Preamp section' : /power amp section/i.test(plain) ? ' Power amp section' : '';
  const chain = plain.match(/\bpreamp\s+with\s+(.+?)\s+power amp/i);
  if (chain) suffix += ' + ' + chain[1].trim();
  plain = plain.split(/\s+(?:combo\s+)?amp(?:lifier)?(?:[’']s)?\b/i)[0];
  plain = rstripChars(plain.split(/\s+with\b/i)[0], ' .');
  plain = plain.replace(/\s+(?:combo\s+)?power$/i, '').replace(/\s+pedals?$/i, '');
  const model = plain + suffix + variant;
  // Unmarked nicknames are preserved as such, without inventing a manufacturer.
  return model ? { id: slug((brand || 'unverified') + ' ' + model), brand: brand || 'Unverified source', model, source: 'description' } : null;
}

// ---------- settings ----------

function channelToken(text) {
  text = rstripChars(text.trim(), '.');
  if (['n/a', 'na', 'none', ''].includes(text.toLowerCase())) return null;
  return text.replace(/^(?:channel|ch\.?)\s*/i, '').trim();
}

/** Setting rows of the first amplifier block only, never the subsequent pedal settings. */
export function settingLines(row) {
  const ls = lines(row.description || '');
  let channel = null;
  for (const line of ls) {
    if (/^\s*(?:Settings|Amp settings|AMP\s*\(|AMP\s*:)/i.test(line)) break;
    if (/^\s*(?:This is a capture|Full rig|Raw Capture)/i.test(line)) { const found = channelsFromDescription(line); if (found.length === 1) channel = found[0]; }
  }
  if (channel === null) { const found = channelsFromDescription('', row.name || ''); if (found.length === 1) channel = found[0]; }
  let active = false;
  const settings = [], unparsed = [];
  for (const rawLine of ls) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:Pedal\s*\d+|Pedal settings|Over Drive)\s*:/i.test(line)) break;
    if (active && /[®™]/.test(line)) break;
    const start = line.match(/^(?:Settings|Amp settings|AMP(?:\s*\(Ch\.?\s*(\d+)\))?)\s*:\s*(.*)$/i);
    if (!active && /^(?:B7K|VU)(?:\s*\(Legacy\))?\s*:/i.test(line)) { active = true; continue; }
    if (start) {
      if (active) break;
      active = true;
      if (start[1]) channel = start[1];
      if (['n/a', 'na'].includes(start[2].toLowerCase())) break;
      continue;
    }
    if (!active) continue;
    if (/^(?:CAB|EQUALIZER|GRAPHIC EQ)\s*:\s*$/i.test(line)) break;
    const m = line.match(/^(Channel|CH)\s*:\s*(.*)$/i);
    const heading = line.match(new RegExp('^((?:' + W + '|-)+)\\s+Channel$', 'iu'));
    const numbered = line.match(/^Channel\s+(\d+)\s*:\s*(.*)$/i);
    if (m || heading || numbered) {
      if (m && ['on', 'off'].includes(m[2].trim().toLowerCase())) { settings.push({ label: 'Channel switch', raw: m[2].trim(), channel }); continue; }
      channel = channelToken(m ? m[2] : heading ? heading[1] : numbered[1]);
      if (numbered && numbered[2]) {
        const rest = numbered[2], name = bareControlName(rest);
        if (name) settings.push({ label: name, raw: rest.slice(name.length).trim(), channel });
      }
      continue;
    }
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (kv) { const label = kv[1].trim(), value = kv[2].trim(); if (value) settings.push({ label, raw: value, channel }); continue; }
    const label = bareControlName(line);
    if (label) settings.push({ label, raw: line.slice(label.length).trim(), channel });
    else if (!['(no specific settings captured)', 'in efx loop'].includes(line.toLowerCase())) unparsed.push(line);
  }
  return [settings, unparsed, channel];
}

/** Number, boolean (on/off), text, or null for N/A. */
export function valueOf(raw) {
  if (NA.has(raw.toLowerCase().trim())) return null;
  const m = raw.match(/^([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(dB|Hz|kHz|%)?$/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  if (['on', 'off'].includes(raw.toLowerCase())) return raw.toLowerCase() === 'on';
  return raw.trim();
}

function channelNumber(definition, token) {
  if (token === null || token === undefined) return null;
  for (const ch of definition.channels || []) {
    const names = new Set([norm(ch.name), ...(ch.aliases || []).map(norm)]);
    if (!(ch.aliases || []).length) names.add(norm(ch.n));
    if (names.has(norm(token))) return ch.n;
  }
  return null;
}

function customValue(control, raw) {
  const value = valueOf(raw);
  if (control.kind !== 'switch') return typeof value === 'number' && control.min <= value && value <= control.max ? value : null;
  for (const option of control.options) {
    if (value === option.v) return value;
    if ([option.label, option.v, ...(option.aliases || [])].some((a) => norm(a) === norm(raw))) return option.v;
  }
  return null;
}

/** Description-structure rules from a custom amp's "parse" block. */
function applyParseRules(rules, entries, token, leftovers) {
  const rows = new Set((rules.channelFromRows || []).map(norm));
  if (rows.size) {
    const modes = entries.filter((e) => rows.has(norm(e.label)));
    const picked = modes.filter((e) => valueOf(e.raw) !== null);
    if (picked.length === 1) token = picked[0].label + ' ' + picked[0].raw;
    else if (picked.length > 1) leftovers = [...leftovers, 'Conflicting ' + rules.channelFromRows.join('/') + ' rows'];
    entries = entries.filter((e) => !modes.includes(e));
  }
  const ignore = new Set((rules.ignoreWhenNA || []).map(norm));
  entries = entries.filter((e) => !(ignore.has(norm(e.label)) && valueOf(e.raw) === null));
  for (const section of rules.sections || []) {
    const split = entries.findIndex((e) => norm(e.label) === norm(section.startsAt));
    if (split >= 0) {
      const rename = Object.fromEntries(Object.entries(section.rename || {}).map(([k, v]) => [norm(k), v]));
      entries = [...entries.slice(0, split), ...entries.slice(split + 1).map((e) => ({ ...e, label: rename[norm(e.label)] ?? e.label }))];
    }
  }
  return [entries, token, leftovers];
}

/** [settings | null, uninterpreted lines] for one capture against an amp definition. */
// Value spellings ({label: {spelling: value}}) → a function mapping a setting row's raw value.
function valueAliaser(valueAliases) {
  const map = new Map(Object.entries(valueAliases || {}).map(([label, vals]) => [norm(label), new Map(Object.entries(vals).map(([from, to]) => [norm(from), to]))]));
  return map.size ? (e) => { const to = map.get(norm(e.label))?.get(norm(e.raw)); return to === undefined ? e : { ...e, raw: to }; } : (e) => e;
}

export function parseSettings(row, definition, parsed = null) {
  let [entries, leftovers, token] = parsed || settingLines(row);
  [entries, token, leftovers] = applyParseRules(definition.parse || {}, entries, token, leftovers);
  entries = entries.map(valueAliaser(definition.valueAliases));
  const values = {}, channelValues = new Map(), rejected = [...leftovers], collisions = new Set();
  let na = [], n = channelNumber(definition, token);
  // Several controls can share a label (a knob and a switch both written "Gain"): numbers go to
  // the knob, text to the switch whose options contain it.
  const aliasMap = new Map();
  for (const control of definition.controls) for (const alias of new Set([control.label, control.key, ...(control.aliases || [])].map(norm))) { if (!aliasMap.has(alias)) aliasMap.set(alias, []); aliasMap.get(alias).push(control); }
  // Repeated lines of one label fill its controls in order (first unused one that fits).
  const used = new Set();
  const controlFor = (label, raw, n) => {
    let cands = aliasMap.get(norm(label));
    // controls that share a label on different channels (e.g. a "Volume" knob per channel)
    if (cands && cands.length > 1 && n !== null && definition.channels) { const here = cands.filter((c) => !c.channels || c.channels.includes(n)); if (here.length) cands = here; }
    if (!cands || cands.length === 1) return cands ? cands[0] : undefined;
    const v = valueOf(raw), fresh = cands.filter((c) => !used.has(c.key));
    const pick = (list) => typeof v === 'number' ? list.find((c) => c.kind !== 'switch')
      : list.find((c) => c.kind === 'switch' && customValue(c, raw) !== null) || list.find((c) => c.kind === 'switch');
    const c = pick(fresh) || pick(cands) || cands[0];
    used.add(c.key);
    return c;
  };
  for (const entry of entries) {
    const control = controlFor(entry.label, entry.raw, channelNumber(definition, entry.channel));
    if (!control) { rejected.push(entry.label + ': ' + entry.raw); continue; }
    const key = control.key, entryN = channelNumber(definition, entry.channel);
    if (NA.has(entry.raw.toLowerCase())) { na.push({ key, channel: entryN }); continue; }
    if (definition.channels && entryN !== null && control.channels && !control.channels.includes(entryN)) continue;
    const value = customValue(control, entry.raw);
    if (value === null) { rejected.push(entry.label + ': ' + entry.raw); continue; }
    if (entryN !== null && !channelValues.has(entryN)) channelValues.set(entryN, {});
    const target = entryN !== null ? channelValues.get(entryN) : values, collision = entryN + '|' + key;
    if (key in target && target[key] !== value) { collisions.add(collision); delete target[key]; rejected.push('Conflicting ' + entry.label + ' values'); }
    else if (!collisions.has(collision)) target[key] = value;
  }
  if (channelValues.size === 1) { n = [...channelValues.keys()][0]; Object.assign(values, channelValues.get(n)); }
  else if (channelValues.size > 1) n = null;
  if (!Object.keys(values).length && ![...channelValues.values()].some((v) => Object.keys(v).length)) return [null, rejected];
  na = na.filter((e) => !(e.key in (channelValues.has(e.channel) ? channelValues.get(e.channel) : values)));
  const assumed = [];
  for (const [key, value] of Object.entries((definition.parse || {}).assumeWhenMissing || {})) {
    const stated = key in values || [...channelValues.values()].some((v) => key in v) || na.some((e) => e.key === key);
    if (!stated) { values[key] = value; assumed.push(key); }
  }
  return [{ channel: n, values, byChannel: Object.fromEntries(channelValues), notApplicable: na, ...(assumed.length ? { assumed } : {}) }, rejected];
}

/** Generic amp definition from the settings its captures record. */
// One label can stand for several controls (e.g. a 0–10 "Gain" knob and a Lo/Hi "Gain" switch,
// both written "Gain: …" in the same capture). Numbers under a label form the knob; text values
// form switches, and text values that appear together in one capture belong to different
// switches. A label repeated with numbers, or with on/off values, in one capture is several
// controls numbered by position (e.g. "Volume 1"/"Volume 2", "Pull Bright 1"/"Pull Bright 2"). Each control only applies to the channels it was recorded on, and switches keep the
// options each channel actually uses (channelOptions) when channels differ.
export function inferAmp(identity, rows, valueAliases = null) {
  const alias = valueAliaser(valueAliases);
  const labels = new Map(), channels = [];
  for (const row of rows) {
    const inCapture = new Map();
    for (const entry of settingLines(row)[0].map(alias)) {
      const token = entry.channel;
      if (token !== null && !channels.some((c) => norm(c) === norm(token))) channels.push(token);
      const value = valueOf(entry.raw);
      if (value === null) continue;
      const key = norm(entry.label);
      if (!labels.has(key)) labels.set(key, { label: entry.label, obs: [], together: [], slots: 1, numSlots: 1 });
      if (!inCapture.has(key)) inCapture.set(key, []);
      const isNum = typeof value === 'number', pos = inCapture.get(key).filter((v) => (typeof v === 'number') === isNum).length;
      labels.get(key).obs.push({ value, channel: token, pos });
      inCapture.get(key).push(value);
    }
    for (const [key, vals] of inCapture) {
      const lines = vals.filter((v) => typeof v !== 'number'), texts = [...new Set(lines.map(String))];
      if (texts.length > 1) labels.get(key).together.push(texts);
      labels.get(key).slots = Math.max(labels.get(key).slots, lines.length);
      labels.get(key).numSlots = Math.max(labels.get(key).numSlots, vals.length - lines.length);
    }
  }
  channels.sort((a, b) => isDigits(a) !== isDigits(b) ? (isDigits(a) ? -1 : 1) : isDigits(a) ? Number(a) - Number(b) : a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  const numericChannels = channels.length && channels.every((c) => isDigits(c) && Number(c) >= 1 && Number(c) <= 9);
  // Source aliases are not guaranteed hardware channel counts.
  const channelDefs = channels.length ? channels.map((c, i) => ({ n: numericChannels ? Number(c) : i + 1, name: c, aliases: [c] })) : null;
  const controls = [];
  const defaults = { channel: channelDefs ? channelDefs[0].n : null, ch: Object.fromEntries((channelDefs || []).map((c) => [String(c.n), {}])), global: {} };
  for (const [key, { label, obs, together, slots, numSlots }] of labels) {
    const numbers = obs.filter((o) => typeof o.value === 'number'), texts = obs.filter((o) => typeof o.value !== 'number');
    let textParts;
    if (slots > 1 && texts.every((o) => typeof o.value === 'boolean')) {
      // Repeated on/off lines: one switch per position in the capture.
      textParts = Array.from({ length: slots }, (_, i) => ({ number: false, slot: i + 1, obs: texts.filter((o) => o.pos === i) }));
    } else {
      // Colour the "seen together" graph, most-constrained values first: a value joins the first
      // group it never appeared with (so Lo/Hi and Lead/Plexi end up as two switches).
      const conflicts = (x, v) => together.some((t) => t.includes(x) && t.includes(v));
      const values = [...new Set(texts.map((o) => String(o.value)))];
      const degree = (v) => values.filter((x) => x !== v && conflicts(x, v)).length;
      const groups = [];
      for (const v of [...values].sort((a, b) => degree(b) - degree(a))) {
        const g = groups.find((grp) => grp.every((x) => !conflicts(x, v)));
        if (g) g.push(v); else groups.push([v]);
      }
      // keep each group's values in first-seen order
      textParts = groups.map((g) => ({ number: false, obs: texts.filter((o) => g.includes(String(o.value))) }))
        .sort((a, b) => texts.indexOf(a.obs[0]) - texts.indexOf(b.obs[0]));
    }
    const numberParts = !numbers.length ? [] : numSlots > 1
      ? Array.from({ length: numSlots }, (_, i) => ({ number: true, slot: i + 1, obs: numbers.filter((o) => o.pos === i) }))
      : [{ number: true, obs: numbers }];
    const parts = numberParts.concat(textParts);
    const split = parts.length > 1;
    for (const part of parts) {
      const vals = part.obs.map((o) => o.value);
      const control = { key, label, aliases: [label], scope: channelDefs ? 'channel' : 'global', weight: 1 };
      let defFor;
      if (part.number) {
        if (part.slot) { control.key = key + '_' + part.slot; control.label = label + ' ' + part.slot; }
        const frequency = /^\d+(?:\.\d+)?\s*(?:k?Hz)$/i.test(label);
        Object.assign(control, { kind: frequency ? 'fader' : 'knob', min: Math.min(0, ...vals), max: Math.max(10, ...vals), step: 0.1 });
        // Main control: gain/drive/volume, or the effect's own amount (distortion, fuzz, sustain, compression).
        if (/gain|drive|volume|dist|fuzz|sustain|^sus$|compression|input\/comp/i.test(label) && !controls.some((c) => c.primary)) control.primary = true;
        const d = control.min <= 5 && 5 <= control.max ? 5 : control.min;
        defFor = () => d;
      } else {
        let options = [];
        for (const value of vals) if (options.every((o) => value !== o.v)) options.push({ v: value, label: typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : valueLabel(value) });
        if (vals.every((v) => typeof v === 'boolean')) options = ONOFF;
        Object.assign(control, { kind: 'switch', options });
        if (part.slot) { control.key = key + '_' + part.slot; control.label = label + ' ' + part.slot; }
        else if (split) {
          const names = options.map((o) => o.label);
          control.key = key + '_' + norm(names.join(''));
          control.label = label + ' (' + (names.length > 3 ? names.slice(0, 2).join('/') + '/…' : names.join('/')) + ')';
        }
        if (channelDefs) {
          // Options each channel actually uses, kept only when channels differ.
          const per = {};
          for (const o of part.obs) { const n = channelDefs.find((c) => c.name === o.channel)?.n; if (n !== undefined && !(per[n] || (per[n] = [])).includes(o.value)) per[n].push(o.value); }
          const ordered = Object.fromEntries(Object.entries(per).map(([n, vs]) => [n, options.map((o) => o.v).filter((v) => vs.includes(v))]));
          if (Object.values(ordered).some((vs) => vs.length !== options.length)) control.channelOptions = ordered;
        }
        defFor = (n) => (control.channelOptions && control.channelOptions[n] ? control.channelOptions[n][0] : options[0].v);
      }
      const recorded = new Set(part.obs.map((o) => o.channel).filter((c) => c !== null));
      if (channelDefs) {
        const applicable = channelDefs.filter((c) => !recorded.size || recorded.has(c.name)).map((c) => c.n);
        control.channels = applicable;
        for (const n of applicable) defaults.ch[String(n)][control.key] = defFor(n);
      } else defaults.global[control.key] = defFor(null);
      controls.push(control);
    }
  }
  return { ...identity, panel: 'generic', channels: channelDefs, controls, defaults, definitionSource: 'capture descriptions', ...(valueAliases ? { valueAliases } : {}),
    defaultsNote: 'Capture-derived controls; numeric ranges assume 0–10 and expand to include recorded values. Not a verified hardware panel. Reset values are reference positions, not a capture.' };
}

/** App capture record: identifying fields, mapping, parsed settings, tags and the description (as
 *  copied, without stock header lines). */
export function toCapture(raw, identity, definition) {
  const row = record(raw);
  const [settings, rejected] = definition ? parseSettings(row, definition) : [null, []];
  const version = String(first(raw, 'metadata.version'));
  const count = (key) => /^\d+$/.test(String(raw[key] ?? '')) ? parseInt(raw[key], 10) : null;
  return {
    id: row.capture_id, productId: raw.productId || row.capture_id, hash: raw.hash ?? '',
    ampId: identity ? identity.id : null, mappingSource: identity ? identity.source : 'unmapped/effect',
    name: row.name, captureType: 'Neural Capture' + (version ? ' V' + version : ''),
    deviceType: row.type_code ? TYPE_LABELS[row.type_code.toLowerCase()] || titleCase(row.type_code.replace(/_/g, ' ')) : 'Unknown', deviceTypeCode: row.type_code,
    instrument: capitalize(String(first(raw, 'metadata.instrumentType')) || 'Unknown'),
    gainType: String(first(raw, 'metadata.gainType')) || 'Not stated',
    tags: tagsOf(row), author: { username: String(raw.authorUsername || '') },
    creator: { type: raw.creatorType ?? '', version: raw.creatorVersion ?? '' },
    published: typeof raw.published === 'boolean' ? raw.published : null,
    likes: count('likes'), stars: count('stars'), downloads: count('downloads'),
    description: row.description, settings, uninterpretedSettings: rejected,
  };
}

const byText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function build(rawPath = path.join(ROOT, 'data/captures-raw.json'), outputDir = path.join(ROOT, 'data')) {
  const raws = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  if (!Array.isArray(raws) || !raws.length) throw new Error('Expected a nonempty JSON list of captures (run tools/har-to-captures.mjs first)');
  const rows = raws.map(record), ids = rows.map((r) => r.capture_id);
  if (!ids.every(Boolean) || new Set(ids).size !== ids.length) throw new Error('Capture IDs must be nonempty and unique');
  const customs = JSON.parse(fs.readFileSync(path.join(outputDir, 'custom-amps.json'), 'utf8'));
  const identityFile = path.join(outputDir, 'gear-identities.json');
  const rules = [...customs, ...(fs.existsSync(identityFile) ? JSON.parse(fs.readFileSync(identityFile, 'utf8')) : [])];
  const definitions = new Map(customs.map((d) => [d.id, d])), groups = new Map(), identities = new Map();
  for (const row of rows) {
    const identity = ampIdentity(row, rules);
    identities.set(row.capture_id, identity);
    if (identity) { if (!groups.has(identity.id)) groups.set(identity.id, []); groups.get(identity.id).push(row); }
  }
  const valueAliases = Object.fromEntries(rules.filter((r) => r.valueAliases && !customs.includes(r)).map((r) => [r.id, r.valueAliases]));
  for (const [ampId, group] of groups) if (!definitions.has(ampId)) definitions.set(ampId, inferAmp(identities.get(group[0].capture_id), group, valueAliases[ampId] || null));
  for (const d of definitions.values()) {
    const rowsOf = groups.get(d.id) || [];
    d.captureCount = rowsOf.length;
    // Category: the most common device type among the gear's captures (custom entries may set it);
    // on a tie, Amps wins (a capture with a cab sim is often typed "Amp + Cab").
    const counts = new Map();
    rowsOf.forEach((r) => counts.set(categoryOf(r.type_code), (counts.get(categoryOf(r.type_code)) || 0) + 1));
    if (!d.category) d.category = [...counts].sort((a, b) => b[1] - a[1] || (b[0] === 'Amps') - (a[0] === 'Amps'))[0]?.[0] || 'Amps';
  }
  const customIds = new Set(customs.map((a) => a.id));
  const amps = [...customs, ...[...definitions.values()].filter((d) => !customIds.has(d.id)).sort((a, b) => byText(a.brand, b.brand) || byText(a.model, b.model))];
  const captures = raws.map((raw, i) => { const identity = identities.get(rows[i].capture_id); return toCapture(raw, identity, identity ? definitions.get(identity.id) : null); });
  const stats = { captures: captures.length, amps: amps.length, mapped: captures.filter((c) => c.ampId !== null).length,
    parsed: captures.filter((c) => c.settings !== null).length, unmapped: captures.filter((c) => c.ampId === null).length };
  const report = { summary: stats, unmapped: captures.filter((c) => c.ampId === null).map((c) => ({ id: c.id, name: c.name, type: c.deviceType })),
    needsReview: captures.filter((c) => c.uninterpretedSettings.length).map((c) => ({ id: c.id, name: c.name, lines: c.uninterpretedSettings })) };
  for (const [name, data] of [['gear.json', amps], ['captures.json', captures], ['mapping-report.json', report]]) fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2) + '\n');
  return { amps, captures, stats };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { stats } = build(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(JSON.stringify(stats, null, 2));
}
