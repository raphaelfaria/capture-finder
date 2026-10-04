// Ibanez TS9 Tube Screamer: only the control area of the pedal is drawn (lime-green paint): Drive and
// Level (large knobs, labels below) flank a smaller Tone knob set lower (label above). Knurled black
// skirts, silver caps, printed segmented scale rings. The name sits in a slim plate below, where the
// pedal's name plate is; LED, jacks, footswitch and body are cropped away. In a chain (compact) the
// knobs and case shrink; text keeps its size.
import type { RangeControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { f1, nice } from '../../../domain/format';
import { KnobControl } from '../../primitives/controls';
import { Cab, ctl, num, type PanelProps } from '../shared';

interface Place {
  x: number;
  y: number;
  r: number;
  lab: [number, number];
  ro?: [number, number];
}
const POS: Record<string, Place> = {
  drive: { x: 58, y: 46, r: 44, lab: [58, 100] },
  level: { x: 214, y: 46, r: 44, lab: [214, 100] },
  tone: { x: 136, y: 112, r: 36, lab: [136, 52], ro: [136, 156] },
};
/** The scale a chain draws the pedal at. */
export const TS9_COMPACT = 0.74;

function Knob({ c, v, p }: { c: RangeControl; v: number; p: Place }) {
  const size = p.r * 2 + 4,
    m = size / 2,
    sk = p.r * 0.72,
    cap = p.r * 0.5;
  // printed scale: ten wide arc segments with narrow gaps, open at the bottom
  const rr = p.r - 5,
    pt = (deg: number) =>
      (m + rr * Math.sin((deg * Math.PI) / 180)).toFixed(1) +
      ' ' +
      (m - rr * Math.cos((deg * Math.PI) / 180)).toFixed(1);
  let ring = '';
  for (let i = 0; i < 10; i++) {
    const a0 = -150 + i * 30 + 4,
      a1 = a0 + 22;
    ring += 'M' + pt(a0) + ' A' + rr + ' ' + rr + ' 0 0 1 ' + pt(a1);
  }
  return (
    <div class="tsk" style={{ left: p.x + 'px', top: p.y + 'px' }}>
      <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={size}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
          <path d={ring} stroke="#141414" stroke-width="8" fill="none" />
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} ${m} ${m})`}>
            <circle
              cx={m}
              cy={m}
              r={sk.toFixed(1)}
              fill="#151515"
              stroke="#3a3a3a"
              stroke-width="1.6"
              stroke-dasharray="1.2 1.6"
            />
            <circle cx={m} cy={m} r={cap.toFixed(1)} fill="#cfd2d4" stroke="#8e9296" stroke-width="1" />
            <path
              d={`M${m} ${(m - cap + 2).toFixed(1)} L${m} ${(m - cap * 0.35).toFixed(1)}`}
              stroke="#141414"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </g>
        </svg>
      </KnobControl>
    </div>
  );
}

/** Pedal: only the control area, in a thin dark frame; no cabinet or grille. */
export function Ts9Panel({ def, as, compact }: PanelProps) {
  const s = compact ? TS9_COMPACT : 1;
  return (
    <Cab variant="tscab">
      <div class={'tsface' + (s < 1 ? ' compact' : '')} role="group" aria-label="Ibanez TS9 Tube Screamer controls">
        <div
          class="tsknobs"
          style={{ width: Math.round(272 * s) + 'px', height: Math.round(172 * s + (1 - s) * 28) + 'px' }}
        >
          {def.panelOrder!.map((key) => {
            const c = ctl(def, key),
              q = POS[key]!,
              v = num(as.global[key]);
            const p: Place = {
              x: q.x * s,
              y: q.y * s,
              r: q.r * s,
              lab: [q.lab[0] * s, q.lab[1] * s + (q.ro ? 0 : (1 - s) * 14)],
              ro: q.ro && [q.ro[0] * s, q.ro[1] * s + (1 - s) * 20],
            };
            const ro = (
              <span class="jro" aria-hidden="true">
                {f1(v)}
              </span>
            );
            return (
              <>
                <Knob c={c} v={v} p={p} />
                {p.ro ? (
                  <>
                    <div class="tslab" style={{ left: p.lab[0] + 'px', top: p.lab[1] - 18 + 'px' }}>
                      <span class="tsl">{c.label}</span>
                    </div>
                    <div class="tslab" style={{ left: p.ro[0] + 'px', top: p.ro[1] + 'px' }}>
                      {ro}
                    </div>
                  </>
                ) : (
                  <div class="tslab" style={{ left: p.lab[0] + 'px', top: p.lab[1] + 'px' }}>
                    <span class="tsl">{c.label}</span>
                    {ro}
                  </div>
                )}
              </>
            );
          })}
        </div>
        {/* Name where the pedal prints it: the name plate below the controls (plain text, one line) */}
        <div class="tsplate">
          <span>IBANEZ</span>
          <span>TS9 Tube Screamer</span>
        </div>
      </div>
    </Cab>
  );
}
