// The name a gear goes by on the device, from its capture names.
import type { Capture, GearDef } from '../../../shared/schema';

/** For each gear, e.g. "Bogna X100B" for the Bogner Ecstasy 100B captures "Bogna X100B Ch1 3",
 *  "Bogna X100B Ch2 1"…: the most common name without its number, shortened word by word until it covers
 *  80% of the gear's captures (never below two words; "John" and "John's" count as the same word). Names
 *  shared by gear in the same category get the gear's variant added (e.g. "Watt Custom · Power amp
 *  section"). */
export function deviceNames(
  captures: Capture[],
  gearById: (id: string) => GearDef,
  categoryOf: (a: GearDef) => string,
): Record<string, string> {
  const stems: Record<string, Map<string, number>> = {},
    tok = (w: string) => w.toLowerCase().replace(/['’]s$/, '');
  captures.forEach((c) => {
    if (!c.ampId) return;
    const st = c.name.replace(/\s*\d+$/, '').trim() || c.name;
    const m = (stems[c.ampId] = stems[c.ampId] || new Map());
    m.set(st, (m.get(st) || 0) + 1);
  });
  const names: Record<string, string> = {};
  Object.entries(stems).forEach(([id, m]) => {
    const total = [...m.values()].reduce((x, y) => x + y, 0),
      top = [...m].sort((x, y) => y[1] - x[1])[0]![0].split(/\s+/),
      min = Math.min(2, top.length);
    for (let n = top.length; n >= min; n--) {
      const pre = top.slice(0, n).map(tok);
      const share =
        [...m]
          .filter(([st]) => {
            const w = st.split(/\s+/).map(tok);
            return pre.every((x, i) => w[i] === x);
          })
          .reduce((x, [, v]) => x + v, 0) / total;
      if (share >= 0.8 || n === min) {
        names[id] = top.slice(0, n).join(' ');
        break;
      }
    }
  });
  const seen: Record<string, string[]> = {};
  Object.entries(names).forEach(([id, n]) => {
    const k = categoryOf(gearById(id)) + '\u0001' + n;
    (seen[k] = seen[k] || []).push(id);
  });
  Object.values(seen)
    .filter((ids) => ids.length > 1)
    .forEach((ids) =>
      ids.forEach((id) => {
        const a = gearById(id),
          v = (a.model.match(/(?:Preamp|Power amp) section$/) || [])[0];
        if (v) names[id] += ' · ' + v;
        else if (ids.some((o) => o !== id && /(?:Preamp|Power amp) section$/.test(gearById(o).model))) return;
        else names[id] += ' · ' + a.model;
      }),
    );
  return names;
}
