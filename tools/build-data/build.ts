// Build the app's data from the raw capture list and the hand-maintained gear rules.
import fs from 'node:fs';
import path from 'node:path';
import type { Capture, GearDef, MappingReport } from '../../shared/schema';
import { OUTPUT_DIR, SOURCE_DIR } from '../lib/paths';
import { byText } from '../lib/text';
import { toCapture } from './captures';
import { pedalBlocks, pedalChain, pedalIdentity, pedalRow } from './chains';
import { downloadDefaults } from './defaults';
import { ampIdentity } from './identity';
import { inferAmp } from './infer';
import { categoryOf, record } from './raw';
import type { Identity, IdentityRule, RawCapture, Row, Rule } from './types';

export interface BuildOptions {
  /** data/captures-raw.json (made by har-to-captures). */
  rawPath?: string;
  /** Where custom-amps.json and gear-identities.json are read from. */
  sourceDir?: string;
  /** Where gear.json, captures.json and mapping-report.json are written; null writes nothing. */
  outputDir?: string | null;
}

export interface BuildResult {
  amps: GearDef[];
  captures: Capture[];
  report: MappingReport;
  stats: MappingReport['summary'];
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
/** How the files are written (2-space JSON and a final newline), so rebuilds diff cleanly. */
export const serialize = (data: unknown): string => JSON.stringify(data, null, 2) + '\n';

export function build({
  rawPath = path.join(SOURCE_DIR, 'captures-raw.json'),
  sourceDir = SOURCE_DIR,
  outputDir = OUTPUT_DIR,
}: BuildOptions = {}): BuildResult {
  const raws = readJson<RawCapture[]>(rawPath);
  if (!Array.isArray(raws) || !raws.length)
    throw new Error('Expected a nonempty JSON list of captures (run tools/har-to-captures first)');
  const rows = raws.map(record),
    ids = rows.map((r) => r.capture_id);
  if (!ids.every(Boolean) || new Set(ids).size !== ids.length)
    throw new Error('Capture IDs must be nonempty and unique');
  const customs = readJson<GearDef[]>(path.join(sourceDir, 'custom-amps.json'));
  const identityFile = path.join(sourceDir, 'gear-identities.json');
  const rules: Rule[] = [...customs, ...(fs.existsSync(identityFile) ? readJson<IdentityRule[]>(identityFile) : [])];
  const definitions = new Map<string, GearDef>(customs.map((d) => [d.id, d])),
    groups = new Map<string, Row[]>(),
    identities = new Map<string, Identity | null>();
  for (const row of rows) {
    const identity = ampIdentity(row, rules);
    identities.set(row.capture_id, identity);
    if (identity) {
      if (!groups.has(identity.id)) groups.set(identity.id, []);
      groups.get(identity.id)!.push(row);
    }
  }
  const valueAliases = Object.fromEntries(
    rules.filter((r) => r.valueAliases && !customs.includes(r as GearDef)).map((r) => [r.id, r.valueAliases!]),
  );
  for (const [ampId, group] of groups)
    if (!definitions.has(ampId))
      definitions.set(ampId, inferAmp(identities.get(group[0]!.capture_id)!, group, valueAliases[ampId] || null));
  // Pedals only ever seen in front of other gear (no captures of their own): a generic definition from
  // their rows in those chains, so the chain can be drawn and compared. They aren't offered in the
  // gear picker (chainOnly).
  const chainRows = new Map<string, { identity: Identity; rows: Row[] }>();
  rows.forEach((row) => {
    if (!identities.get(row.capture_id)) return;
    for (const b of pedalBlocks(row.description)) {
      const identity = pedalIdentity(b, rules);
      if (!identity || definitions.has(identity.id)) continue;
      if (!chainRows.has(identity.id)) chainRows.set(identity.id, { identity, rows: [] });
      chainRows.get(identity.id)!.rows.push({ ...pedalRow(row, b), type_code: 'pedal' });
    }
  });
  for (const [id, { identity, rows: pr }] of chainRows)
    definitions.set(id, { ...inferAmp(identity, pr, valueAliases[id] || null), category: 'Pedals', chainOnly: true });
  for (const d of definitions.values()) {
    const rowsOf = groups.get(d.id) || [];
    d.captureCount = rowsOf.length;
    // Category: the most common device type among the gear's captures (custom entries may set it);
    // on a tie, Amps wins (a capture with a cab sim is often typed "Amp + Cab").
    const counts = new Map<string, number>();
    rowsOf.forEach((r) => counts.set(categoryOf(r.type_code), (counts.get(categoryOf(r.type_code)) || 0) + 1));
    if (!d.category)
      d.category =
        [...counts].sort((a, b) => b[1] - a[1] || Number(b[0] === 'Amps') - Number(a[0] === 'Amps'))[0]?.[0] || 'Amps';
  }
  const customIds = new Set(customs.map((a) => a.id));
  const amps = [
    ...customs,
    ...[...definitions.values()]
      .filter((d) => !customIds.has(d.id))
      .sort((a, b) => byText(a.brand, b.brand) || byText(a.model, b.model)),
  ];
  const captures = raws.map((raw, i) => {
    const identity = identities.get(rows[i]!.capture_id) ?? null;
    return toCapture(
      raw,
      identity,
      identity ? definitions.get(identity.id) : null,
      identity ? pedalChain(rows[i]!, rules, definitions) : [],
    );
  });
  for (const d of amps) {
    const start = downloadDefaults(
      d,
      captures.filter((c) => c.ampId === d.id),
    );
    if (start) {
      d.defaults = start.defaults;
      d.defaultsFrom = start.from;
    }
  }
  const stats = {
    captures: captures.length,
    amps: amps.length,
    mapped: captures.filter((c) => c.ampId !== null).length,
    parsed: captures.filter((c) => c.settings !== null).length,
    unmapped: captures.filter((c) => c.ampId === null).length,
  };
  const report: MappingReport = {
    summary: stats,
    unmapped: captures.filter((c) => c.ampId === null).map((c) => ({ id: c.id, name: c.name, type: c.deviceType })),
    needsReview: captures
      .filter((c) => c.uninterpretedSettings.length)
      .map((c) => ({ id: c.id, name: c.name, lines: c.uninterpretedSettings })),
  };
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [name, data] of [
      ['gear.json', amps],
      ['captures.json', captures],
      ['mapping-report.json', report],
    ] as const)
      fs.writeFileSync(path.join(outputDir, name), serialize(data));
  }
  return { amps, captures, report, stats };
}
