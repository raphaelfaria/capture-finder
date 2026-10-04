// Pedals with the captured gear: "Pedal 1: Boss® SD-1®", "Pedal2: …" blocks after the settings.
import type { ChainItem, GearDef, Values } from '../../shared/schema';
import { lines } from '../lib/text';
import { ampIdentity } from './identity';
import { parseSettings } from './settings';
import type { Identity, Row, Rule } from './types';

export interface PedalBlock {
  n: number;
  /** The pedal as written, with its trademark marks. */
  source: string;
  name: string;
  rows: string[];
  /** In the gear's effects loop ("In efx loop"), not in front. */
  loop?: boolean;
}

/** The pedal blocks of a description, in signal order: each block's name and setting rows, up to a
 *  blank line, the next pedal or another device header. A block ending with "In efx loop" is in the
 *  gear's effects loop (loop: true), not in front. */
export function pedalBlocks(description: string): PedalBlock[] {
  const blocks: PedalBlock[] = [];
  let cur: PedalBlock | null = null;
  for (const raw of lines(description || '')) {
    const line = raw.trim();
    const head = line.match(/^Pedal\s*(\d+)\s*:\s*(.+)$/i);
    if (head) {
      cur = {
        n: Number(head[1]),
        source: head[2]!.trim(),
        name: head[2]!
          .replace(/[®™]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
        rows: [],
      };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (!line || /^(?:Power amp|Cab|Amp|Settings)\s*:/i.test(line) || /[®™]/.test(line)) {
      cur = null;
      continue;
    }
    if (/^in\s+(?:e?fx|effects?)\s*loop$/i.test(line)) {
      cur.loop = true;
      continue;
    }
    cur.rows.push(line);
  }
  return blocks.sort((a, b) => a.n - b.n);
}

export const pedalIdentity = (b: PedalBlock, rules: Rule[]): Identity | null =>
  ampIdentity(
    { capture_id: '', name: '', type_code: 'pedal', tags: [], description: 'This is a capture of ' + b.source },
    rules,
  );

/** Settings rows of one pedal block, as a row the settings parser reads (without the host capture's
 *  name, which can name the host's channel). */
export const pedalRow = (row: Row, b: PedalBlock): Row => ({
  ...row,
  name: '',
  description: 'Settings:\n' + b.rows.join('\n'),
});

/** The pedal chain of a capture: [{id (gear id or null), name, values (or null), loop}]. */
export function pedalChain(row: Row, rules: Rule[], definitions: Map<string, GearDef>): ChainItem[] {
  return pedalBlocks(row.description).map((b) => {
    const identity = pedalIdentity(b, rules);
    const def = identity ? definitions.get(identity.id) : null;
    let values: Values | null = null;
    if (def) {
      const [settings] = parseSettings(pedalRow(row, b), { ...def, parse: {} });
      values = settings ? settings.values : null;
    }
    return {
      id: def ? identity!.id : null,
      name: def ? def.brand + ' ' + def.model : b.name,
      values,
      ...(b.loop ? { loop: true } : {}),
    };
  });
}
