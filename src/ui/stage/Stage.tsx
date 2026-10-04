// The workbench (#stage): the gear's header, the drawn gear (with its pedals) and the buttons beside it.
import { useContext, useEffect, useRef } from 'preact/hooks';
import { useStore } from '../context';
import { GearPanel } from '../panels/registry';
import { gearScope } from '../panels/scopes';
import { CabContext } from '../panels/shared';
import { ScopeContext } from '../primitives/scope';
import { ViewContext, WithChainContext } from '../view';
import { BenchActions } from './BenchActions';
import { ChainRow } from './ChainRow';
import { InfoDialog, InfoScrim } from './InfoDialog';
import { StageHead } from './StageHead';
import { WeightEditors } from './WeightEditors';

/** The gear on the bench, drawn with its own panel. */
function Gear() {
  const store = useStore();
  const def = store.def.value,
    as = store.settings.value,
    weightEdit = store.state.value.weightsOpen;
  return (
    <ScopeContext.Provider value={gearScope(store, def, as)}>
      <CabContext.Provider value={{ chainPedal: false, weightEdit }}>
        <GearPanel def={def} as={as} compact={false} />
      </CabContext.Provider>
    </ScopeContext.Provider>
  );
}

function Bench() {
  const store = useStore();
  const bench = useRef<HTMLDivElement>(null);
  const withChain = store.chain.value.length > 0,
    s = store.state.value;
  return (
    <WithChainContext.Provider value={withChain}>
      <div class={'bench' + (withChain ? ' withchain' : '')} ref={bench}>
        {withChain ? <ChainRow gear={<Gear />} /> : <Gear />}
        <BenchActions />
        {s.weightsOpen ? <WeightEditors bench={bench} /> : null}
      </div>
    </WithChainContext.Provider>
  );
}

/** Close an open header menu when clicking anywhere outside the menus. */
function useCloseMenusOutside() {
  const store = useStore();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (store.state.peek().menu && !(e.target as Element).closest?.('.hmenu')) store.closeMenu();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [store]);
}

export function Stage() {
  const store = useStore();
  useCloseMenusOutside();
  const def = store.baseDef.value,
    s = store.state.value;
  if (def.browseOnly)
    return (
      <>
        <h1 class="cond">Unmapped captures</h1>
        <p class="note">
          These records are retained for browsing, but have no verified gear mapping and receive no similarity score.
        </p>
      </>
    );
  if (!def.controls.length)
    return (
      <>
        <h1 class="cond">{def.brand + ' ' + def.model}</h1>
        <p class="note">
          This gear is identified, but its captures do not list interpretable settings. Records remain available below
          without invented settings or scores.
        </p>
      </>
    );
  return (
    <>
      <StageHead />
      {s.infoOpen ? <InfoScrim /> : null}
      <Bench />
      {s.infoOpen ? <InfoDialog /> : null}
    </>
  );
}

/** Keeps the measured stage width up to date (generic panels are laid out for it). */
export function useStageWidth(stage: { current: HTMLElement | null }) {
  const view = useContext(ViewContext);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.clientWidth;
      if (view.stageWidth.peek() === null || Math.abs(w - (view.stageWidth.peek() || 0)) > 24)
        view.stageWidth.value = w;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage, view]);
}
