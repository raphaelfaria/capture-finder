// The data build is deterministic: rebuilding from the committed sources (data/) gives exactly the
// committed output (public/data/). Run `npm run build:data` after changing a source and commit both.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { OUTPUT_DIR } from '../../../tools/lib/paths';
import { build, serialize } from '../../../tools/build-data';

test('build-data output matches the committed public/data files byte for byte', () => {
  const { amps, captures, report } = build({ outputDir: null });
  for (const [name, data] of [
    ['gear.json', amps],
    ['captures.json', captures],
    ['mapping-report.json', report],
  ] as const) {
    const committed = fs.readFileSync(path.join(OUTPUT_DIR, name), 'utf8');
    expect(serialize(data) === committed, name + ' differs from a fresh build (run npm run build:data)').toBe(true);
  }
});
