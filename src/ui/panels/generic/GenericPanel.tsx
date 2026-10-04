// The generic panel: every control of gear without a custom panel, laid out by heuristics (layout.ts).
import { useContext } from 'preact/hooks';
import type { Control, GearDef, RangeControl, SwitchControl } from '../../../../shared/schema';
import { channelLabel } from '../../../domain/channels';
import { available, getValue, optionsFor } from '../../../domain/controls';
import { f1 } from '../../../domain/format';
import type { GearSettings } from '../../../domain/types';
import { ChannelButton, CycleButton, FaderTrack, NotMatched, PickButton } from '../../primitives/controls';
import { FADER_GEOMETRY } from '../../primitives/drag';
import { chAttr, useScope } from '../../primitives/scope';
import { Lever, posFor } from '../../primitives/Toggle';
import { ViewContext, WithChainContext } from '../../view';
import { Cab, FaderInput, KnobBox, num, type PanelProps } from '../shared';
import { gOrder, gPlan, gSwitchOrder, gSwitchW, layoutWidth } from './layout';

interface Section {
  n: number | null;
  title: string;
  channel?: boolean;
  head: boolean;
  knobs: RangeControl[];
  switches: SwitchControl[];
  swW: number[];
  faders: RangeControl[];
}

function sections(def: GearDef, ch: number | null): Section[] {
  const raw: { n: number | null; title: string; channel?: boolean; ctrls: Control[] }[] = [];
  if (def.channels)
    def.channels.forEach((chn) =>
      raw.push({
        n: chn.n,
        title: channelLabel(def, chn.n),
        channel: true,
        ctrls: def.controls.filter((c) => c.scope === 'channel' && available(c, chn.n)),
      }),
    );
  const g = def.controls.filter((c) => c.scope === 'global');
  if (g.length) raw.push({ n: ch, title: def.globalTitle || (def.channels ? 'Global' : 'Controls'), ctrls: g });
  return raw.map((s) => {
    const knobs = gOrder(s.ctrls.filter((c): c is RangeControl => c.kind === 'knob'));
    const switches = gSwitchOrder(
      s.ctrls.filter((c): c is SwitchControl => c.kind === 'switch'),
      knobs,
    );
    return {
      n: s.n,
      title: s.title,
      channel: s.channel,
      head: !!s.channel || raw.length > 1,
      knobs,
      switches,
      swW: switches.map((c) => gSwitchW(c, s.n)),
      faders: s.ctrls.filter((c): c is RangeControl => c.kind === 'fader'),
    };
  });
}

function GenericSwitch({ c, n, as, prefix }: { c: SwitchControl; n: number | null; as: GearSettings; prefix: string }) {
  const scope = useScope();
  const opts = optionsFor(c, n),
    v = getValue(as, c, n),
    idx = Math.max(
      0,
      opts.findIndex((o) => o.v === v),
    );
  return (
    <div class="gsw" role="group" aria-label={prefix + c.label}>
      <div class="gswbody">
        <CycleButton class="togbtn" tabIndex={-1} aria-hidden="true" c={c} n={n} current={v}>
          <Lever pos={posFor(idx, opts.length)} />
        </CycleButton>
        <div class="gopts">
          {opts.map((o, j) => (
            <PickButton
              id={scope.prefix + 't-' + c.key + '-' + chAttr(n) + '-' + j}
              class="tlbl"
              aria-pressed={o.v === v}
              aria-label={prefix + c.label + ': ' + o.label}
              c={c}
              n={n}
              v={o.v}
            >
              {o.label}
            </PickButton>
          ))}
        </div>
      </div>
      <span class="silk">
        <NotMatched c={c} />
        {c.label}
      </span>
    </div>
  );
}

