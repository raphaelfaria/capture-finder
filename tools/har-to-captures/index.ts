// Part 1 of the data pipeline: extract the Neural Capture list from a Cortex Cloud HAR.
//
// Joins every capture-list response (search/v1/for/neuralCapture, the `data` array of each page) and
// any product-detail responses (api/v1/products/<id>), drops everything else in the HAR (headers,
// cookies, pagination wrappers, unrelated requests), and writes one JSON list of capture objects. A
// capture seen more than once is merged, with detail responses winning and empty values never erasing
// data. Only whitelisted fields are copied (see fields.ts).
//
// Usage: tsx tools/har-to-captures/index.ts path/to/captures.har [-o data/captures-raw.json]
//        (npm run captures -- path/to/captures.har)
//
// Local only: no network access, no request headers read or written. HAR files can contain session
// cookies, so keep them out of Git (*.har and har/ are ignored).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE_DIR } from '../lib/paths';
import { extract, type Har } from './extract';
import { nonempty } from './fields';

export { BOILERPLATE, FIELDS, factsOnly, pick } from './fields';
export { extract, merge } from './extract';

export function main(argv: string[]): number {
  const args = argv.slice(2),
    o = args.findIndex((a) => a === '-o' || a === '--output');
  const output = path.resolve(o >= 0 ? args[o + 1]! : path.join(SOURCE_DIR, 'captures-raw.json'));
  const harPath = args.find((a, i) => !a.startsWith('-') && (o < 0 || i !== o + 1));
  if (!harPath) {
    console.error('Usage: tsx tools/har-to-captures/index.ts path/to/captures.har [-o data/captures-raw.json]');
    return 2;
  }
  let har: Har;
  try {
    har = JSON.parse(fs.readFileSync(harPath, 'utf8').replace(/^\uFEFF/, '')) as Har;
  } catch (err) {
    console.error('Could not read HAR: ' + (err as Error).message);
    return 2;
  }
  const { captures, stats } = extract(har);
  if (!captures.length) {
    console.error(
      'No Neural Captures found. Record the HAR while the Cortex Cloud capture list loads, with response content.',
    );
    return 1;
  }
  fs.writeFileSync(output, JSON.stringify(captures, null, 2) + '\n');
  const pages = [...stats.pages];
  console.log(
    `Wrote ${captures.length} captures to ${path.relative(process.cwd(), output)} from ${stats.listResponses} list response(s), pages ${pages.length ? Math.min(...pages) + '–' + Math.max(...pages) : '?'}; ${stats.detailMatches} detail response(s) merged.`,
  );
  if (stats.reported !== null && captures.length < stats.reported)
    console.log(
      `WARNING: the API reported ${stats.reported} captures but the HAR has ${captures.length}. Load the missing pages and save the HAR again.`,
    );
  if (stats.dropped.size)
    console.log('Not copied (not on the FIELDS whitelist): ' + [...stats.dropped].sort().join(', '));
  const missing = captures.filter((c) => !nonempty(c.description)).length;
  if (missing)
    console.log(
      `Note: ${missing} capture(s) have no description; open their detail views before saving the HAR to include it.`,
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = main(process.argv);
