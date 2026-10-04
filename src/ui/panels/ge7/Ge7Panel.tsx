// Boss GE-7: the black slider panel of the pedal with a thin margin of its grey body (the LED, jacks,
// footswitch and lower body are left out): seven ±15 dB band sliders (100 … 6.4k) and LEVEL behind its
// divider line, the printed +15 / 0 / −15 scale and the dashes between the sliders, cream slider caps, and
// the name on the grey body below. In a chain (compact) the sliders and case shrink; text keeps its size.
import { f1 } from '../../../domain/format';
import { FaderTrack } from '../../primitives/controls';
import { Cab, FaderInput, ctl, num, type PanelProps } from '../shared';

const KEYS = ['b100', 'b200', 'b400', 'b800', 'b1600', 'b3200', 'b6400', 'level'];
/** The scale a chain draws the pedal at. */
export const GE7_COMPACT = 0.8;
const SCALE: [number, string][] = [
  [15, '+15'],
  [0, '0'],
  [-15, '−15'],
];

/** Pedal: the slider panel with a thin margin of the grey body. */
export function Ge7Panel({ def, as, compact }: PanelProps) {
  const s = compact ? GE7_COMPACT : 1;
  const g = as.global;
  const W = Math.round(300 * s),
    top = 30,
    H = Math.round(124 * s),
    xs = KEYS.map((_, i) => Math.round((i < 7 ? 52 + i * 30 : 268) * s));
  const yOf = (db: number) => top + H * 0.06 + ((15 - db) / 30) * H * 0.88;
  const dashes: { x: number; y: number; db: number }[] = [];
  for (let db = -15; db <= 15; db += 5)
    for (let i = 0; i < 8; i++) {
      if (i === 6) continue;
      dashes.push({ x: (i < 7 ? xs[i]! : xs[7]!) + 15 * s, y: yOf(db), db });
    }
  return (
    <Cab variant="gecab">
      <div
        class="geface"
        style={{ width: W + 'px', height: top + H + 34 + 'px' }}
        role="group"
        aria-label={def.brand + ' ' + def.model + ' controls'}
      >
        {/* printed scale: +15 / 0 / −15 and the dashes between the sliders at every 5 dB */}
        {SCALE.map(([db, lab]) => (
          <span class="gescale" style={{ top: yOf(db) + 'px' }}>
            {lab}
          </span>
        ))}
        {dashes.map((d) => (
          <span class="gedash" style={{ left: d.x - 4 + 'px', top: d.y + 'px', width: (d.db === 0 ? 9 : 7) + 'px' }} />
        ))}
        <span class="gediv" style={{ left: Math.round(250 * s) + 'px', top: top + 6 + 'px', height: H - 12 + 'px' }} />
        {KEYS.map((k, i) => {
          const c = ctl(def, k),
            v = num(g[k]),
            f = (v - c.min) / (c.max - c.min),
            capH = H * 0.12;
          return (
            <>
              <span class="gelab" style={{ left: xs[i] + 'px' }}>
                {i < 7 ? c.label : 'Level'}
              </span>
              <label class="gef" style={{ left: xs[i]! - 12 + 'px', top: top + 'px', height: H + 'px' }}>
                <FaderInput c={c} n={null} value={v} prefix="" />
                <FaderTrack class="getrack" c={c} n={null} value={v} geo="ge" style={{ height: H + 'px' }}>
                  <span class="geslot" />
                  <span
                    class="fcap gecap"
                    style={{ top: ((1 - f) * H * 0.88).toFixed(1) + 'px', height: capH.toFixed(1) + 'px' }}
                  />
                </FaderTrack>
              </label>
              <span class="ro gero" style={{ left: xs[i] + 'px', top: top + H + 4 + 'px' }} aria-hidden="true">
                {f1(v)}
              </span>
            </>
          );
        })}
      </div>
      <div class="gename" aria-hidden="true">
        Equalizer <b>GE-7</b>
      </div>
    </Cab>
  );
}
