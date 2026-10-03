// Channels: reading them from descriptions, and ordering generic gear's channels.
import { isDigits, lines, rstripChars, stripChars } from '../lib/text';

const KEY_VALUE = /^\s*(.+?)\s*:\s*(.*?)\s*$/;

function channelValue(value: string): string {
  value = stripChars(value.trim(), ' .,:;()[]');
  if (!value || ['n/a', 'na', 'none', 'not applicable'].includes(value.toLowerCase())) return '';
  value = value
    .replace(/^(?:channel|ch\.?)\s*/i, '')
    .trim()
    .replace(/\s+channel$/i, '')
    .trim();
  if (/^[a-z]$/i.test(value)) return value.toUpperCase();
  if (/^\d+(?:[-+&]\d+)?$/.test(value)) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/** Every channel a description (or, failing that, the capture name) names, in order. */
export function channelsFromDescription(description: string, captureName = ''): string[] {
  const channels: string[] = [];
  const add = (value: string) => {
    const ch = channelValue(value);
    if (ch && !channels.some((c) => c.toLowerCase() === ch.toLowerCase())) channels.push(ch);
  };
  for (const line of lines(description)) {
    const stripped = line.trim();
    if (!stripped) continue;
    const kv = stripped.match(KEY_VALUE);
    if (kv) {
      const key = kv[1]!.trim(),
        value = kv[2]!.trim();
      const ampSection = key.match(/^amp\s*\(\s*ch\.?\s*(\d+(?:[-+&]\d+)?|[a-z])\s*\)$/i);
      if (ampSection) {
        add(ampSection[1]!);
        continue;
      }
      if (/^(?:channel|ch)\s*$/i.test(key)) {
        add(value);
        continue;
      }
      const numberedKey = key.match(/^(?:channel|ch\.?)\s+(\d+(?:[-+&]\d+)?|[a-z])$/i);
      if (numberedKey) {
        add(numberedKey[1]!);
        continue;
      }
    } else {
      const numberedHeading = stripped.match(/^(?:channel|ch\.?)\s*[-:#]?\s*(\d+(?:[-+&]\d+)?|[a-z])$/i);
      if (numberedHeading) {
        add(numberedHeading[1]!);
        continue;
      }
      const namedHeading = stripped.match(/^([a-z0-9][a-z0-9 -]*?)\s+channel$/i);
      if (namedHeading) {
        add(namedHeading[1]!);
        continue;
      }
      // Narrative source descriptions commonly say "amp channel 1".
      const narrative = stripped.match(/\b(?:channel|ch\.?)\s*\.?\s*(\d+(?:[-+&]\d+)?|[a-z])\b/i);
      if (narrative) add(narrative[1]!);
      const namedNarrative = stripped.match(/\bamp(?:lifier)?(?:['’]s)?\s+([a-z0-9-]+)\s+channel\b/i);
      if (namedNarrative && namedNarrative[1]!.toLowerCase() !== 'channel') add(namedNarrative[1]!);
    }
  }
  // Some records omit the model/channel sentence but include it in the capture title.
  if (!channels.length && captureName) {
    const t = captureName.match(/\b(?:channel|ch\.?)\s*\.?\s*(\d+(?:[-+&]\d+)?|[a-d])\b/i);
    if (t) add(t[1]!);
  }
  return channels;
}

export const isChannelHeader = (line: string): boolean =>
  /^(?:channel|ch\.?)\s*[-:#]?\s*(?:\d+(?:[-+&]\d+)?|[a-z])$/i.test(line) ||
  /^([a-z0-9][a-z0-9 -]*?)\s+channel$/i.test(line);

/** A channel row's value as a channel token ("Ch 2" → "2"), or null for N/A. */
export function channelToken(text: string): string | null {
  text = rstripChars(text.trim(), '.');
  if (['n/a', 'na', 'none', ''].includes(text.toLowerCase())) return null;
  return text.replace(/^(?:channel|ch\.?)\s*/i, '').trim();
}

// Channel order for generic gear: explicit numbers first ("1", "1 Clean", "2, Lead"), then single
// letters (A, B), then named channels from clean to high gain — clean/normal, rhythm/crunch (and the
// usual mid-gain colours), names it doesn't know, lead/distortion, and purple (a step above red) —
// with a trailing number and then the name breaking ties.
const CHANNEL_TIERS: [number, RegExp][] = [
  [0, /\b(clean|normal|jazz|funk|cool|pure|crystal|green)\b/i],
  [1, /\b(rhythm|rhy|crunch|vintage|classic|plexi|brown|edge|blues|rock|drive|white|blue|orange|yellow)\b/i],
  [3, /\b(lead|solo|dist|distortion|dirty|high[ -]?gain|hi[ -]?gain|ultra|modern|metal|overdrive|hot|red)\b/i],
  [4, /\bpurple\b/i],
];
type SortKey = [number, number, number, string];
export function channelSortKey(name: string): SortKey {
  const s = String(name).trim(),
    lead = s.match(/^(\d{1,2})(?:\b|[,.:\s])/);
  if (isDigits(s) && Number(s) <= 99 && s.length <= 2) return [0, Number(s), 0, ''];
  if (lead) return [0, Number(lead[1]), 0, s.toLowerCase()];
  if (/^[a-z]$/i.test(s)) return [1, s.toUpperCase().charCodeAt(0), 0, ''];
  const tier = CHANNEL_TIERS.find(([, re]) => re.test(s)),
    num = s.match(/(?:^|\D)(\d{1,2})\s*$/); // "Lead 2", not a year like "1959"
  return [2, tier ? tier[0] : 2, num ? Number(num[1]) : 0, s.toLowerCase()];
}
export const channelOrder = (a: string, b: string): number => {
  const x = channelSortKey(a),
    y = channelSortKey(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return 0;
};
