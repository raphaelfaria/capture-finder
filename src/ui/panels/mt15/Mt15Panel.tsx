// PRS MT15: the black faceplate under the grille (power and standby switches, the input and the PRS
// signature are left out; the grille keeps its red MT15). Left→right: PRESENCE, MASTER (lead channel), the
// CLEAN CHANNEL group (BASS · MIDDLE · TREBLE with PULL BOOST · VOLUME) and the LEAD CHANNEL group (BASS ·
// MIDDLE · TREBLE · GAIN), each with its bracket, then the LEAD/CLEAN switch that picks the channel. Each
// channel has its own tone stack; the controls the selected channel doesn't use are dimmed.
import type { Control, GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { available, knobAngle } from '../../../domain/controls';
import { chName } from '../../../domain/channels';
import { nice } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { KnobControl, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Toggle } from '../../primitives/Toggle';
import { Cab, ctl, maybeCtl, num, type PanelProps } from '../shared';

const KNOBS: [string, number][] = [
  ['presence', 36],
  ['master', 96],
  ['cleanbass', 168],
  ['cleanmiddle', 226],
  ['cleantreble', 284],
  ['volume', 344],
  ['leadbass', 412],
  ['leadmiddle', 470],
  ['leadtreble', 528],
  ['gain', 588],
];
const off = (c: Control, as: GearSettings) => (available(c, as.channel) ? '' : ' mtoff');

function Knob({ def, as, c, x }: { def: GearDef; as: GearSettings; c: RangeControl; x: number }) {
  const v = num(as.global[c.key]),
    o = off(c, as),
    pulled = c.key === 'cleantreble' && as.global.pullboost === true;
  const aria =
    nice(c.label) +
    (c.channels
      ? ' (' +
        c.channels.map((n) => chName(def, n)).join(' and ') +
        (o ? ', not used on the ' + chName(def, as.channel) + ' channel' : '') +
        ')'
      : '');
  return (
    <>
      <span class={'mtlab' + o} style={{ left: x + 'px' }}>
        {c.label}
      </span>
      <div class={'mtk' + o + (pulled ? ' pulled' : '')} style={{ left: x + 'px' }}>
        <KnobControl c={c} n={null} value={v} label={aria} size={40}>
          <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
            <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 20 20)`}>
              <circle
                cx="20"
                cy="20"
                r="14.5"
                fill="#101010"
                stroke="#3a3a3a"
                stroke-width="1.6"
                stroke-dasharray="1.4 1.4"
              />
              <circle cx="20" cy="20" r="10.5" fill="#161616" stroke="#2a2a2a" stroke-width="1" />
              <path d="M20 6.5 L20 14" stroke="#f0f0f0" stroke-width="2.2" stroke-linecap="round" />
            </g>
          </svg>
        </KnobControl>
        <Readout v={v} />
      </div>
    </>
  );
}

function Face({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const pb = ctl<SwitchControl>(def, 'pullboost'),
    pbOff = off(pb, as),
    pbOn = as.global.pullboost === true;
  return (
    <div class="mtface" role="group" aria-label={def.brand + ' ' + def.model + ' front panel'}>
      <span class="mtsub" style={{ left: '96px', top: '30px' }}>
        LEAD CHANNEL
      </span>
      <span class="mthead" style={{ left: '256px' }}>
        CLEAN CHANNEL
      </span>
      <span class="mtbracket" style={{ left: '156px', width: '200px' }} />
      <span class="mthead" style={{ left: '500px' }}>
        LEAD CHANNEL
      </span>
      <span class="mtbracket" style={{ left: '400px', width: '200px' }} />
      {KNOBS.map(([k, x]) => {
        const c = maybeCtl(def, k);
        return c ? <Knob def={def} as={as} c={c} x={x} /> : null;
      })}
      <PickButton
        id={scope.prefix + 'p-pullboost-'}
        class={'mtpull' + pbOff}
        style={{ left: '284px' }}
        aria-pressed={pbOn}
        aria-label={
          'Pull Boost (clean treble): ' +
          (pbOn ? 'pulled, on' : 'pushed in, off') +
          (pbOff ? ', not used on the ' + chName(def, as.channel) + ' channel' : '')
        }
        c={pb}
        n={null}
        v={!pbOn}
      >
        <span class="pdot" aria-hidden="true" />
        PULL BOOST
      </PickButton>
      <div class="mttgl">
        <Toggle
          x={640}
          y={50}
          options={[
            { v: 2, label: 'LEAD' },
            { v: 1, label: 'CLEAN' },
          ]}
          current={as.channel}
          channel
          aria="Channel (lead or clean)"
          labelPos={[
            { x: 640, y: 22 },
            { x: 640, y: 78 },
          ]}
        />
      </div>
    </div>
  );
}

/** Amp head: the faceplate under the grille (the signature is left out; the red MT15 stays). */
export function Mt15Panel({ def, as }: PanelProps) {
  return (
    <Cab variant="mtcab">
      <div class="mtgrille" aria-hidden="true">
        <span>MT15</span>
      </div>
      <Face def={def} as={as} />
    </Cab>
  );
}
