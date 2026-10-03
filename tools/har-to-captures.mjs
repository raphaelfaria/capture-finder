#!/usr/bin/env node
// Part 1: extract the Neural Capture list from a Cortex Cloud HAR.
//
// Joins every capture-list response (search/v1/for/neuralCapture, the `data` array of each
// page) and any product-detail responses (api/v1/products/<id>), drops everything else in
// the HAR (headers, cookies, pagination wrappers, unrelated requests), and writes one JSON
// list of capture objects. A capture seen more than once is merged, with detail responses
// winning and empty values never erasing data.
//
// Only fields on FIELDS are copied, under their API names. Anything else — including the
// recording account's own liked/starred/download state, author ids/avatars, dates, and any
// field the API adds later — is left out, and the run lists what was not copied. Add a field
// here only if the app needs it and it can't identify a user. Descriptions keep only their gear
// and settings lines: stock header lines that state no facts (BOILERPLATE) are not copied.
//
// Usage: node tools/har-to-captures.mjs path/to/captures.har [-o data/captures-raw.json]
//        (npm run captures -- path/to/captures.har)
//
// Local only: no network access, no request headers read or written. HAR files can contain
// session cookies, so keep them out of Git (*.har is ignored).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIELDS = [
  'id', 'productId', 'name', 'description', 'tags', 'type', 'hash',
  'metadata.deviceType', 'metadata.instrumentType', 'metadata.gainType', 'metadata.version',
  'authorUsername', 'published', 'likes', 'stars', 'downloads', 'creatorType', 'creatorVersion',
];
// Description lines with no gear or settings facts, left out of the copy.
export const BOILERPLATE = [/^\s*['"‘’“”]?\s*Quad Cortex Factory Captures\s*['"‘’“”]?\s*$/i];
export const factsOnly = (text) => String(text).split(/\r?\n/).filter((l) => !BOILERPLATE.some((re) => re.test(l))).join('\n').replace(/^(?:[ \t]*\n)+/, '');
const LIST_PATH = /\/search\/v\d+\/for\/(?:neuralcapture|neural-capture)(?:\/|$)/i;
const PRODUCT_PATH = /\/api\/v\d+\/products\/([^/]+)\/?$/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(isObject(v) && !Object.keys(v).length);

/** Merge two copies of a record without letting empty values erase data. */
export function merge(existing, incoming, preferIncoming) {
  if (isObject(existing) && isObject(incoming)) {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (key in merged) merged[key] = merge(merged[key], value, preferIncoming);
      else if (nonempty(value)) merged[key] = value;
    }
    return merged;
  }
  if (!nonempty(incoming)) return existing;
  return !nonempty(existing) || preferIncoming ? incoming : existing;
}

const captureId = (record) => { const v = record.id || record.productId || record.captureId; return nonempty(v) ? String(v) : null; };

function bodyJson(entry) {
  const content = entry.response?.content || {};
  let text = content.text;
  if (typeof text !== 'string' || !text) return null;
  try {
    if (String(content.encoding || '').toLowerCase() === 'base64') text = Buffer.from(text, 'base64').toString('utf8').replace(/^﻿/, '');
    return JSON.parse(text);
  } catch { return null; }
}

/** Capture objects in a list response: the `data` array (or another list of records). */
function listItems(body) {
  if (!isObject(body)) return [];
  for (const key of ['data', 'products', 'results', 'items']) if (Array.isArray(body[key])) return body[key].filter((x) => isObject(x) && captureId(x));
  return [];
}

/** Copy only the FIELDS paths of a record; report every other leaf path into `dropped`. */
export function pick(record, dropped = new Set()) {
  const out = {};
  for (const p of FIELDS) {
    const parts = p.split('.');
    let v = record;
    for (const part of parts) v = isObject(v) ? v[part] : undefined;
    if (v === undefined) continue;
    let o = out;
    parts.slice(0, -1).forEach((part) => { o = o[part] = o[part] || {}; });
    o[parts.at(-1)] = v;
  }
  const walk = (v, prefix) => {
    if (isObject(v) && FIELDS.some((f) => f.startsWith(prefix + '.'))) { for (const [k, x] of Object.entries(v)) walk(x, prefix + '.' + k); }
    else if (!FIELDS.includes(prefix)) dropped.add(prefix);
  };
  for (const [k, v] of Object.entries(record)) walk(v, k);
  if (typeof out.description === 'string') out.description = factsOnly(out.description);
  return out;
}

/** {captures (whitelisted fields only) sorted by name, stats} from a parsed HAR. */
export function extract(har) {
  const captures = new Map(), details = [];
  const stats = { listResponses: 0, pages: new Set(), reported: null, detailMatches: 0, dropped: new Set() };
  for (const entry of har?.log?.entries || []) {
    let pathname = '';
    try { pathname = decodeURIComponent(new URL(String(entry.request?.url || '')).pathname); } catch { continue; }
    const body = bodyJson(entry);
    if (body === null) continue;
    if (LIST_PATH.test(pathname) && isObject(body)) {
      stats.listResponses++;
      if (Number.isInteger(body.page)) stats.pages.add(body.page);
      if (Number.isInteger(body.numberOfResults)) stats.reported = Math.max(stats.reported || 0, body.numberOfResults);
      for (const item of listItems(body)) { const id = captureId(item); captures.set(id, merge(captures.get(id) || {}, item, false)); }
    }
    const m = pathname.match(PRODUCT_PATH);
    if (m && isObject(body)) details.push([m[1], body]);
  }
  // Detail views are opened per capture; merge them into the listed record.
  for (const [id, body] of details) {
    if (!captures.has(id)) continue;
    captures.set(id, merge(captures.get(id), isObject(body.data) ? body.data : body, true));
    stats.detailMatches++;
  }
  const key = (c) => String(c.name || captureId(c)).toLowerCase();
  const list = [...captures.values()].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0).map((c) => pick(c, stats.dropped));
  return { captures: list, stats };
}

