import type { GearDef, MatchRule, ValueAliases } from '../../shared/schema';

/** A raw capture object from data/captures-raw.json (whitelisted API fields, see har-to-captures). */
export type RawCapture = Record<string, unknown>;

/** The few fields description parsing needs, read from a raw capture. */
export interface Row {
  capture_id: string;
  name: string;
  description: string;
  type_code: string;
  tags: string[];
}

/** Who a capture is of, and how that was found. */
export interface Identity {
  id: string;
  brand: string;
  model: string;
  source: string;
}

/** An entry of data/gear-identities.json: an identity rule and/or value spellings for generic gear. */
export interface IdentityRule {
  id: string;
  brand?: string;
  model?: string;
  match?: MatchRule;
  valueAliases?: ValueAliases;
}

/** Identity rules come from custom definitions and data/gear-identities.json. */
export type Rule = GearDef | IdentityRule;

/** One "label: value" setting row of a description, with the channel it was listed under. */
export interface Entry {
  label: string;
  raw: string;
  channel: string | null;
}
