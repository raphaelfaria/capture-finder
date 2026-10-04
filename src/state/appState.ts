// The app's state: what is dialled in on every gear (kept between visits), and the UI around it.
import type { GearSettings, WeightOverrides } from '../domain/types';

/** A header menu: the gear's pedal chains, the gear a pedal is used with, a preamp's versions. */
export type MenuKind = 'chain' | 'usedin' | 'variant';

export interface PickerState {
  query: string;
  open: boolean;
  /** The highlighted row. */
  active: number;
  /** The browsed level (see data/pickers). */
  path: string[];
}

export interface LoadedFrom {
  amp: string;
  name: string;
}

export interface AppState {
  /** The gear on the workbench. */
  amp: string;
  /** Every gear's settings (channel, values, pedal chain). */
  amps: Record<string, GearSettings>;
  /** Edited matching weights per gear. */
  weights: Record<string, WeightOverrides>;
  /** The capture the current settings were loaded from, until they change. */
  loaded: LoadedFrom | null;
  gearPicker: PickerState;
  capturePicker: PickerState;
  /** The capture whose details drawer is open. */
  openId: string | null;
  infoOpen: boolean;
  weightsOpen: boolean;
  menu: MenuKind | null;
  menuActive: number;
  /** How many result cards are shown. */
  limit: number;
}

export const PAGE = 12;
export const closedPicker = (): PickerState => ({ query: '', open: false, active: 0, path: [] });
