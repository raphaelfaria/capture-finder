// An artboard: one gear's panel on its own page, drawn by the app's own panel component and fully
// interactive (knobs, keys, switches, channels), with no matching. The definition comes from the page's
// #panel-data JSON block (tools/artboard writes it).
import { signal } from '@preact/signals';
import { render } from 'preact';
import type { Control, ControlValue, GearDef } from '../../shared/schema';
import { defaultValue, getValue, initialSettings } from '../domain/controls';
import type { GearSettings } from '../domain/types';
import '../styles/index.css';
import { GearPanel } from '../ui/panels/registry';
import { CabContext } from '../ui/panels/shared';
import { ScopeContext, type ControlScope } from '../ui/primitives/scope';

const def = JSON.parse(document.getElementById('panel-data')!.textContent!) as GearDef;
const settings = signal<GearSettings>(initialSettings(def));

function set(c: Control, n: number | null, v: ControlValue) {
  const as = settings.value;
  if (c.scope === 'channel') {
    if (n != null) settings.value = { ...as, channel: n, ch: { ...as.ch, [n]: { ...as.ch[n], [c.key]: v } } };
  } else settings.value = { ...as, global: { ...as.global, [c.key]: v } };
}
const setChannel = (n: number) => (settings.value = { ...settings.value, channel: n });

function Board() {
  const as = settings.value;
  const scope: ControlScope = {
    prefix: '',
    def,
    settings: as,
    current: (c, n) => getValue(settings.peek(), c, n),
    set,
    reset: (c, n) => {
      const v = defaultValue(def, c, c.scope === 'channel' ? n : null);
      if (v !== undefined) set(c, n, v);
    },
    setChannel,
    cycleChannel: () => {
      const ns = (def.channels || []).map((c) => c.n);
      if (ns.length) setChannel(ns[(ns.indexOf(as.channel as number) + 1) % ns.length]!);
    },
    channelLocked: false,
  };
  return (
    <ScopeContext.Provider value={scope}>
      <CabContext.Provider value={{ chainPedal: false, weightEdit: false }}>
        <GearPanel def={def} as={as} compact={false} />
      </CabContext.Provider>
    </ScopeContext.Provider>
  );
}

render(<Board />, document.getElementById('panel')!);
