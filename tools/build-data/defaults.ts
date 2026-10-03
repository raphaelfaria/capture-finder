// Starting settings (what Reset and double-click restore), for every gear.
import type {
  Capture,
  Control,
  ControlValue,
  DefaultsSource,
  GearDef,
  GearDefaults,
  Values,
} from '../../shared/schema';
import { byText } from '../lib/text';

/** Each channel starts from its most downloaded capture, with anything that capture doesn't state
 *  taken from the next most downloaded capture of that channel that does. The starting channel is the
 *  one of the gear's most downloaded capture; controls shared by several channels, and global ones,
 *  come from the starting channel's captures first. Values no capture states keep the definition's own
 *  defaults. Ties: capture name. The starting capture's pedal chain, if it has one, comes along. */
export function downloadDefaults(
  def: GearDef,
  caps: Capture[],
): { defaults: GearDefaults; from: DefaultsSource[] } | null {
  const ranked = caps
    .filter((c) => c.settings)
    .sort((a, b) => (b.downloads ?? -1) - (a.downloads ?? -1) || byText(a.name, b.name));
  if (!ranked.length) return null;
  const many = (cap: Capture) => Object.keys(cap.settings!.byChannel || {}).length > 1;
  const covers = (cap: Capture, n: number | null) =>
    n === null || cap.settings!.channel === n || (many(cap) && !!cap.settings!.byChannel[n]);
  const valuesOf = (cap: Capture, n: number | null): Values =>
    many(cap) && n !== null ? { ...cap.settings!.values, ...(cap.settings!.byChannel[n] || {}) } : cap.settings!.values;
  const valid = (c: Control, v: ControlValue) =>
    c.kind === 'switch' ? (c.options || []).some((o) => o.v === v) : typeof v === 'number' && v >= c.min && v <= c.max;
  const pick = (c: Control, n: number | null): ControlValue | undefined => {
    for (const cap of ranked)
      if (covers(cap, n)) {
        const v = valuesOf(cap, n)[c.key];
        if (v !== undefined && v !== null && valid(c, v)) return v;
      }
    return undefined;
  };
  const defaults: GearDefaults = JSON.parse(JSON.stringify(def.defaults)),
    from: DefaultsSource[] = [];
  if (def.channels) {
    const top = ranked.find((cap) => def.channels!.some((ch) => ch.n === cap.settings!.channel));
    if (top) defaults.channel = top.settings!.channel;
    for (const ch of def.channels) {
      const cap = ranked.find((c) => covers(c, ch.n));
      if (cap) from.push({ channel: ch.n, name: cap.name, downloads: cap.downloads });
    }
  } else from.push({ channel: null, name: ranked[0]!.name, downloads: ranked[0]!.downloads });
  // the pedals in front of the starting channel's capture, if any, are part of the starting settings
  const startCap = def.channels ? ranked.find((c) => covers(c, defaults.channel)) : ranked[0];
  if (startCap && startCap.chain)
    defaults.chain = startCap.chain.map((p) => ({
      id: p.id,
      name: p.name,
      values: { ...(p.values || {}) },
      ...(p.loop ? { loop: true } : {}),
    }));
  else delete defaults.chain;
  for (const c of def.controls) {
    if (c.scope === 'channel') {
      for (const ch of def.channels || []) {
        if (c.channels && !c.channels.includes(ch.n)) continue;
        const v = pick(c, ch.n);
        if (v !== undefined) (defaults.ch[String(ch.n)] || (defaults.ch[String(ch.n)] = {}))[c.key] = v;
      }
    } else {
      const start = def.channels ? defaults.channel : null;
      const order: (number | null)[] = !def.channels
        ? [null]
        : c.channels
          ? [...(start !== null && c.channels.includes(start) ? [start] : []), ...c.channels.filter((n) => n !== start)]
          : [start, null];
      let v: ControlValue | undefined;
      for (const n of order) {
        v = pick(c, n);
        if (v !== undefined) break;
      }
      if (v !== undefined) defaults.global[c.key] = v;
    }
  }
  return { defaults, from };
}
