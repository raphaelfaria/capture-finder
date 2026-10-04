// Aguilar Tone Hammer 500: compact single-channel bass head with a silver faceplate. The six recorded
// knobs sit in two staggered rows as on the panel: Gain · Mid Level · Bass over Drive · Mid Freq ·
// Treble. Master, pad, jacks and switches are not recorded, so not shown.
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, Readout } from '../../primitives/controls';
import { Cab, ctl, num, type PanelProps } from '../shared';

const POS: Record<string, [number, number]> = {
  gain: [42, 0],
  midlevel: [132, 0],
  bass: [222, 0],
  drive: [88, 96],
  midfreq: [178, 96],
  treble: [268, 96],
};

/** Compact metal head: black chassis frame around the silver faceplate; no tolex or grille. */
export function ToneHammerPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="thcab">
      <div class="thface" role="group" aria-label="Aguilar Tone Hammer 500 front panel">
        <div class="thknobs">
          {def.panelOrder!.map((key) => {
            const c = ctl(def, key),
              v = num(as.global[key]),
              [x, y] = POS[key]!;
            return (
              <div class="thk" style={{ left: x + 'px', top: y + 'px' }}>
                <span class="thlab">{c.label}</span>
                <KnobControl c={c} n={null} value={v} label={nice(c.label)}>
                  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
                    <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 28 28)`}>
                      <circle cx="28" cy="28" r="18.5" fill="#141414" stroke="#000" stroke-width="1.2" />
                      <circle cx="28" cy="28" r="14" fill="none" stroke="#2c2c2c" stroke-width="1" />
                      <path d="M28 11.5 L28 20" stroke="#f2f2f2" stroke-width="2.4" stroke-linecap="round" />
                    </g>
                  </svg>
                </KnobControl>
                <Readout v={v} class="jro" />
              </div>
            );
          })}
        </div>
        <div class="thname">
          <span class="thmodel">TONE HAMMER 500</span>
          <span class="thbrand">AGUILAR</span>
        </div>
      </div>
    </Cab>
  );
}