function main(argv) {
  const args = argv.slice(2), o = args.findIndex((a) => a === '-o' || a === '--output');
  const output = path.resolve(o >= 0 ? args[o + 1] : path.join(ROOT, 'data/captures-raw.json'));
  const harPath = args.find((a, i) => !a.startsWith('-') && (o < 0 || i !== o + 1));
  if (!harPath) { console.error('Usage: node tools/har-to-captures.mjs path/to/captures.har [-o data/captures-raw.json]'); return 2; }
  let har;
  try { har = JSON.parse(fs.readFileSync(harPath, 'utf8').replace(/^﻿/, '')); }
  catch (err) { console.error('Could not read HAR: ' + err.message); return 2; }
  const { captures, stats } = extract(har);
  if (!captures.length) { console.error('No Neural Captures found. Record the HAR while the Cortex Cloud capture list loads, with response content.'); return 1; }
  fs.writeFileSync(output, JSON.stringify(captures, null, 2) + '\n');
  const pages = [...stats.pages];
  console.log(`Wrote ${captures.length} captures to ${path.relative(process.cwd(), output)} from ${stats.listResponses} list response(s), pages ${pages.length ? Math.min(...pages) + '–' + Math.max(...pages) : '?'}; ${stats.detailMatches} detail response(s) merged.`);
  if (stats.reported !== null && captures.length < stats.reported) console.log(`WARNING: the API reported ${stats.reported} captures but the HAR has ${captures.length}. Load the missing pages and save the HAR again.`);
  if (stats.dropped.size) console.log('Not copied (not on the FIELDS whitelist): ' + [...stats.dropped].sort().join(', '));
  const missing = captures.filter((c) => !nonempty(c.description)).length;
  if (missing) console.log(`Note: ${missing} capture(s) have no description; open their detail views before saving the HAR to include it.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = main(process.argv);
