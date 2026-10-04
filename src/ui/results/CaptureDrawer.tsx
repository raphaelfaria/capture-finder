// The capture details drawer: load or open the capture, its score, the settings it records, a control-by-
// control comparison with yours, its description and tags, and its metadata. Opening it focuses Close;
// Escape or the backdrop closes it, and focus returns to what opened it. Tab stays inside the drawer.
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Capture, GearDef } from '../../../shared/schema';
import { captureTypeLabel } from '../../domain/captures';
import { chainKey, chainName, pedalValue } from '../../domain/chains';
import { captureChannelLabel, channelLabel } from '../../domain/channels';
import { available, multiCh } from '../../domain/controls';
import { fmtVal, nice } from '../../domain/format';
import { comparisonStatus, diffKind, norm10, settingsSimilarity, tierOf } from '../../domain/similarity';
import type { GearLookup, GearSettings, ReasonKind } from '../../domain/types';
import { withWeights } from '../../domain/weights';
import { useStore } from '../context';
import { CloseIcon } from '../primitives/icons';
import { CloudLink, Mark, TypeBadge, markWord } from './parts';

/** The settings a capture records, as parsed from its description (one list per channel when it lists several). */
function RecordedSettings({ def, c }: { def: GearDef; c: Capture }) {
  const s = c.settings!,
    multiple = Object.keys(s.byChannel || {}).length > 1;
  const blocks: [number | null, Record<string, unknown>][] = multiple
    ? Object.entries(s.byChannel).map(([n, vals]) => [Number(n), vals])
    : [[s.channel, s.values]];
  return (
    <>
      {blocks.map(([n, vals]) => {
        const rows = Object.entries(vals).map(([k, v]) => {
          const x = def.controls.find((y) => y.key === k);
          return [
            x ? nice(x.label) : k,
            (x ? nice(fmtVal(x, v as never)) : String(v)) + ((s.assumed || []).includes(k) ? ' (assumed)' : ''),
          ];
        });
        (s.notApplicable || [])
          .filter((z) => !multiple || z.channel == null || z.channel === n)
          .forEach((z) => {
            const x = def.controls.find((y) => y.key === z.key);
            rows.push([x ? nice(x.label) : z.key, 'N/A']);
          });
        return (
          <>
            {multiple ? (
              <span class="mono" style={{ fontSize: '12px', color: '#c9c1b3' }}>
                {channelLabel(def, n)}
              </span>
            ) : null}
            <dl class="meta recset">
              {rows.map(([k, v]) => (
                <>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </>
              ))}
            </dl>
          </>
        );
      })}
    </>
  );
}

type Row = [string, string, string, ReasonKind, string];
/** Yours vs the capture's, control by control (and the pedals). */
function compareRows(def: GearDef, as: GearSettings, c: Capture, gear: GearLookup): Row[] {
  const s = c.settings!,
    n = as.channel,
    rows: Row[] = [];
  if (multiCh(def))
    rows.push([
      'Channel',
      channelLabel(def, n),
      captureChannelLabel(def, c),
      s.channel === n || (n != null && s.byChannel?.[n])
        ? 'match'
        : s.channel == null && !Object.keys(s.byChannel || {}).length
          ? 'none'
          : 'off',
      '',
    ]);
  def.controls
    .filter((x) => available(x, n))
    .forEach((x) => {
      const result = comparisonStatus(c, def, as, x, n),
        { uv, cv, kind } = result;
      rows.push([
        nice(x.label),
        nice(fmtVal(x, uv) || ''),
        cv != null
          ? nice(fmtVal(x, cv)) + ((s.assumed || []).includes(x.key) ? ' (assumed)' : '')
          : result.note === 'not applicable'
            ? 'N/A'
            : 'Not stated',
        kind,
        result.note ? ' · ' + result.note : '',
      ]);
    });
  // pedals: the chain itself, then (same chain) each pedal's controls
  const yc = as.chain || [],
    tc = c.chain || [];
  if (yc.length || tc.length) {
    const same = chainKey(yc) === chainKey(tc);
    rows.push([
      'Pedals',
      yc.length ? chainName(yc, gear) : 'None',
      tc.length ? chainName(tc, gear) : 'None',
      same ? 'match' : 'off',
      '',
    ]);
    if (same)
      tc.forEach((p, i) => {
        const d = p.id ? gear(p.id) : null;
        if (!d || !p.values) return;
        d.controls
          .filter((x) => !x.channels)
          .forEach((x) => {
            const cv = p.values![x.key],
              uv = pedalValue(yc, i, x.key, gear);
            const kind: ReasonKind =
              cv == null || uv == null || !x.weight
                ? 'none'
                : x.kind === 'switch'
                  ? cv === uv
                    ? 'match'
                    : 'off'
                  : diffKind(norm10(x, Math.abs((cv as number) - (uv as number))));
            rows.push([
              d.model + ' · ' + nice(x.label),
              nice(fmtVal(x, uv) || ''),
              cv != null ? nice(fmtVal(x, cv)) || '' : 'Not stated',
              kind,
              x.weight ? '' : ' · not matched',
            ]);
          });
      });
  }
  return rows;
}

const yn = (b: boolean | null) => (b == null ? 'Not stated' : b ? 'Yes' : 'No'),
  num = (x: number | null) => (x == null ? 'Not stated' : Number(x).toLocaleString('en-US'));

