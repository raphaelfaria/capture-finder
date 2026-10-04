// The (i) dialog: what is matched on the selected channel (and what is shown only), where the starting
// settings come from, and how to use the panel. Opening it focuses Close; Escape or the backdrop closes it
// and focus returns to the (i) button.
import { useLayoutEffect } from 'preact/hooks';
import { channelLabel } from '../../domain/channels';
import { available, getValue, multiCh } from '../../domain/controls';
import { f1, fmtVal, nice } from '../../domain/format';
import { useStore } from '../context';
import { CloseIcon } from '../primitives/icons';

const Rows = ({ list }: { list: [string, string][] }) => (
  <dl class="mrows">
    {list.map(([k, v]) => (
      <div class="mrow">
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
);

function InfoContent() {
  const store = useStore();
  const def = store.def.value,
    as = store.settings.value,
    ch = as.channel;
  const avail = def.controls.filter((c) => available(c, ch));
  const rows: [string, string][] = [];
  if (multiCh(def)) rows.push(['Channel', channelLabel(def, ch)]);
  avail
    .filter((c) => c.weight > 0 && c.group !== 'eq')
    .forEach((c) => rows.push([nice(c.label), nice(fmtVal(c, getValue(as, c, ch)) || '')]));
  const eqC = avail.filter((c) => c.group === 'eq');
  if (eqC.length) {
    const req = eqC[0]!.requires ? def.controls.find((x) => x.key === eqC[0]!.requires) : undefined;
    const off = !!req && getValue(as, req, ch) === false;
    rows.push([
      'EQ ' + eqC.map((c) => c.label.replace('Hz', '')).join('/'),
      off ? 'EQ off · not compared' : eqC.map((c) => f1(getValue(as, c, ch) as number)).join(' · '),
    ]);
  }
  const nm = avail
    .filter((c) => c.weight === 0)
    .map((c): [string, string] => [nice(c.label), fmtVal(c, getValue(as, c, ch)) as string]);
  // where the starting settings come from: each channel's most downloaded capture (set by the build)
  const from = (def.defaultsFrom || []).map(
    (x) =>
      (x.channel !== null && multiCh(def) ? channelLabel(def, x.channel) + ': ' : '') +
      x.name +
      (x.downloads != null ? ' (' + x.downloads.toLocaleString('en-US') + ' downloads)' : ''),
  );
  return (
    <>
      <div class="panel-h">
        <h2 id="info-h" class="cond" style={{ margin: 0, fontSize: '20px', fontWeight: 700, letterSpacing: '.03em' }}>
          {'Matching on ' + (multiCh(def) ? channelLabel(def, ch) : def.model)}
        </h2>
        <button
          id="info-close"
          class="btn sm"
          data-act="info-close"
          aria-label="Close matching details"
          onClick={() => store.closeInfo()}
        >
          <CloseIcon />
        </button>
      </div>
      <Rows list={rows} />
      {nm.length ? (
        <>
          <h3 class="h-kicker" style={{ margin: 0 }}>
            <span class="nsmark" aria-hidden="true">
              ⊘
            </span>
            Not matched
          </h3>
          <Rows list={nm} />
        </>
      ) : null}
      <ul class="infonotes">
        {from.length ? (
          <li>
            {'Starting settings (Reset, double-click): the most downloaded capture' +
              (from.length > 1 ? ' of each channel' : '') +
              ", with anything it doesn't state from the next most downloaded: " +
              from.join(' · ') +
              '.'}
          </li>
        ) : null}
        {def.defaultsNote ? <li>{def.defaultsNote}</li> : null}
        <li>
          Drag knobs and sliders up/down, or Tab to one and use the arrow keys. Click a switch's position labels to set
          it. Double-click a control to return it to its starting value.
        </li>
        <li>Visual reference only — nothing here controls a physical amp.</li>
      </ul>
    </>
  );
}

/** The dialog and its dimmed backdrop (rendered while open). */
export function InfoDialog() {
  const store = useStore();
  useLayoutEffect(() => {
    document.getElementById('info-close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !store.state.peek().openId) {
        e.preventDefault();
        store.closeInfo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // back to the (i) button, unless focus moved somewhere else on purpose
      const a = document.activeElement;
      if (!a || a === document.body || a.closest('#info-pop')) document.getElementById('info-btn')?.focus();
    };
  }, [store]);
  return (
    <div id="info-pop" class="infopop" role="dialog" aria-modal="true" aria-labelledby="info-h">
      <InfoContent />
    </div>
  );
}

/** The backdrop behind the dialog (closes it). */
export const InfoScrim = () => {
  const store = useStore();
  return (
    <button
      class="infoscrim"
      tabIndex={-1}
      aria-hidden="true"
      data-act="info-close"
      onClick={() => store.closeInfo()}
    />
  );
};
