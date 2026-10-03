// Preamps captured on their own and through a power amp.
import type { Capture, GearDef } from '../../../shared/schema';

/** An entry "<preamp> + <power amp>" whose captures say "… with <power amp> power amp". */
export const isPowerAmpVersion = (d: GearDef, captures: Capture[]): boolean =>
  / \+ /.test(d.model) &&
  captures.some((c) => c.ampId === d.id && /\bpower\s*amp\b/i.test(String(c.description || '').split('\n')[0]));

/** The family of a preamp: the standalone preamp, then each power amp version (an entry whose id
 *  extends the preamp's), in that order — or [] when the gear has no other version. */
export function ampFamily(def: GearDef, gear: GearDef[], captures: Capture[]): GearDef[] {
  const powered = (d: GearDef) => isPowerAmpVersion(d, captures);
  const base = powered(def) ? gear.find((p) => def.id.startsWith(p.id + '-')) : def;
  const fam = base ? [base, ...gear.filter((k) => k.id.startsWith(base.id + '-') && powered(k))] : [def];
  return fam.length > 1 ? fam : [];
}

/** The power amp of a family member ("Mesa/Boogie 2:90"), or null for the standalone preamp. */
export const powerAmpOf = (family: GearDef[], d: GearDef): string | null =>
  d === family[0] ? null : d.model.split(' + ').slice(1).join(' + ');
