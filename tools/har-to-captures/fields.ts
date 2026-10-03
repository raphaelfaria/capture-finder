// What is copied out of a HAR: a whitelist of API fields, and descriptions without boilerplate.
//
// Only fields on FIELDS are copied, under their API names. Anything else — including the recording
// account's own liked/starred/download state, author ids/avatars, dates, and any field the API adds
// later — is left out, and the run lists what was not copied. Add a field here only if the app needs
// it and it can't identify a user.

export const FIELDS = [
  'id',
  'productId',
  'name',
  'description',
  'tags',
  'type',
  'hash',
  'metadata.deviceType',
  'metadata.instrumentType',
  'metadata.gainType',
  'metadata.version',
  'authorUsername',
  'published',
  'likes',
  'stars',
  'downloads',
  'creatorType',
  'creatorVersion',
] as const;

/** Description lines with no gear or settings facts, left out of the copy. */
export const BOILERPLATE = [/^\s*['"‘’“”]?\s*Quad Cortex Factory Captures\s*['"‘’“”]?\s*$/i];
export const factsOnly = (text: unknown): string =>
  String(text)
    .split(/\r?\n/)
    .filter((l) => !BOILERPLATE.some((re) => re.test(l)))
    .join('\n')
    .replace(/^(?:[ \t]*\n)+/, '');

export type JsonObject = Record<string, unknown>;
export const isObject = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);
export const nonempty = (v: unknown): boolean =>
  v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(isObject(v) && !Object.keys(v).length);

/** Copy only the FIELDS paths of a record; report every other leaf path into `dropped`. */
export function pick(record: JsonObject, dropped = new Set<string>()): JsonObject {
  const out: JsonObject = {};
  for (const p of FIELDS) {
    const parts = p.split('.');
    let v: unknown = record;
    for (const part of parts) v = isObject(v) ? v[part] : undefined;
    if (v === undefined) continue;
    let o = out;
    parts.slice(0, -1).forEach((part) => {
      o = (o[part] = o[part] || {}) as JsonObject;
    });
    o[parts.at(-1)!] = v;
  }
  const walk = (v: unknown, prefix: string): void => {
    if (isObject(v) && FIELDS.some((f) => f.startsWith(prefix + '.'))) {
      for (const [k, x] of Object.entries(v)) walk(x, prefix + '.' + k);
    } else if (!(FIELDS as readonly string[]).includes(prefix)) dropped.add(prefix);
  };
  for (const [k, v] of Object.entries(record)) walk(v, k);
  if (typeof out.description === 'string') out.description = factsOnly(out.description);
  return out;
}
