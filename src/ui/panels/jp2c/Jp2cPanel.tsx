// Mesa/Boogie JP-2C: three channel panels (GAIN · MASTER · PRESENCE over TREBLE · MID · BASS, with
// PULL GAIN / PULL PRES on channels 2 and 3), then the EQ panel of the selected channel (five sliders and
// its EQ switch), the channel selector and the Shred switch.
import type { SwitchControl } from '../../../../shared/schema';
import { f1 } from '../../../domain/format';
import { ChannelButton, PickButton } from '../../primitives/controls';
import { FADER_GEOMETRY } from '../../primitives/drag';
import { useScope } from '../../primitives/scope';
import { Toggle } from '../../primitives/Toggle';
import { FaderTrack } from '../../primitives/controls';
import { Cab, FaderInput, KnobBox, ctl, num, type PanelProps } from '../shared';

const KX = [40, 126, 212],
  KY = [37, 135];
const LED: Record<number, string> = { 1: '#5fe03a', 2: '#f2c52e', 3: '#f0412c' };
const ROWS = [
  ['gain', 'master', 'presence'],
  ['treble', 'mid', 'bass'],
];

function Jp2cFace({ def, as }: Omit<PanelProps, 'compact'>) {
  const scope = useScope();
  const ch = as.channel!,
    cs = as.ch[ch]!;
  return (
    <>
      <div class="modelname">JP-2C</div>
      {def.channels!.map((chn) => {
        const n = chn.n,
          c = as.ch[n]!,
          on = n === ch,
          prefix = 'Channel ' + n + ' ';
        const labels: [string, number, number][] = [
          ['MASTER', KX[1]!, 79],
          ['TREBLE', KX[0]!, 100],
          ['MID', KX[1]!, 100],
          ['BASS', KX[2]!, 100],
        ];
        if (n === 1) labels.push(['GAIN', KX[0]!, 79], ['PRESENCE', KX[2]!, 79]);
        return (
          <div
            class={'panel' + (on ? ' on' : '')}
            style={{ width: '252px', height: '175px' }}
            role="group"
            aria-label={'Channel ' + n + ' ' + chn.name + (on ? ', selected' : '')}
          >
            {ROWS.map((row, r) =>
              row.map((key, i) => {
                const pulled = (key === 'gain' && c.pullGain === true) || (key === 'presence' && c.pullPres === true);
                return (
                  <KnobBox
                    c={ctl(def, key)}
                    n={n}
                    value={num(c[key])}
                    prefix={prefix}
                    extraClass={pulled ? ' pulled' : ''}
                    style={{ position: 'absolute', left: KX[i]! - 28 + 'px', top: KY[r]! - 28 + 'px' }}
                  />
                );
              }),
            )}
            {labels.map(([t, x, y]) => (
              <span class="silk pos" style={{ left: x + 'px', top: y + 'px' }}>
                {t}
              </span>
            ))}
            {n !== 1
              ? (
                  [
                    ['pullGain', 'PULL GAIN', KX[0]!],
                    ['pullPres', 'PULL PRES', KX[2]!],
                  ] as const
                ).map(([key, label, x]) => {
                  const onP = !!c[key];
                  return (
                    <PickButton
                      id={scope.prefix + 'p-' + key + '-' + n}
                      class="pullbtn pos"
                      style={{ left: x + 'px', top: '79px' }}
                      aria-pressed={onP}
                      aria-label={'Channel ' + n + ' ' + label + ': ' + (onP ? 'pulled, on' : 'pushed in, off')}
                      c={ctl<SwitchControl>(def, key)}
                      n={n}
                      v={!onP}
                    >
                      <span class="pdot" aria-hidden="true" />
                      <span class="silk">{label}</span>
                    </PickButton>
                  );
                })
              : null}
            <span class="cled" style={{ left: '83px', top: '91px', background: on ? LED[n] : '#2e2e2e' }} />
            <ChannelButton
              id={scope.prefix + 'cs-' + n}
              class="chsel pos"
              style={{ left: '83px', top: '76px' }}
              aria-label={'Select channel ' + n + ' ' + chn.name}
              n={n}
            >
              <span class="silk s">{'CH ' + n}</span>
            </ChannelButton>
          </div>
        );
      })}
      <div
        class={'panel' + (cs.eqOn === false ? ' eqoff' : '')}
        style={{ width: '300px', height: '175px', background: '#0f0f0f', borderRadius: '10px' }}
        role="group"
        aria-label="EQ and switches"
      >
        <span
          class="eqline"
          style={{
            position: 'absolute',
            left: '56px',
            top: '20px',
            width: '158px',
            height: '130px',
            border: '1.5px solid rgba(235,235,235,.8)',
            borderRadius: '10px',
          }}
        />
        <span
          class="eqline"
          style={{
            position: 'absolute',
            left: '56px',
            top: '85px',
            width: '158px',
            height: '1.5px',
            background: 'rgba(235,235,235,.8)',
          }}
        />
        {def.controls
          .filter((c) => c.group === 'eq')
          .map((c, i) => {
            const rc = c as Extract<typeof c, { min: number }>;
            const v = num(cs[c.key]),
              f = (v - rc.min) / (rc.max - rc.min),
              capTop = FADER_GEOMETRY.jp.capTop(f),
              x = 71 + 32 * i;
            return (
              <>
                <label style={{ position: 'absolute', left: x - 13 + 'px', top: 0, width: '26px', height: '160px' }}>
                  <FaderInput c={rc} n={ch} value={v} prefix={'Channel ' + ch + ' EQ '} />
                  <FaderTrack class="ftrack" c={rc} n={ch} value={v} geo="jp">
                    <span class="fslot" />
                    <span class="fcap" style={{ top: capTop.toFixed(1) + 'px' }} />
                  </FaderTrack>
                </label>
                <span class="silk pos" style={{ left: x + 'px', top: '166px', fontSize: '10.5px' }}>
                  {c.label.replace('Hz', '')}
                </span>
                <span
                  class="ro"
                  style={{ left: x - 12 + 'px', top: (8 + capTop - 15).toFixed(1) + 'px' }}
                  aria-hidden="true"
                >
                  {f1(v)}
                </span>
              </>
            );
          })}
        <Toggle
          x={28}
          y={40}
          options={ctl<SwitchControl>(def, 'eqOn').options}
          current={cs.eqOn !== false}
          control={ctl<SwitchControl>(def, 'eqOn')}
          n={ch}
          aria={'Channel ' + ch + ' EQ'}
          labelPos={[
            { x: 28, y: 12 },
            { x: 28, y: 68 },
          ]}
          title="EQ"
          titleY={92}
        />
        <Toggle
          x={258}
          y={40}
          options={[
            { v: 1, label: 'CH 1' },
            { v: 2, label: '2' },
            { v: 3, label: 'CH 3' },
          ]}
          current={ch}
          channel
          aria="Channel select"
          labelPos={[
            { x: 258, y: 12 },
            { x: 282, y: 40 },
            { x: 258, y: 68 },
          ]}
        />
        <Toggle
          x={258}
          y={132}
          options={ctl<SwitchControl>(def, 'shred').options}
          current={as.global.shred}
          control={ctl<SwitchControl>(def, 'shred')}
          n={ch}
          aria={'Shred' + (ch === 1 ? ' (does not apply to Ch 1)' : '')}
          labelPos={[
            { x: 258, y: 106 },
            { x: 284, y: 132 },
            { x: 258, y: 158 },
          ]}
        />
      </div>
    </>
  );
}

/** Amp head: the faceplate over a grille. */
export function Jp2cPanel({ def, as }: PanelProps) {
  return (
    <Cab>
      <div class="face" role="group" aria-label={def.brand + ' ' + def.model + ' controls'}>
        <Jp2cFace def={def} as={as} />
      </div>
      <div class="grille" aria-hidden="true" />
    </Cab>
  );
}