function Fader({ c, n, as, prefix }: { c: RangeControl; n: number | null; as: GearSettings; prefix: string }) {
  const v = num(getValue(as, c, n)),
    capTop = FADER_GEOMETRY.gen.capTop((v - c.min) / (c.max - c.min));
  return (
    <div class="gf">
      <label style={{ display: 'block' }}>
        <FaderInput c={c} n={n} value={v} prefix={prefix} />
        <FaderTrack class="gtrack" c={c} n={n} value={v} geo="gen">
          <span class="fslot" style={{ height: '120px' }} />
          <span class="fcap" style={{ top: capTop.toFixed(1) + 'px' }} />
        </FaderTrack>
      </label>
      <span class="mono" style={{ fontSize: '10px', color: '#f0b452' }}>
        {f1(v)}
      </span>
      <span class="silk" style={{ fontSize: '10px' }}>
        {c.label.replace('Hz', '')}
      </span>
    </div>
  );
}

function GenericFace({ def, as }: { def: GearDef; as: GearSettings }) {
  const scope = useScope();
  const view = useContext(ViewContext),
    withChain = useContext(WithChainContext);
  const ch = as.channel;
  const secs = sections(def, ch);
  const plan = gPlan(
    secs,
    layoutWidth(view.measureStage?.() ?? view.stageWidth.value, view.chainWidth.value, withChain),
  );
  return (
    <div class="gwrap">
      <div class="gname">{def.model}</div>
      {/* string styles keep the exact attribute text the legacy tests look for */}
      <div class="gsecs" style={'grid-template-columns:repeat(' + plan.cols + ',minmax(0,1fr))'}>
        {secs.map((s, i) => {
          const n = s.n,
            on = !!s.channel && n === ch,
            prefix = s.channel ? s.title + ' ' : '',
            L = plan.lays[i]!;
          return (
            <div class={'gsec' + (on ? ' on' : '')} role="group" aria-label={s.title + (on ? ', selected' : '')}>
              {s.channel ? (
                <ChannelButton id={scope.prefix + 'gh-' + n} class="ghead" n={n!} aria-label={'Select ' + s.title}>
                  <span class={'led' + (on ? ' lit' : '')} aria-hidden="true" />
                  <span class="silk" style={{ fontSize: '12px', fontWeight: 700 }}>
                    {s.title}
                  </span>
                </ChannelButton>
              ) : s.head ? (
                <div class="ghead">
                  <span class="silk" style={{ fontSize: '12px', fontWeight: 700 }}>
                    {s.title}
                  </span>
                </div>
              ) : null}
              <div class={'gbody' + (L.wrapped ? ' wrapped' : '')}>
                {s.switches.length ? (
                  <div class="gswitches" style={'grid-template-rows:repeat(' + L.sw.rows + ',auto)'}>
                    {s.switches.map((c) => (
                      <GenericSwitch c={c} n={n} as={as} prefix={prefix} />
                    ))}
                  </div>
                ) : null}
                {s.knobs.length ? (
                  <div class="gknobs" style={'grid-template-rows:repeat(' + L.rows + ',auto)'}>
                    {s.knobs.map((c) => (
                      <div class="gk">
                        <KnobBox c={c} n={n} value={num(getValue(as, c, n))} prefix={prefix} />
                        <span class="silk" style={{ textAlign: 'center', whiteSpace: 'normal', lineHeight: 1.15 }}>
                          <NotMatched c={c} />
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {s.faders.length ? (
                  <div class="gfaders">
                    {s.faders.map((c) => (
                      <Fader c={c} n={n} as={as} prefix={prefix} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pedals and other effects: only the control area, no cabinet or grille; amps: the controls over a grille. */
export function GenericPanel({ def, as, compact }: PanelProps) {
  const face = (
    <div class="face" role="group" aria-label={def.brand + ' ' + def.model + ' controls'}>
      <GenericFace def={def} as={as} />
    </div>
  );
  return (def.category || 'Amps') !== 'Amps' ? (
    <Cab variant={'pedalcab' + (compact ? ' compact' : '')}>{face}</Cab>
  ) : (
    <Cab>
      {face}
      <div class="grille" aria-hidden="true" />
    </Cab>
  );
}
