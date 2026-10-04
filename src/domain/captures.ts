// How captures are named and linked.
import type { Capture, GearDef } from '../../shared/schema';
import { chainName } from './chains';
import { captureChannelLabel } from './channels';
import { multiCh } from './controls';
import type { GearLookup } from './types';

/** The Neural Capture type: captures without a version are the original Neural Captures (V1). */
export const captureTypeLabel = (c: Pick<Capture, 'captureType'>): string =>
  /\bV\d+$/.test(c.captureType) ? c.captureType : c.captureType + ' V1';

/** The capture's own page on Cortex Cloud, from its author and id. */
export const cloudUrl = (c: Pick<Capture, 'id' | 'author'>): string | null =>
  c.id && c.author && c.author.username
    ? 'https://cloud.neuraldsp.com/cloud/u/' +
      encodeURIComponent(c.author.username) +
      '/neural-capture/view/' +
      encodeURIComponent(c.id)
    : null;

/** The line under a capture's name: channel, device, instrument, gain and pedals. */
export const captureMeta = (def: GearDef, c: Capture, gear: GearLookup): string =>
  (multiCh(def) ? captureChannelLabel(def, c) + ' · ' : '') +
  c.deviceType +
  ' · ' +
  c.instrument +
  ' · gain ' +
  c.gainType +
  (c.chain ? ' · with ' + chainName(c.chain, gear) : '');
