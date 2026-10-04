// App-side domain types (the data files' own types live in shared/schema.ts).
import type { ChainItem, GearDef, Values } from '../../shared/schema';

/** The settings dialled into one piece of gear: same shape as its defaults. */
export interface GearSettings {
  /** Selected channel (null for single-channel gear). */
  channel: number | null;
  /** Channel-scoped values, by channel number as a string key. */
  ch: Record<string, Values>;
  global: Values;
  /** Pedals with the gear, in signal order (in front, or in its effects loop). */
  chain?: ChainItem[];
}

/** Finds any gear definition by id, chain-only pedals included. */
export type GearLookup = (id: string) => GearDef | null;

export type ReasonKind = 'match' | 'near' | 'off' | 'none';
export interface Reason {
  kind: ReasonKind;
  text: string;
}

export type Similarity =
  | { status: 'unparsed' }
  | { status: 'scored'; score: number; coverage: number; reasons: Reason[] };

/** Matching weight overrides for one gear: control key → weight. */
export type WeightOverrides = Record<string, number>;
