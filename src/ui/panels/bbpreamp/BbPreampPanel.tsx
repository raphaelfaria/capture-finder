// Xotic Effects BB Preamp: the red pedal's control area with a thin margin (the LED, bypass footswitch,
// jacks and the lower body are left out). Four white seven-lobed knobs in a 2 × 2 grid — GAIN · TREBLE over
// VOLUME · BASS — each with its black pointer line and the printed dot that marks the start of its travel;
// light-pink labels under the knobs and the name in plain text where the pedal prints it. In a chain
// (compact) the knobs and case shrink, but the rows keep room for the full-size labels.
import type { RangeControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, Readout } from '../../primitives/controls';
import { Cab, maybeCtl, num, type PanelProps } from '../shared';

const POS: Record<string, [number, number]> = {
  gain: [60, 52],
  treble: [168, 52],
  volume: [60, 140],
  bass: [168, 140],
};
/** The scale a chain draws the pedal at. */
export const BB_COMPACT = 0.72;
const CAP = (function () {
  const N = 140,
    lobes = 7,
    R = 30,
    depth = 2.6;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI,
      r = R - depth * (0.5 - 0.5 * Math.cos(lobes * a));
    d += (i ? 'L' : 'M') + (34 + r * Math.sin(a)).toFixed(2) + ' ' + (34 - r * Math.cos(a)).toFixed(2);
  }
  return d + 'Z';
})();
const DOT = (function () {
  const a = (-150 * Math.PI) / 180;
  return { cx: (34 + 33 * Math.sin(a)).toFixed(1), cy: (34 - 33 * Math.cos(a)).toFixed(1) };
})();

function Knob({ c, v, s }: { c: RangeControl; v: number; s: number }) {
  const [px, py] = POS[c.key]!;
  const x = px * s,
    y = s < 1 ? (py < 100 ? 36 : 116) : py,
    k = Math.round(68 * s);
  return (
    <>
      <div class="bbk" style={{ left: x + 'px', top: y + 'px', width: k + 'px', height: k + 'px' }}>
        <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={k}>
          <svg viewBox="0 0 68 68" width={k} height={k} aria-hidden="true">
            <circle cx={DOT.cx} cy={DOT.cy} r="2.2" fill="#140e0e" />
            <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 34 34)`}>
              <path d={CAP} fill="#f7f7f5" stroke="#c9c4c0" stroke-width="1" />
              <circle cx="34" cy="34" r="21" fill="none" stroke="#e4e0dc" stroke-width="1" />
              <path d="M34 13 L34 26" stroke="#141414" stroke-width="3.6" stroke-linecap="round" />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
      <span class="bblab" style={{ left: x + 'px', top: y + (s < 1 ? 38 : 44) + 'px' }}>
        {nice(c.label)}
      </span>
    </>
  );
}

/** Pedal: only the control area with a thin margin of the red enclosure. */
export function BbPreampPanel({ def, as, compact }: PanelProps) {
  const s = compact ? BB_COMPACT : 1;
  return (
    <Cab variant="bbcab">
      <div
        class={'bbface' + (s < 1 ? ' compact' : '')}
        style={{ width: Math.round(228 * s) + 'px', height: (s < 1 ? 212 : 236) + 'px' }}
        role="group"
        aria-label={def.brand + ' ' + def.model + ' controls'}
      >
        <span class="bbline" aria-hidden="true" />
        {['gain', 'treble', 'volume', 'bass'].map((k) => {
          const c = maybeCtl(def, k);
          return c ? <Knob c={c} v={num(as.global[k])} s={s} /> : null;
        })}
        <span
          class="bbname"
          style={{ left: Math.round(114 * s) + 'px', top: (s < 1 ? 186 : 208) + 'px' }}
          aria-hidden="true"
        >
          BB<span>-preamp</span>
        </span>
      </div>
    </Cab>
  );
}
