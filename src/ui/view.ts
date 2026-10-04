// Measurements of the rendered page that layout depends on (generic panels are laid out for the room they
// have). The bench measures them; panels read them. On the server nothing is measured.
import { signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';

export interface ViewState {
  /** Width of the stage (#stage), or null before it is measured; changes re-lay out generic panels. */
  stageWidth: Signal<number | null>;
  /** The stage's width right now (read at render time, so a layout never lags a resize); absent when
   *  there is no page to measure (server rendering). */
  measureStage?: () => number | null;
  /** Width the pedals in the chain take (front and loop groups). */
  chainWidth: Signal<number>;
}

export const createViewState = (measureStage?: () => number | null): ViewState => ({
  stageWidth: signal(null),
  chainWidth: signal(0),
  measureStage,
});

export const ViewContext = createContext<ViewState>(createViewState());

/** Whether the gear on the bench is drawn with pedals beside it (provided by the bench). */
export const WithChainContext = createContext(false);
