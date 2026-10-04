// Fender Hot Rod Deluxe: the black top panel above the grille, with the name as plain text where the logo
// plate sits (the input, preamp out / power amp in / footswitch jacks, jewel light, standby and power
// switches are left out). Left→right: NORMAL BRIGHT, VOLUME, MORE DRIVE, DRIVE (with the drive channel's
// yellow LED), TREBLE, BASS, MIDDLE, CHANNEL SELECT, MASTER, REVERB, PRESENCE. Cream pointer knobs over
// printed 1–12 scales (0, written in a few captures, sits fully counter-clockwise like 1); square push
// buttons with their labels underneath. CHANNEL SELECT picks the channel (no tabs), and the controls the
// selected channel doesn't use are dimmed. The power amp section entry draws only its Presence knob.
import type { Control, GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { available } from '../../../domain/controls';
import { chName } from '../../../domain/channels';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { ChannelButton, KnobControl, NotMatched, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Cab, maybeCtl, num, type PanelProps } from '../shared';

type Item = [string, number, string[]?];
const ITEMS: Item[] = [
  ['normalbright', 28, ['NORMAL', 'BRIGHT']],
  ['volume', 63],
  ['moredrive', 97, ['MORE', 'DRIVE']],
  ['drive', 133],
  ['@led', 167],
  ['treble', 202],
  ['bass', 262],
  ['middle', 321],
  ['@select', 355, ['CHANNEL', 'SELECT']],
  ['master', 391],
  ['reverb', 450],
  ['presence', 510],
];
const ANG = (n: number) => -150 + ((n - 1) * 300) / 11; // printed 1 … 12 across the knob's travel
const Scale = () => (
  <svg class="hrscale" viewBox="0 0 66 66" width="66" height="66" aria-hidden="true">
    {Array.from({ length: 12 }, (_, i) => {
      const n = i + 1,
        a = (ANG(n) * Math.PI) / 180;
      return (
        <text
          x={(33 + 25.5 * Math.sin(a)).toFixed(1)}
          y={(35.5 - 25.5 * Math.cos(a)).toFixed(1)}
          text-anchor="middle"
          font-size="7"
          font-family="Barlow Semi Condensed,Arial Narrow,sans-serif"
          font-weight="600"
          fill="#e6e1cc"
        >
          {n}
        </text>
      );
    })}
  </svg>
);
const off = (c: Control, as: GearSettings) => (c.channels && !available(c, as.channel) ? ' hroff' : '');
const offAria = (def: GearDef, c: Control, as: GearSettings) =>
  off(c, as) ? ', not used on the ' + chName(def, as.channel) + ' channel' : '';

function Knob({ def, c, as, x }: { def: GearDef; c: RangeControl; as: GearSettings; x: number }) {
  const v = num(as.global[c.key]),
    o = off(c, as),
    angle = ANG(Math.min(12, Math.max(1, v)));
  return (
    <>
      <span class={'hrlab' + o} style={{ left: x + 'px' }}>
        <NotMatched c={c} />
        {c.label}
      </span>
      <span class={'hrsc' + o} style={{ left: x + 'px' }}>
        <Scale />
      </span>
      <div class={'hrk' + o} style={{ left: x + 'px' }}>
        <KnobControl
          c={c}
          n={null}
          value={v}
          label={nice(c.label) + (c.weight > 0 ? '' : ' (not used for matching)') + offAria(def, c, as)}
          size={44}
        >
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
            <g transform={`rotate(${angle.toFixed(1)} 22 22)`}>
              <path
                d="M22 2.5 L30.3 17.4 A9.5 9.5 0 1 1 13.7 17.4 Z"
                fill="#ebe7d3"
                stroke="#a29d88"
                stroke-width="1"
                stroke-linejoin="round"
              />
              <path d="M22 5.5 L22 15" stroke="#6d6857" stroke-width="1.3" stroke-linecap="round" />
            </g>
          </svg>
        </KnobControl>
      </div>
      <Readout v={v} class={'ro hrro' + o} style={{ left: x + 'px' }} />
    </>
  );
}

function PushButton({
  def,
  c,
  as,
  x,
  lines,
}: {
  def: GearDef;
  c: SwitchControl;
  as: GearSettings;
  x: number;
  lines: string[];
}) {
  const scope = useScope();
  const o = off(c, as),
    on = as.global[c.key] === true;
  return (
    <PickButton
      id={scope.prefix + 'p-' + c.key + '-'}
      class={'hrbtn' + o}
      style={{ left: x + 'px' }}
      aria-pressed={on}
      aria-label={nice(c.label) + ': ' + (on ? 'on (pushed in)' : 'off') + offAria(def, c, as)}
      c={c}
      n={null}
      v={!on}
    >
      <span class="hrcap" aria-hidden="true" />
      <span class="hrbl">{lines.map((l, i) => (i ? [<br />, l] : l))}</span>
    </PickButton>
  );
}

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const full = !!def.channels;
  const items: Item[] = full
    ? ITEMS
    : ITEMS.filter(([k]) => maybeCtl(def, k)).map(([k, , l], i) => [k, 40 + 60 * i, l]);
  return (
    <div class="hrface" role="group" aria-label={def.brand + ' ' + def.model + ' top panel'}>
      <div class="hrsec" style={{ width: (full ? 540 : 20 + 60 * items.length) + 'px' }}>
        {items.map(([k, x, lines]) => {
          if (k === '@led')
            return (
              <span class={'hrled' + (as.channel === 2 ? ' on' : '')} style={{ left: x + 'px' }} aria-hidden="true" />
            );
          if (k === '@select') {
            const other = def.channels!.find((c) => c.n !== as.channel)!;
            return (
              <>
                <ChannelButton
                  id={scope.prefix + 'hr-select'}
                  class="hrbtn sel"
                  style={{ left: x + 'px' }}
                  aria-label={
                    'Channel select: ' + chName(def, as.channel) + ' channel selected; press for ' + other.name
                  }
                  n={other.n}
                >
                  <span class="hrcap" aria-hidden="true" />
                  <span class="hrbl">{lines!.map((l, i) => (i ? [<br />, l] : l))}</span>
                </ChannelButton>
                <span class="ro hrchro" style={{ left: x + 'px' }} aria-hidden="true">
                  {chName(def, as.channel).toUpperCase()}
                </span>
              </>
            );
          }
          const c = maybeCtl<RangeControl | SwitchControl>(def, k);
          if (!c) return null;
          return c.kind === 'switch' ? (
            <PushButton def={def} c={c} as={as} x={x} lines={lines!} />
          ) : (
            <Knob def={def} c={c} as={as} x={x} />
          );
        })}
      </div>
    </div>
  );
}

/** Combo: the top panel above the grille, with the name where the logo plate is. */
export function HotRodPanel({ def, as }: PanelProps) {
  return (
    <Cab variant="hrcab">
      <Face def={def} as={as} />
      <div class="hrgrille" aria-hidden="true">
        <span class="hrplate">
          FENDER<span>HOT ROD DELUXE</span>
        </span>
      </div>
    </Cab>
  );
}
