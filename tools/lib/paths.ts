import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Hand-maintained and raw inputs: captures-raw.json, custom-amps.json, gear-identities.json. */
export const SOURCE_DIR = path.join(ROOT, 'data');
/** Generated files the app fetches at runtime: gear.json, captures.json, mapping-report.json. */
export const OUTPUT_DIR = path.join(ROOT, 'public', 'data');
