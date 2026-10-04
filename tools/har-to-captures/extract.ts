// Joining the capture-list and product-detail responses of a HAR into one capture list.
import { isObject, nonempty, pick, type JsonObject } from './fields';

const LIST_PATH = /\/search\/v\d+\/for\/(?:neuralcapture|neural-capture)(?:\/|$)/i;
const PRODUCT_PATH = /\/api\/v\d+\/products\/([^/]+)\/?$/i;

interface HarEntry {
  request?: { url?: unknown; method?: string };
  response?: { content?: { text?: unknown; encoding?: unknown } };
}
export interface Har {
  log?: { entries?: HarEntry[] };
}
export interface ExtractStats {
  listResponses: number;
  pages: Set<number>;
  reported: number | null;
  detailMatches: number;
  dropped: Set<string>;
}

/** Merge two copies of a record without letting empty values erase data. */
export function merge(existing: unknown, incoming: unknown, preferIncoming: boolean): unknown {
  if (isObject(existing) && isObject(incoming)) {
    const merged: JsonObject = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (key in merged) merged[key] = merge(merged[key], value, preferIncoming);
      else if (nonempty(value)) merged[key] = value;
    }
    return merged;
  }
  if (!nonempty(incoming)) return existing;
  return !nonempty(existing) || preferIncoming ? incoming : existing;
}

const captureId = (record: JsonObject): string | null => {
  const v = record.id || record.productId || record.captureId;
  return nonempty(v) ? String(v) : null;
};

function bodyJson(entry: HarEntry): unknown {
  const content = entry.response?.content || {};
  let text = content.text;
  if (typeof text !== 'string' || !text) return null;
  try {
    if (String(content.encoding || '').toLowerCase() === 'base64')
      text = Buffer.from(text, 'base64')
        .toString('utf8')
        .replace(/^\uFEFF/, '');
    return JSON.parse(text as string);
  } catch {
    return null;
  }
}

/** Capture objects in a list response: the `data` array (or another list of records). */
function listItems(body: unknown): JsonObject[] {
  if (!isObject(body)) return [];
  for (const key of ['data', 'products', 'results', 'items'])
    if (Array.isArray(body[key]))
      return (body[key] as unknown[]).filter((x): x is JsonObject => isObject(x) && !!captureId(x));
  return [];
}

/** {captures (whitelisted fields only) sorted by name, stats} from a parsed HAR. */
export function extract(har: Har): { captures: JsonObject[]; stats: ExtractStats } {
  const captures = new Map<string, JsonObject>(),
    details: [string, JsonObject][] = [];
  const stats: ExtractStats = {
    listResponses: 0,
    pages: new Set(),
    reported: null,
    detailMatches: 0,
    dropped: new Set(),
  };
  for (const entry of har?.log?.entries || []) {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(String(entry.request?.url || '')).pathname);
    } catch {
      continue;
    }
    const body = bodyJson(entry);
    if (body === null) continue;
    if (LIST_PATH.test(pathname) && isObject(body)) {
      stats.listResponses++;
      if (Number.isInteger(body.page)) stats.pages.add(body.page as number);
      if (Number.isInteger(body.numberOfResults))
        stats.reported = Math.max(stats.reported || 0, body.numberOfResults as number);
      for (const item of listItems(body)) {
        const id = captureId(item)!;
        captures.set(id, merge(captures.get(id) || {}, item, false) as JsonObject);
      }
    }
    const m = pathname.match(PRODUCT_PATH);
    if (m && isObject(body)) details.push([m[1]!, body]);
  }
  // Detail views are opened per capture; merge them into the listed record.
  for (const [id, body] of details) {
    if (!captures.has(id)) continue;
    captures.set(id, merge(captures.get(id), isObject(body.data) ? body.data : body, true) as JsonObject);
    stats.detailMatches++;
  }
  const key = (c: JsonObject) => String(c.name || captureId(c)).toLowerCase();
  const list = [...captures.values()]
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    .map((c) => pick(c, stats.dropped));
  return { captures: list, stats };
}
