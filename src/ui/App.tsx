// The page: top bar with both pickers, the workbench, the matches and the details drawer. While the drawer
// is open the rest of the page is inert; while a dialog is open the page doesn't scroll.
import { useEffect, useRef } from 'preact/hooks';
import type { ReadonlySignal } from '@preact/signals';
import type { Ranking } from '../state/results';
import type { Store } from '../state/store';
import { RankingContext, StoreContext } from './context';
import { CaptureDrawer } from './results/CaptureDrawer';
import { Results, ResultsCount } from './results/Results';
import { CapturePicker } from './search/CapturePicker';
import { GearPicker } from './search/GearPicker';
import { Stage, useStageWidth } from './stage/Stage';
import { ViewContext, createViewState, type ViewState } from './view';

const Logo = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
    <circle cx="17" cy="17" r="15" fill="#1d1c1b" stroke="#5a544b" stroke-width="1.5" />
    <circle cx="17" cy="17" r="10" fill="#0b0b0a" stroke="#3a3631" />
    <path d="M17 17 L23.5 9.5" stroke="#f0b452" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="27.5" cy="6.5" r="2.2" fill="#ff5a3c" />
  </svg>
);

function Page() {
  const stage = useRef<HTMLElement>(null);
  useStageWidth(stage);
  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <Logo />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span class="cond" style={{ fontSize: '21px', fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.1 }}>
              Capture Finder
            </span>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Dial in your gear. Find your capture.</span>
          </div>
        </div>
        <div class="hsearch">
          <GearPicker />
          <CapturePicker />
        </div>
      </header>
      <section id="stage" class="stage" aria-label="Gear workbench" ref={stage}>
        <Stage />
      </section>
      <section class="matches" aria-labelledby="matches-h">
        <div class="panel-h" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <h2
            id="matches-h"
            class="cond"
            style={{ margin: 0, fontSize: '24px', fontWeight: 700, letterSpacing: '.03em' }}
          >
            Best Capture Matches
          </h2>
          <ResultsCount />
        </div>
        <Results />
      </section>
      <footer class="foot">
        Unofficial fan project. Not affiliated with or endorsed by Neural DSP or any gear manufacturer. Product names
        and trademarks belong to their owners and are used only to identify the gear captured.
      </footer>
      <CaptureDrawer />
    </div>
  );
}

/** Page-level effects of the open dialogs: inert background behind the drawer, no page scrolling. */
function useDialogEffects(store: Store) {
  const open = !!store.state.value.openId,
    info = store.state.value.infoOpen;
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.topbar,#stage,.matches').forEach((region) => {
      region.inert = open;
    });
    document.body.style.overflow = open || info ? 'hidden' : '';
  }, [open, info]);
}

export function App({
  store,
  ranking,
  view = createViewState(),
}: {
  store: Store;
  ranking: ReadonlySignal<Ranking>;
  view?: ViewState;
}) {
  useDialogEffects(store);
  return (
    <StoreContext.Provider value={store}>
      <RankingContext.Provider value={ranking}>
        <ViewContext.Provider value={view}>
          <Page />
        </ViewContext.Provider>
      </RankingContext.Provider>
    </StoreContext.Provider>
  );
}
