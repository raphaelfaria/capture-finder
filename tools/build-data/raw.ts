// Reading raw capture objects and Cortex Cloud device types.
import { titleCase } from '../lib/text';
import type { RawCapture, Row } from './types';

/** Device types that are amp captures; full rigs ("default") count as amps. */
export const AMP_TYPES = new Set(['amp_head', 'amp_combo', 'amp_and_cab', 'default']);
// Gear categories from Cortex Cloud device types; full rigs ("default") are amp captures.
const CATEGORY: Record<string, string> = {
  amp_head: 'Amps',
  amp_combo: 'Amps',
  amp_and_cab: 'Amps',
  default: 'Amps',
  compressor: 'Compressors',
  fuzz: 'Fuzz',
  overdrive: 'Overdrive',
  pedal: 'Pedals',
};
export const categoryOf = (typeCode: string): string =>
  CATEGORY[typeCode] || (typeCode ? titleCase(typeCode.replace(/_/g, ' ')) : 'Other');
export const TYPE_LABELS: Record<string, string> = {
  amp_head: 'Amp Head',
  amp_and_cab: 'Amp + Cab',
  amp_combo: 'Amp Combo',
  cab: 'Cab',
  pedal: 'Pedal',
  fuzz: 'Fuzz',
  compressor: 'Compressor',
  overdrive: 'Overdrive',
  default: 'Default',
};

/** First nonempty value among dotted paths of a raw API capture object ('' when none). */
export function first(raw: RawCapture, ...paths: string[]): unknown {
  for (const p of paths) {
    let value: unknown = raw;
    for (const part of p.split('.'))
      value =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)[part]
          : undefined;
    if (
      value != null &&
      value !== '' &&
      !(Array.isArray(value) && !value.length) &&
      !(typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
    )
      return value;
  }
  return '';
}

/** The few fields description parsing needs, read from a raw capture object. */
export function record(raw: RawCapture): Row {
  let typeCode = first(raw, 'metadata.deviceType', 'deviceType', 'captureType', 'capture_type');
  if (!typeCode) {
    const productType = String(raw.type || raw.productType || '').toLowerCase();
    typeCode = productType === 'neural_capture' || productType === 'neuralcapture' ? '' : productType;
  }
  return {
    capture_id: String(first(raw, 'id', 'productId', 'captureId')),
    name: String(raw.name || raw.productName || ''),
    description: String(first(raw, 'description', 'metadata.description')),
    type_code: String(typeCode),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
  };
}
