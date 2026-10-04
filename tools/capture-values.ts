// Every value a gear's captures record per control (all channels), their N/A entries and the setting lines
// nothing could interpret — what a definition's options, ranges and aliases are decided from.
// Usage: npm run capture-values -- <gearId> [path/to/captures.json]
import fs from 'node:fs';
import path from 'node:path';
import type { Capture } from '../shared/schema';
import { OUTPUT_DIR } from './lib/paths';

const id = process.argv[2];
const file = process.argv[3] || path.join(OUTPUT_DIR, 'captures.json');
if (!id) {
  console.error('usage: npm run capture-values -- <gearId> [captures.json]');
  process.exit(2);
}
const caps = (JSON.parse(fs.readFileSync(file, 'utf8')) as Capture[]).filter((c) => c.ampId === id);
const vals: Record<string, Record<string, number>> = {},
  na: Record<string, Record<string, number>> = {},
  unk: Record<string, number> = {};
const bump = (o: Record<string, Record<string, number>>, k: string, v: string) => {
  const m = (o[k] = o[k] || {});
  m[v] = (m[v] || 0) + 1;
};
caps.forEach((c) => {
  const s = c.settings;
  if (!s) return;
  [s.values || {}, ...Object.values(s.byChannel || {})].forEach((v) =>
    Object.entries(v).forEach(([k, x]) => bump(vals, k, String(x))),
  );
  (s.notApplicable || []).forEach((x) => bump(na, x.key, x.channel == null ? 'any' : 'ch' + x.channel));
  (c.uninterpretedSettings || []).forEach((u) => (unk[u] = (unk[u] || 0) + 1));
});
console.log(
  id +
    ': ' +
    caps.length +
    ' captures, ' +
    caps.filter((c) => c.settings).length +
    ' with readable settings, ' +
    caps.filter((c) => !c.settings).length +
    ' unreadable',
);
Object.entries(vals).forEach(([k, v]) =>
  console.log(
    ' ',
    k,
    JSON.stringify(
      Object.entries(v)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    ),
  ),
);
console.log('  N/A:', JSON.stringify(na));
console.log('  uninterpreted:', JSON.stringify(unk));
