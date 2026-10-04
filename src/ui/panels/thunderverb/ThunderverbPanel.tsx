// Orange Thunderverb 50: the white faceplate inside the orange tolex (standby, the jewel light, the input,
// the logo and the crest are left out; the name stays as plain text). Under the name, the black strip with
// the CHANNEL A / CHANNEL B bars, the orange strip with Orange's pictograms and the labels, then the knobs:
// ATTENUATOR · REVERB, channel A (VOLUME · TREBLE · MIDDLE · BASS · GAIN), channel B (VOLUME · SHAPE ·
// GAIN), big and small black ribbed knobs as on the amp. The CHANNEL switch picks the channel; the controls
// the selected channel doesn't use are dimmed. Reverb isn't recorded (shown, not matched).
import type { Control, GearDef, RangeControl } from '../../../../shared/schema';
import { available, knobAngle } from '../../../domain/controls';
import { chName } from '../../../domain/channels';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { KnobControl, NotMatched, Readout } from '../../primitives/controls';
import { Toggle } from '../../primitives/Toggle';
import { Cab, ctl, num, type PanelProps } from '../shared';

/** [key, x, big knob] */
const KNOBS: [string, number, boolean][] = [
  ['attenuator', 124, true],
  ['reverb', 180, true],
  ['volumea', 236, true],
  ['treble', 284, false],
  ['middle', 326, false],
  ['bass', 368, false],
  ['gaina', 418, true],
  ['volumeb', 474, true],
  ['shape', 522, false],
  ['gainb', 570, true],
];
const ICON: Record<string, string> = {
  channel: '<path d="M1 11V5h4v6h4V5h3"/><path d="M13 8q2-5 4 0t4 0"/>',
  attenuator: '<path d="M2 6h3l4-4v12l-4-4H2z"/><path d="M15 3v9M12 9l3 3 3-3"/>',
  reverb:
    '<circle cx="4" cy="8" r="2.6"/><circle cx="9" cy="8" r="2.6"/><circle cx="14" cy="8" r="2.6"/><circle cx="19" cy="8" r="2.6"/>',
  volume: '<path d="M2 6h3l4-4v12l-4-4H2z"/><path d="M12 4q4 4 0 8M15 2q6 6 0 12"/>',
  treble: '<path d="M5 14V2q5 1 1 6q-4 3 0 5"/><path d="M15 13V4M12 7l3-3 3 3"/>',
  middle: '<path d="M1 8h6M5 5l3 3-3 3"/><circle cx="11" cy="8" r="1.6"/><path d="M21 8h-6M17 5l-3 3 3 3"/>',
  bass: '<path d="M3 13q7-2 5-8q-3-3-5 0"/><circle cx="10" cy="5" r=".8"/><circle cx="10" cy="9" r=".8"/><path d="M16 3v9M13 9l3 3 3-3"/>',
  gain: '<path d="M1 12l4-6 3 4 4-7 3 6 4-5"/>',
  shape: '<path d="M2 3v10l9-5zM20 3v10l-9-5z"/>',
};
/** Orange's pictogram for a control (static markup). */
const Icon = ({ k, x }: { k: string; x: number }) => (
  <svg
    class="tvicon"
    style={{ left: x + 'px' }}
    viewBox="0 0 22 16"
    width="22"
    height="16"
    aria-hidden="true"
    fill="none"
    stroke="#141414"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    dangerouslySetInnerHTML={{ __html: ICON[k]! }}
  />
);
const iconOf = (k: string) =>
  k === 'volumea' || k === 'volumeb' ? 'volume' : k === 'gaina' || k === 'gainb' ? 'gain' : k;
const off = (c: Control, as: GearSettings) => (available(c, as.channel) ? '' : ' tvoff');

function Knob({ def, as, c, x, big }: { def: GearDef; as: GearSettings; c: RangeControl; x: number; big: boolean }) {
  const v = num(as.global[c.key]),
    o = off(c, as),
    k = big ? 46 : 34,
    r = k / 2;
  const ribs = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return `M${(r + (r - 1) * Math.sin(a)).toFixed(1)} ${(r - (r - 1) * Math.cos(a)).toFixed(1)}L${(r + (r - 5) * Math.sin(a)).toFixed(1)} ${(r - (r - 5) * Math.cos(a)).toFixed(1)}`;
  });
  const aria =
    nice(c.label) +
    (c.channels
      ? ' (channel ' +
        c.channels.map((n) => chName(def, n)).join(' and ') +
        (o ? ', not used on channel ' + chName(def, as.channel) : '') +
        ')'
      : '') +
    (c.weight > 0 ? '' : ' (not used for matching)');
  return (
    <div class={'tvk' + o} style={{ left: x + 'px', width: k + 'px', height: k + 'px' }}>
      <KnobControl c={c} n={null} value={v} label={aria} size={k}>
        <svg viewBox={`0 0 ${k} ${k}`} width={k} height={k} aria-hidden="true">
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} ${r} ${r})`}>
            <circle cx={r} cy={r} r={r - 1} fill="#111" stroke="#3a3a3a" stroke-width="1" />
            <g stroke="#2c2c2c" stroke-width="2">
              {ribs.map((d) => (
                <path d={d} />
              ))}
            </g>
            <circle cx={r} cy={r} r={r - 6} fill="#151515" stroke="#2a2a2a" stroke-width="1" />
            <path d={`M${r} 3 L${r} ${r - 2}`} stroke="#e9e9e9" stroke-width="2" stroke-linecap="round" />
          </g>
        </svg>
      </KnobControl>
      <Readout v={v} />
    </div>
  );
}

/** Amp head: the white faceplate inside the orange tolex (no grille on this head's front). */
export function ThunderverbPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="tvcab">
      <div class="tvface" role="group" aria-label={def.brand + ' ' + def.model + ' front panel'}>
        <span class="tvname" aria-hidden="true">
          ORANGE<span>THUNDERVERB 50</span>
        </span>
        <span class="tvblack" aria-hidden="true" />
        <span class="tvbar" style={{ left: '210px', width: '236px' }}>
          CHANNEL A
        </span>
        <span class="tvbar" style={{ left: '452px', width: '144px' }}>
          CHANNEL B
        </span>
        <span class="tvorange" aria-hidden="true" />
        <Icon k="channel" x={49} />
        {KNOBS.map(([k, x]) => (
          <Icon k={iconOf(k)} x={x - 11} />
        ))}
        <span class="tvlab" style={{ left: '60px' }}>
          CHANNEL
        </span>
        {KNOBS.map(([k, x, big]) => {
          const c = ctl(def, k);
          return (
            <>
              <span class={'tvlab' + off(c, as)} style={{ left: x + 'px' }}>
                <NotMatched c={c} />
                {c.label}
              </span>
              <Knob def={def} as={as} c={c} x={x} big={big} />
            </>
          );
        })}
        <div class="tvtgl">
          <Toggle
            x={60}
            y={150}
            options={def.channels!.map((ch) => ({ v: ch.n, label: ch.name }))}
            current={as.channel}
            channel
            aria="Channel (A or B)"
            labelPos={[
              { x: 60, y: 126 },
              { x: 60, y: 176 },
            ]}
          />
        </div>
      </div>
    </Cab>
  );
}
