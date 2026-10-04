// Origin Effects Cali76: the black control panel inside a thin silver margin, as on the pedal: DRY ·
// OUT · IN over RATIO · ATTACK · RELEASE (top labels below, bottom labels above), large brushed-silver
// knobs, and the model name at the panel's bottom edge. DRY is not recorded by any capture (shown, not
// matched). Ratio is a 4-position knob (4/8/12/20:1). Jacks, meter, LED, logo and footswitch are
// cropped away.
import type { RangeControl, SwitchControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { CycleButton, KnobControl, NotMatched, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Cab, num, type PanelProps } from '../shared';

const POS: Record<string, [number, number]> = {
  dry: [50, 46],
  output: [148, 46],
  inputcomp: [246, 46],
  ratio: [50, 176],
  attack: [148, 176],
  release: [246, 176],
};
const LAB: Record<string, number> = { dry: 94, output: 94, inputcomp: 94, ratio: 121, attack: 121, release: 121 };
const R = 40,
  SIZE = R * 2 + 4;

function KnobSVG({ angle }: { angle: number }) {
  const m = SIZE / 2,
    rad = (deg: number) => (deg * Math.PI) / 180;
  const dot = (deg: number) => (
    <circle
      cx={(m + R * Math.sin(rad(deg))).toFixed(1)}
      cy={(m - R * Math.cos(rad(deg))).toFixed(1)}
      r="1.6"
      fill="#bdbdbd"
    />
  );
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
      {dot(-150)}
      {dot(150)}
      <g transform={`rotate(${angle.toFixed(1)} ${m} ${m})`}>
        <circle cx={m} cy={m} r={R - 5} fill="#d3d6d9" stroke="#8f9499" stroke-width="1.2" />
        <circle cx={m} cy={m} r={R - 9} fill="none" stroke="#e4e6e8" stroke-width="1" />
        <path
          d={`M${m} ${m - (R - 7)} L${m} ${(m - (R - 7) * 0.45).toFixed(1)}`}
          stroke="#141414"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>
    </svg>
  );
}

function Knob({ c, v }: { c: RangeControl; v: number }) {
  const [x, y] = POS[c.key]!;
  return (
    <div class="cak" style={{ left: x + 'px', top: y + 'px' }}>
      <KnobControl
        c={c}
        n={null}
        value={v}
        label={nice(c.label) + (c.weight > 0 ? '' : ' (not used for matching)')}
        size={SIZE}
      >
        <KnobSVG angle={knobAngle(c, v)} />
      </KnobControl>
      <Readout v={v} />
    </div>
  );
}

/** Ratio: four detents; the knob cycles, the printed numbers pick a position. */
function Ratio({ c, v }: { c: SwitchControl; v: unknown }) {
  const scope = useScope();
  const [x, y] = POS.ratio!,
    n = c.options.length,
    idx = Math.max(
      0,
      c.options.findIndex((o) => o.v === v),
    );
  const deg = (i: number) => -135 + (i * 270) / (n - 1);
  return (
    <>
      <div class="cak" style={{ left: x + 'px', top: y + 'px', width: SIZE + 'px', height: SIZE + 'px' }}>
        <KnobSVG angle={deg(idx)} />
        <CycleButton class="cacycle" tabIndex={-1} aria-hidden="true" c={c} n={null} current={v as number} />
      </div>
      {c.options.map((o, i) => {
        const a = (deg(i) * Math.PI) / 180,
          px = x + (R + 13) * Math.sin(a),
          py = y - (R + 13) * Math.cos(a);
        return (
          <PickButton
            id={scope.prefix + 't-ratio--' + i}
            class="carat"
            style={{ left: px.toFixed(1) + 'px', top: py.toFixed(1) + 'px' }}
            aria-pressed={o.v === v}
            aria-label={'Ratio ' + o.label}
            c={c}
            n={null}
            v={o.v}
          >
            {String(o.v)}
          </PickButton>
        );
      })}
    </>
  );
}

/** Pedal: only the black control panel with a thin margin of the silver enclosure. */
export function Cali76Panel({ def, as }: PanelProps) {
  return (
    <Cab variant="cacab">
      <div class="caface" role="group" aria-label="Origin Effects Cali76 controls">
        <div class="capanel">
          <span class="cadiv" aria-hidden="true" />
          {def.panelOrder!.map((key) => {
            const c = def.controls.find((x) => x.key === key)!,
              v = as.global[key];
            return (
              <>
                {c.kind === 'switch' ? <Ratio c={c} v={v} /> : <Knob c={c} v={num(v)} />}
                <span class="calab" style={{ left: POS[key]![0] + 'px', top: LAB[key] + 'px' }}>
                  <NotMatched c={c} style="color:#9a9a9a" />
                  {c.label}
                </span>
              </>
            );
          })}
          {/* Name where the pedal prints it: at the bottom edge of the black panel (plain text) */}
          <div class="caname" aria-hidden="true">
            <b>Cali76</b>
            <span>FET COMPRESSOR</span>
          </div>
        </div>
      </div>
    </Cab>
  );
}
