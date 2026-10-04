// Part 2 of the data pipeline: build the app's data from data/captures-raw.json (made by
// tools/har-to-captures).
//
// Reads the raw capture list (whitelisted API fields only, see FIELDS there), plus the hand-maintained
// data/custom-amps.json and data/gear-identities.json, and writes public/data/gear.json,
// public/data/captures.json and public/data/mapping-report.json. The app fetches gear.json and
// captures.json at runtime. The raw list is never modified.
//
// Gear-specific knowledge lives in data/custom-amps.json, not in this code:
// data/gear-identities.json holds rules for generic gear, keyed by gear id: identity rules for
// gear whose description wording the generic naming gets wrong ({"id", "brand", "model", "match"};
// the definition is still inferred from the captures), and/or "valueAliases" — other spellings of
// a control's values, mapped onto one value before inference and parsing:
//   {"id": "<gear id>", "valueAliases": {"<label>": {"<spelling>": "<value>"}}}
//
//   match    identity rules for a custom definition:
//              {"source": regex on the described gear, "tags": [tag, ...], "name": regex on the capture name}
//              (tags/name only apply when the description names no gear)
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
//              "readOn": [header labels]          keep reading past these device headers
// Generic gear is inferred from the descriptions.
//
// Usage: tsx tools/build-data/index.ts [data/captures-raw.json]   (npm run build:data)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from './build';

export { build, serialize } from './build';
export { ampIdentity, brandInfo, sourceAmpName } from './identity';
export { channelOrder, channelSortKey, channelsFromDescription } from './channels';
export { bareControlName, parseSettings, settingLines, valueOf } from './settings';
export { inferAmp } from './infer';
export { downloadDefaults } from './defaults';
export { pedalBlocks, pedalChain } from './chains';
export { toCapture } from './captures';
export { categoryOf, first, record } from './raw';

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { stats } = build(process.argv[2] ? { rawPath: path.resolve(process.argv[2]) } : {});
  console.log(JSON.stringify(stats, null, 2));
}
