// Measurements of the rendered page that layout depends on (generic panels are laid out for the room they
// have). The bench measures them; panels read them. On the server nothing is measured.
import { signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';

export interface ViewState {
  /** Width of the stage (#stage), or null before it is measured. */
  stageWidth: Signal<number | null>;
  /** Width the pedals in the chain take (front and loop groups). */
  chainWidth: Signal<number>;
}

export const createViewState = (): ViewState => ({ stageWidth: signal(null), chainWidth: signal(0) });

export const ViewContext = createContext<ViewState>(createViewState());

/** Whether the gear on the bench is drawn with pedals beside it (provided by the bench). */
export const WithChainContext = createContext(false);
