# Repo conventions

The app is a Vite + Preact + TypeScript app (`index.html` → `src/main.tsx`). `src/main.tsx` fetches `data/gear.json` and `data/captures.json` (served from `public/data/`), builds the catalog and the store, and renders `<App/>`. `npm run dev` serves it locally; GitHub Actions builds `dist/` and deploys it to GitHub Pages.

## Data flow
`har/captures.har` → `npm run captures -- har/captures.har` → `data/captures-raw.json` (raw API records, whitelisted fields only — `FIELDS` in `tools/har-to-captures/fields.ts`; never edited) → `npm run build:data` (with hand-maintained `data/custom-amps.json` and `data/gear-identities.json`) → `public/data/gear.json`, `captures.json`, `mapping-report.json` (the first two are what the app fetches). The build is deterministic: a golden test checks a rebuild matches the committed output, so commit sources and output together. All gear-specific parsing knowledge (`match`, control/option `aliases`, `parse`) lives in `custom-amps.json`, plus identity-only rules for generic gear in `gear-identities.json`; `tools/build-data/` stays generic. Every gear entry gets a `category` (Amps, Compressors, Fuzz, Overdrive, Pedals) from its captures' device types; the picker groups by it, and non-amp generic gear renders in `.pedalcab` (no grille).

## Definition schema (custom-amps.json entry)
Typed in `shared/schema.ts` (`GearDef`, `Control`, …), shared by the tools and the app.
```
{id, brand, model, panel:'<customId>', definitionSource, fullName?, channels:null | [{n,name,aliases?}],
 controls:[{key,label,aliases?,kind:'knob'|'fader'|'switch',scope:'channel'|'global',channels?,
            min,max,step, options?:[{v,label,aliases?}] (top→bottom; v may be boolean/string/number), weight, primary?, group?, requires?}],
 panelOrder?:[keys left→right], defaults:{channel:null|n, ch:{n:{…}}, global:{…}}, defaultsNote, match?, parse?, valueAliases?}
```
Single channel: `channels:null`, `defaults.channel:null`, `ch:{}`, values in `defaults.global`.

## Code map
- `src/domain/`: pure logic, no DOM — matching (`similarity.ts`), chains, channels, controls, weights, fuzzy search, catalog derivations.
- `src/data/`: the catalog (indexes and derived lists) and the picker rows.
- `src/state/`: the store (`store.ts`: one signal of `AppState`, selectors, actions), saved state, URL sync, throttled ranking.
- `src/ui/primitives/`: the panel control primitives — `KnobControl` (range input + drag surface), `RangeInput`, `FaderTrack`, `PickButton`, `CycleButton`, `ChannelButton`, `Readout`, `NotMatched`, `Toggle`/`Lever` (lever switches), icons. They own every interaction (keys, drag, click, double-click back to the starting value) and write through the `ControlScope` context (`scope.ts`): the gear on the bench, or a pedal in its chain.
- `src/ui/panels/`: one folder per custom panel (`<Name>Panel.tsx` + its CSS), `shared.tsx` (`Cab`, `KnobBox`/`KnobSVG`, `FaderInput`, `Rack`, `Simul290`, `ctl`/`maybeCtl`/`num`), `generic/` (generic panel + layout heuristics), `registry.tsx` (panel id → component) and `scopes.ts`.
- `src/ui/stage/`, `results/`, `search/`: the stage header, chain row, bench buttons, weights editor and (i) dialog; result cards and the details drawer; the pickers.
- `src/styles/index.css` imports every CSS file in cascade order; add a panel's CSS there (before `generic/generic.css`).
- Panels are pure views: props `{def, as, compact}` (`as` = the settings), no event handlers of their own, no store access. Notes for the user (`defaultsNote`, drag tip, visual-reference line) render in the (i) dialog, never on the panel.
- Ids (stable: tests, tools and focus rely on them; the primitives build them from the scope's prefix): `k-<key>-<ch>` knob input, `f-<key>-<ch>` fader input, `t-<key>-<ch>-<i>` switch position label, `p-<key>-<n>` push/pull button, `jack-<value>`, `tab-<n>`, `reset`. `<ch>` is empty for global controls. A pedal in a chain gets the prefix `p0:`, `p1:`… on its ids and data-keys.
- Marker attributes (set by the primitives; the weights editor places itself with them, tests and `verify:gear` use them): `data-ctrl`/`data-key` + `data-ch` on control elements, `data-act="pick|cycle|channel"`, `data-drag="knob|fader"`, `data-switch` on a select.
- Matching: weight > 0 controls only; the engine special-cases only `shred` (`switchValue`).
- Copy that must stay (the visual-reference line lives in the (i) dialog): "closest match", "settings similarity", "Visual reference only — nothing here controls a physical amp.".

## Capture facts (public/data/captures.json: `settings.values`, `byChannel`, `notApplicable`, `uninterpretedSettings`)
Mine them per gear: `npm run capture-values -- <gearId>`.
Known: JP-2C Shred = `off`(MD) 70 / `ch23`(Shred 2+3) 32 / `ch2` 14, with `N/A` on ch1; EQ enable stated in 0 captures.
