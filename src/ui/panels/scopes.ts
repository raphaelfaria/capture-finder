// The two kinds of control scope: the gear on the workbench, and a pedal in its chain.
import type { ChainItem, Control, ControlValue, GearDef } from '../../../shared/schema';
import { defaultValue } from '../../domain/controls';
import type { GearSettings } from '../../domain/types';
import type { Store } from '../../state/store';
import type { ControlScope } from '../primitives/scope';

/** The gear on the workbench: controls write its settings. */
export function gearScope(store: Store, def: GearDef, settings: GearSettings): ControlScope {
  return {
    prefix: '',
    def,
    settings,
    set: (c, n, v) => store.setControl(c, n, v),
    reset: (c, n) => {
      const v = defaultValue(store.baseDef.peek(), c, c.scope === 'channel' ? n : null);
      if (v !== undefined) store.setControl(c, c.scope === 'channel' ? n : null, v);
    },
    setChannel: (n) => store.setChannel(n),
    cycleChannel: () => store.cycleChannel(),
    channelLocked: false,
  };
}

/** A pedal's settings as its panel reads them: its definition's starting values with the chain's
 *  values on top (on its starting channel, for pedals with channels). */
export function pedalSettings(d: GearDef, p: ChainItem): GearSettings {
  const as: GearSettings = {
    channel: d.channels ? d.defaults.channel : null,
    ch: JSON.parse(JSON.stringify(d.defaults.ch || {})),
    global: Object.assign({}, d.defaults.global, p.values),
  };
  if (d.channels) as.ch[String(as.channel)] = Object.assign({}, as.ch[String(as.channel)], p.values);
  return as;
}

/** The i-th pedal in the chain: its controls write the chain; ids and keys carry "p<i>:". */
export function pedalScope(store: Store, i: number, d: GearDef, p: ChainItem): ControlScope {
  const set = (c: Control, v: ControlValue) => store.setPedalControl(i, c.key, v);
  return {
    prefix: 'p' + i + ':',
    def: d,
    settings: pedalSettings(d, p),
    set: (c, _n, v) => set(c, v),
    reset: (c) => {
      const v = d.defaults.global[c.key];
      if (v !== undefined) set(c, v);
    },
    setChannel: () => {},
    cycleChannel: () => {},
    channelLocked: true,
  };
}
