// The app's capture record.
import type { Capture, ChainItem, GearDef } from '../../shared/schema';
import { capitalize, titleCase } from '../lib/text';
import { TYPE_LABELS, first, record } from './raw';
import { parseSettings } from './settings';
import type { Identity, RawCapture } from './types';

/** App capture record: identifying fields, mapping, parsed settings, tags and the description (as
 *  copied, without stock header lines). */
export function toCapture(
  raw: RawCapture,
  identity: Identity | null,
  definition: GearDef | null | undefined,
  chain: ChainItem[] = [],
): Capture {
  const row = record(raw);
  const [settings, rejected] = definition ? parseSettings(row, definition) : [null, []];
  const version = String(first(raw, 'metadata.version'));
  const count = (key: string) => (/^\d+$/.test(String(raw[key] ?? '')) ? parseInt(String(raw[key]), 10) : null);
  return {
    id: row.capture_id,
    productId: (raw.productId as string) || row.capture_id,
    hash: (raw.hash as string) ?? '',
    ampId: identity ? identity.id : null,
    mappingSource: identity ? identity.source : 'unmapped/effect',
    name: row.name,
    captureType: 'Neural Capture' + (version ? ' V' + version : ''),
    deviceType: row.type_code
      ? TYPE_LABELS[row.type_code.toLowerCase()] || titleCase(row.type_code.replace(/_/g, ' '))
      : 'Unknown',
    deviceTypeCode: row.type_code,
    instrument: capitalize(String(first(raw, 'metadata.instrumentType')) || 'Unknown'),
    gainType: String(first(raw, 'metadata.gainType')) || 'Not stated',
    tags: row.tags,
    author: { username: String(raw.authorUsername || '') },
    creator: { type: (raw.creatorType as string) ?? '', version: (raw.creatorVersion as string) ?? '' },
    published: typeof raw.published === 'boolean' ? raw.published : null,
    likes: count('likes'),
    stars: count('stars'),
    downloads: count('downloads'),
    description: row.description,
    settings,
    uninterpretedSettings: rejected,
    ...(chain.length ? { chain } : {}),
  };
}
