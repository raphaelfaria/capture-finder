// Best capture matches: the gear's captures ranked by settings similarity, best first, twelve at a time.
import { captureMeta } from '../../domain/captures';
import { STRONG_MATCH_MIN, cardReasons, tierOf } from '../../domain/similarity';
import type { Ranked } from '../../state/results';
import { useRanking, useStore } from '../context';
import { LoadIcon } from '../primitives/icons';
import { CloudLink, Reasons, TypeBadge } from './parts';

function CaptureCard({ x, i }: { x: Ranked; i: number }) {
  const store = useStore();
  const def = store.baseDef.value,
    c = x.c;
  const meta = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <div class="capname">
        <h3
          class="cond"
          style={{
            margin: 0,
            fontSize: '19px',
            fontWeight: 700,
            letterSpacing: '.02em',
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
          }}
        >
          {c.name}
        </h3>
        <TypeBadge c={c} />
      </div>
      <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>{captureMeta(def, c, store.catalog.gearById)}</span>
    </div>
  );
  const details = (
    <button
      id={'open-' + c.id}
      class="btn sm"
      data-act="open"
      data-id={c.id}
      aria-label={'Details for ' + c.name}
      onClick={() => store.openDetails(c.id)}
    >
      Details
    </button>
  );
  if (x.r.status !== 'scored')
    return (
      <article class="mcard noscore" aria-label={c.name + ', no score'}>
        <div class="mtop">
          <span class="rank" aria-hidden="true">
            –
          </span>
          <span class="tier t3">No score</span>
          <span class="mscore" aria-hidden="true">
            —
          </span>
        </div>
        {meta}
        <span class="bar low" aria-hidden="true">
          <span style={{ width: 0 }} />
        </span>
        <Reasons list={[{ kind: 'none', text: 'Settings not interpreted from the description' }]} />
        <div class="mbtns">
          {details}
          <CloudLink c={c} />
        </div>
      </article>
    );
  const score = x.r.score,
    [tier, t] = tierOf(score),
    best = i === 0 && score >= STRONG_MATCH_MIN;
  return (
    <article
      class={'mcard' + (best ? ' best' : '')}
      aria-label={(best ? 'Closest match: ' : 'Rank ' + (i + 1) + ': ') + c.name + ', ' + score + ' of 100'}
    >
      <div class="mtop">
        <span class="rank">{'#' + (i + 1)}</span>
        <span class={'tier ' + (best ? 'best' : t)}>{best ? 'Closest · ' + tier.toLowerCase() : tier}</span>
        <span class="mscore">
          {score}
          <span class="sr"> / 100 settings similarity</span>
        </span>
      </div>
      {meta}
      <span class={'bar' + (t === 't3' ? ' low' : '')} aria-hidden="true">
        <span style={{ width: score + '%' }} />
      </span>
      <Reasons list={cardReasons(x.r.reasons)} />
      <div class="mbtns">
        <button
          id={'load-' + c.id}
          class="btn sm amber"
          data-act="load"
          data-id={c.id}
          aria-label={'Load settings from ' + c.name}
          onClick={() => store.loadCapture(c.id)}
        >
          <LoadIcon />
          Load settings
        </button>
        {details}
        <CloudLink c={c} />
      </div>
    </article>
  );
}

/** The matches section's count ("160 for this gear · 2190 total"). */
export function ResultsCount() {
  const store = useStore(),
    ranking = useRanking().value;
  return (
    <span id="count" class="mono" style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--dim)' }}>
      {ranking.captures.length + ' for this gear · ' + store.catalog.captures.length + ' total'}
    </span>
  );
}

export function Results() {
  const store = useStore(),
    ranking = useRanking().value,
    limit = store.state.value.limit;
  const { list, captures, best, def } = ranking;
  return (
    <div id="results" class="stack" style={{ gap: '16px' }}>
      {!captures.length ? (
        <p class="banner" role="status">
          No captures for this gear.
        </p>
      ) : !def.browseOnly && (best === null || best < STRONG_MATCH_MIN) ? (
        <p class="banner" role="status">
          {best !== null
            ? 'No close match for these settings · best is ' + best + '/100'
            : 'No close match for these settings · no readable settings to compare'}
        </p>
      ) : null}
      {list.length ? (
        <div class="cgrid">
          {list.slice(0, limit).map((x, i) => (
            <CaptureCard key={x.c.id} x={x} i={i} />
          ))}
        </div>
      ) : null}
      {list.length > limit ? (
        <button class="btn sm" style={{ alignSelf: 'flex-start' }} data-act="more" onClick={() => store.showMore()}>
          {'Show more captures (' + (list.length - limit) + ' remaining)'}
        </button>
      ) : null}
    </div>
  );
}
