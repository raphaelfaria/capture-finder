// Marshall JCM800 1987: non-master-volume Lead head, Volume I/II and four inputs. The input circuits
// can be blended using a patch cable; there is no channel selector. Gold knobs on printed 0–10 scales;
// the inputs are jacks you plug into; the recorded patch-cable routes are a list.
import type { SwitchControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, PickButton, Readout } from '../../primitives/controls';
import { useScope } from '../../primitives/scope';
import { Cab, ctl, num, type PanelProps } from '../shared';

const TICKS = (function () {
  let d = '';
  for (let v = 0; v <= 10; v++) {
    const a = ((-150 + v * 30) * Math.PI) / 180,
      r1 = 18,
      r2 = v % 2 ? 20 : 21.5;
    d +=
      'M' +
      (32 + r1 * Math.sin(a)).toFixed(2) +
      ' ' +
      (32 - r1 * Math.cos(a)).toFixed(2) +
      'L' +
      (32 + r2 * Math.sin(a)).toFixed(2) +
      ' ' +
      (32 - r2 * Math.cos(a)).toFixed(2);
  }
  return d;
})();
const NUMS = [0, 2, 4, 6, 8, 10].map((v) => {
  const a = ((-150 + v * 30) * Math.PI) / 180;
  return { v, left: (32 + 27 * Math.sin(a)).toFixed(1), top: (32 - 27 * Math.cos(a)).toFixed(1) };
});
const SUB: Record<string, string> = { volumeI: 'HIGH TREBLE', volumeII: 'NORMAL' };

export function Jcm800Panel({ def, as }: PanelProps) {
  const scope = useScope();
  const cs = as.global,
    input = ctl<SwitchControl>(def, 'input'),
    patch = ctl<SwitchControl>(def, 'patchcable');
  return (
    <Cab>
      <div class="jgrille" aria-hidden="true" />
      <div class="jface" role="group" aria-label="Marshall JCM800 1987 front panel">
        <div class="jbadge">
          <span style={{ fontSize: '22px', fontStyle: 'italic', lineHeight: 1 }}>JCM 800</span>
          <span style={{ fontSize: '12px', fontStyle: 'italic', letterSpacing: '.08em' }}>LEAD SERIES · 1987</span>
          <span style={{ fontSize: '9.5px', letterSpacing: '.08em', color: '#3a3226', marginTop: '3px' }}>
            50W · NON-MASTER VOLUME
          </span>
        </div>
        <div class="jknobs">
          {def.panelOrder!.map((key) => {
            const c = ctl(def, key),
              v = num(cs[key]);
            return (
              <div class="jk">
                <span class="jlab">{c.label}</span>
                <KnobControl c={c} n={null} value={v} label={nice(c.label)}>
                  <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                    <path d={TICKS} stroke="#2a2218" stroke-width="1" stroke-linecap="round" fill="none" />
                    <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 32 32)`}>
                      <circle cx="32" cy="32" r="14.5" fill="#cfae63" stroke="#6e5527" stroke-width="1.2" />
                      <circle cx="32" cy="32" r="10.5" fill="none" stroke="#b39147" stroke-width="1" />
                      <path d="M32 32 L32 19" stroke="#1a1612" stroke-width="2.2" stroke-linecap="round" />
                    </g>
                  </svg>
                  {NUMS.map((x) => (
                    <span class="jnum" style={{ left: x.left + 'px', top: x.top + 'px' }}>
                      {x.v}
                    </span>
                  ))}
                </KnobControl>
                <span class="jsub">{SUB[key] || ''}</span>
                <Readout v={v} class="jro" />
              </div>
            );
          })}
        </div>
        <div class="jjacks" role="group" aria-label="Input jack (input sensitivity)">
          {input.options.map((o) => {
            const on = cs.input === o.v;
            return (
              <PickButton
                id={scope.prefix + 'jack-' + o.v}
                class={'jjack' + (on ? ' on' : '')}
                aria-pressed={on}
                aria-label={'Plug into the ' + nice(o.label).toLowerCase() + ' input'}
                c={input}
                n={null}
                v={o.v}
              >
                <span class="jgfx" aria-hidden="true" />
                <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                  <span class="jtxt">{nice(o.label)}</span>
                  <span class="jstate">{on ? '● Plugged in' : '○ Empty'}</span>
                </span>
              </PickButton>
            );
          })}
        </div>
      </div>
      <label class="sel" style={{ marginTop: '8px' }}>
        Patch cable route (recorded configurations)
        <select
          id={scope.prefix + 'patch-route'}
          data-switch={scope.prefix + 'patchcable'}
          value={String(cs.patchcable)}
          onChange={(e) => scope.set(patch, null, (e.currentTarget as HTMLSelectElement).value)}
        >
          {patch.options.map((o) => (
            <option value={String(o.v)}>{o.label}</option>
          ))}
        </select>
      </label>
    </Cab>
  );
}