function Drawer({ c }: { c: Capture }) {
  const store = useStore();
  const st = store.state.value,
    gear = store.catalog.gearById;
  const base = store.catalog.pickable(c.ampId || 'unmapped'),
    def = withWeights(base, st.weights[base.id]),
    as = st.amps[base.id]!,
    n = as.channel,
    r = settingsSimilarity(c, def, as, gear),
    s = c.settings;
  const scored = r.status === 'scored',
    t = scored ? tierOf(r.score)[1] : 't3',
    cs = multiCh(def) ? channelLabel(def, n) : def.model;
  const meta: [string, string][] = [
    ['Capture ID', c.id],
    ['Product ID', c.productId],
    ['Hash', c.hash],
    ['Gear', c.ampId ? def.brand + ' ' + def.model : 'Not mapped'],
    ['Mapping source', c.mappingSource],
    ['Neural Capture type', captureTypeLabel(c)],
    ['Device type', c.deviceType],
    ['Instrument', c.instrument],
    ['Gain type', c.gainType],
    ['Author', c.author.username || 'Not stated'],
    ['Creator', c.creator.type + (c.creator.version ? ' · ' + c.creator.version : '')],
    ['Published', yn(c.published)],
    ['Likes', num(c.likes)],
    ['Stars', num(c.stars)],
    ['Downloads', num(c.downloads)],
  ];
  return (
    <div class="drawer" role="dialog" aria-modal="true" aria-label={c.name}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <span class="h-kicker">Capture details</span>
          <div class="capname">
            <h2 class="cond" style={{ margin: 0, fontSize: '28px', fontWeight: 700, lineHeight: 1.1 }}>
              {c.name}
            </h2>
            <TypeBadge c={c} />
          </div>
          <span class="mono" style={{ fontSize: '12px', color: '#c9c1b3' }}>
            {c.id}
          </span>
        </div>
        <button
          id="drawer-close"
          class="btn sm"
          data-act="close"
          aria-label="Close details"
          onClick={() => store.closeDetails()}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <div class="mbtns" style={{ margin: 0, padding: 0 }}>
        {s ? (
          <button
            id="drawer-load"
            class="btn amber"
            data-act="load"
            data-id={c.id}
            onClick={() => store.loadCapture(c.id)}
          >
            Load settings
          </button>
        ) : null}
        <CloudLink c={c} id="drawer-cloud" large />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span class="demo">CORTEX CLOUD SNAPSHOT</span>
        <span class={'tier ' + t}>
          {scored ? r.score + ' / 100 settings similarity' : 'No score · settings not interpreted'}
        </span>
      </div>
      {c.uninterpretedSettings.length ? (
        <p class="note">{'Some settings were not interpreted: ' + c.uninterpretedSettings.join('; ')}</p>
      ) : null}
      {s ? (
        <section class="stack">
          <h3 class="h-kicker">Recorded settings</h3>
          <RecordedSettings def={def} c={c} />
        </section>
      ) : null}
      <section class="stack">
        <h3 class="h-kicker">{'Compare with your ' + cs}</h3>
        {s ? (
          <>
            <table class="cmp">
              <thead>
                <tr>
                  <th scope="col">Control</th>
                  <th scope="col">Yours</th>
                  <th scope="col">Capture</th>
                  <th scope="col">
                    <span class="sr">Comparison</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows(def, as, c, gear).map(([l, y, th, k, ns]) => (
                  <tr>
                    <td>
                      {l}
                      <span style={{ color: 'var(--dim)', fontSize: '11px' }}>{ns}</span>
                    </td>
                    <td class="v">{y}</td>
                    <td class="v">{th}</td>
                    <td>
                      <Mark kind={k} />
                      <span class="sr">{markWord(k).replace(': ', '')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--dim)' }}>
              = same · ≈ close · ≠ different · – not stated in the capture
            </p>
          </>
        ) : (
          <div class="emptyst">
            <span style={{ fontSize: '13px', color: '#c9c1b3', lineHeight: 1.5 }}>
              No amp settings could be read from this description, so there is nothing to compare and no match score.
            </span>
          </div>
        )}
      </section>
      {c.description ? (
        <section class="stack">
          <h3 class="h-kicker">Description</h3>
          <p class="desc">{c.description}</p>
        </section>
      ) : null}
      {c.tags.length ? (
        <section class="stack">
          <h3 class="h-kicker">Tags</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {c.tags.map((z) => (
              <span class="chip">{z}</span>
            ))}
          </div>
        </section>
      ) : null}
      <section class="stack">
        <h3 class="h-kicker">Metadata</h3>
        <dl class="meta">
          {meta.map(([k, v]) => (
            <>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** The drawer's root, holding the drawer for the open capture (empty while none is open). */
export function CaptureDrawer() {
  const store = useStore();
  const c = store.openCapture.value;
  const opener = useRef<string | null>(null);
  const open = !!c;
  // while open: the page behind is inert and focus is on Close; on closing, focus returns to what opened it
  // (synchronously, as soon as the page is interactive again)
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement as HTMLElement | null;
    opener.current = active && active.id ? active.id : null;
    const regions = document.querySelectorAll<HTMLElement>('.topbar,#stage,.matches');
    regions.forEach((r) => (r.inert = true));
    document.getElementById('drawer-close')?.focus();
    return () => {
      regions.forEach((r) => (r.inert = false));
      const id = opener.current;
      if (id) document.getElementById(id)?.focus();
    };
  }, [open]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      store.closeDetails();
    }
    if (e.key === 'Tab') {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('.drawer button,.drawer a,.drawer select'),
      ).filter((x) => !(x as HTMLButtonElement).disabled);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (first && (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault();
        (e.shiftKey ? last! : first).focus();
      }
    }
  };
  return (
    <div id="drawer-root" onKeyDown={c ? onKey : undefined}>
      {c ? (
        <>
          <button
            class="scrim"
            aria-label="Close capture details"
            data-act="close"
            onClick={() => store.closeDetails()}
          />
          <Drawer c={c} />
        </>
      ) : null}
    </div>
  );
}
