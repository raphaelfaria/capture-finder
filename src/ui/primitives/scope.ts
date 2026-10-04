// The control scope: which settings the controls inside a panel read and write. The gear on the
// workbench is one scope; each pedal drawn in its chain is another (its element ids and control keys
// carry a "p0:", "p1:"… prefix, so the same panel can be drawn for both).
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Control, ControlValue, GearDef } from '../../../shared/schema';
import type { GearSettings } from '../../domain/types';

export interface ControlScope {
  /** Prefix of element ids and control keys: '' for the gear, 'p0:' for the first pedal… */
  prefix: string;
  def: GearDef;
  settings: GearSettings;
  set(c: Control, n: number | null, v: ControlValue): void;
  /** Back to the starting value (double-click). */
  reset(c: Control, n: number | null): void;
  setChannel(n: number): void;
  cycleChannel(): void;
  /** Pedals in a chain don't switch channels. */
  channelLocked: boolean;
}

export const ScopeContext = createContext<ControlScope | null>(null);

export function useScope(): ControlScope {
  const s = useContext(ScopeContext);
  if (!s) throw new Error('A panel control was rendered outside a ControlScope');
  return s;
}

/** "" for global controls, the channel number otherwise (as in element ids and data-ch). */
export const chAttr = (n: number | null | undefined): string => (n == null ? '' : String(n));
/** A control's element id: k-gain-3 (knob input), f-eq80-1 (fader input), p-bright-2 (push button)… */
export const ctlId = (scope: ControlScope, kind: string, key: string, n: number | null | undefined): string =>
  scope.prefix + kind + '-' + key + '-' + chAttr(n);
