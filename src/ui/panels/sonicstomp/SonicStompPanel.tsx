// BBE Sonic Stomp: the red pedal's control area with a thin margin (the footswitch, jacks, BBE logo and
// "Sonic Maximizer" are left out): two silver knobs with a black indicator dot over the printed dot scale
// (0 · 5 · 10), LO CONTOUR and PROCESS below them, and the name in plain text where the script is. In a
// chain (compact) the knobs and case shrink; text keeps its size.
import type { RangeControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, Readout } from '../../primitives/controls';
import { Cab, ctl, num, type PanelProps } from '../shared';

/** The scale a chain draws the pedal at. */
export const SONIC_STOMP_COMPACT = 0.74;
const SCALE_FONT = {
  'font-size': '9',
  fill: '#fbe9e6',
  'font-family': 'Barlow Semi Condensed,Arial Narrow,sans-serif',
  'font-weight': '700',
};
const Scale = () => (
  <>
    {Array.from({ length: 11 }, (_, v) => {
      const a = ((-150 + v * 30) * Math.PI) / 180;
      return (
        <circle
          cx={(40 + 36 * Math.sin(a)).toFixed(1)}
          cy={(40 - 36 * Math.cos(a)).toFixed(1)}
          r="1.8"
          fill="#fbe9e6"
        />
      );
    })}
    <text x="14" y="76" {...SCALE_FONT}>
      0
    </text>
    <text x="37" y="6" {...SCALE_FONT}>
      5
    </text>
    <text x="61" y="76" {...SCALE_FONT}>
      10
    </text>
  </>
);

function Knob({ c, v, x, y, s }: { c: RangeControl; v: number; x: number; y: number; s: number }) {
  const k = Math.round(80 * s);
  return (
    <div class="ssk" style={{ left: x + 'px', top: y + 'px', width: k + 'px', height: k + 'px' }}>
      <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={k}>
        <svg viewBox="0 0 80 80" width={k} height={k} aria-hidden="true">
          <Scale />
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 40 40)`}>
            <circle cx="40" cy="40" r="25" fill="#c9c9c9" stroke="#8a8a8a" stroke-width="1.2" />
            <circle cx="40" cy="40" r="19" fill="#e4e4e4" stroke="#b5b5b5" stroke-width="1" />
            <circle cx="40" cy="25" r="2.6" fill="#141414" />
          </g>
        </svg>
      </KnobControl>
      <Readout v={v} />
    </div>
  );
}

/** Pedal: only the control area with a thin margin of the red enclosure. */
export function SonicStompPanel({ def, as, compact }: PanelProps) {
  const s = compact ? SONIC_STOMP_COMPACT : 1;
  const W = Math.round(260 * s),
    y = Math.round(54 * s);
  return (
    <Cab variant="sscab">
      <div
        class="ssface"
        style={{ width: W + 'px', height: y + 106 + 'px' }}
        role="group"
        aria-label={def.brand + ' ' + def.model + ' controls'}
      >
        <span class="ssline" aria-hidden="true" />
        {(
          [
            ['locontour', 70],
            ['process', 190],
          ] as const
        ).map(([k, x]) => {
          const c = ctl(def, k);
          return (
            <>
              <Knob c={c} v={num(as.global[k])} x={Math.round(x * s)} y={y} s={s} />
              <span class="sslab" style={{ left: Math.round(x * s) + 'px', top: y + 40 * s + 10 + 'px' }}>
                {c.label}
              </span>
            </>
          );
        })}
        <span class="ssname" style={{ top: y + 40 * s + 42 + 'px' }} aria-hidden="true">
          Sonic Stomp
        </span>
      </div>
    </Cab>
  );
}
