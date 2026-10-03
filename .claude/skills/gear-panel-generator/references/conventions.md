# Repo conventions

The app is `index.html` (markup + a small loader) + `assets/app.css` + `assets/app.js`; the loader fetches `data/gear.json` and `data/captures.json`, sets `window.CF_DATA`, then loads `assets/app.js` (a classic script, so `state`, `cur()`, `pickAmp()`… are page globals for tests and debugging). It must be served over http: `npm start` locally, GitHub Pages in production. The app sets `window.CF_READY = true` after its first render.

## Data flow
`har/captures.har` → `npm run captures -- har/captures.har` → `data/captures-raw.json` (raw API records, whitelisted fields only — `FIELDS` in `tools/har-to-captures.mjs`; never edited) → `npm run build:data` (with hand-maintained `data/custom-amps.json`) → `data/gear.json`, `captures.json`, `mapping-report.json` (the first two are what the app fetches). All gear-specific parsing knowledge (`match`, control/option `aliases`, `parse`) lives in `custom-amps.json`, plus identity-only rules for generic gear in `gear-identities.json`; `tools/build-data.mjs` stays generic. Every gear entry gets a `category` (Amps, Compressors, Fuzz, Overdrive, Pedals) from its captures' device types; the picker groups by it, and non-amp generic gear renders in `.pedalcab` (no grille).

## Definition schema (custom-amps.json entry)
```
{id, brand, model, panel:'<customId>', definitionSource, fullName?, channels:null | [{n,name}],
 controls:[{key,label,aliases?,kind:'knob'|'fader'|'switch',scope:'channel'|'global',channels?,
            min,max,step, options?:[{v,label}] (top→bottom; v may be boolean/string), weight, primary?, group?, requires?}],
 panelOrder?:[keys left→right], defaults:{channel:null|n, ch:{n:{…}}, global:{…}}, defaultsNote}
```
Single channel: `channels:null`, `defaults.channel:null`, `ch:{}`, values in `defaults.global`.

## Code map (assets/app.css, assets/app.js)
- `assets/app.css`: shared `.cab .face .panel .knobbox .kwrap .ro .togbtn .tlbl .pullbtn .pdot .silk` ("amp: shared" banner); one banner-labelled block per custom panel (e.g. `.jgrille .jface … .jstate` for the JCM800); responsive tweak `@media(max-width:380px)`.
- Helpers: `knobHTML(c,n,value,prefix,extraCls,style)`, `faderInput`, `jpToggle`, `togSVG(tip(pos))`, `targetAttrs`, `chAttr`, `esc`, `jattr`, `nice`, `f1`, `getVal`, `cur()`, `ctrlByKey`.
- Ids (must be stable: `render()` restores focus by id): `k-<key>-<ch>` knob input, `f-<key>-<ch>` fader input, `t-<key>-<ch>-<i>` switch label, `p-<key>-<n>` pull, `jack-<value>`, `tab-<n>`, `reset`.
- Events (delegated, don't add listeners): `[data-act]` = `pick|cycle|channel|reset|open|close`; `data-target="ctrl"` + `data-key` + `data-ch` + `data-v=jattr(value)`; `[data-drag=knob|fader]` with `data-ctrl`/`data-ch`; hidden `input[type=range][data-ctrl]` handles arrows; `[data-switch]` select for non-pick controls. Knob drag = 14px per 10 units.
- Dispatch: `renderStage()` (the `cab` branch chain inside the `.bench` grid; header pills/tabs above it) and the amp-picker subtitle in `renderAmpPopup`. Panel notes (`defaultsNote`, drag tip, visual-reference line) render in the (i) popover (`renderInfo`), not on the stage.
- Match card/similarity: weight>0 controls only; engine special-cases only `shred` (`switchValue`).
- Copy that must stay (the visual-reference line lives in the (i) popover): "closest match", "settings similarity", "Visual reference only — nothing here controls a physical amp.".

## Capture facts (data/captures.json, field `settings.values`, `byChannel`, `notApplicable`, `uninterpretedSettings`)
Mine them per amp: `npm run capture-values -- <ampId>`.
Known: JP-2C Shred = `off`(MD) 70 / `ch23`(Shred 2+3) 32 / `ch2` 14, with `N/A` on ch1; EQ enable stated in 0 captures.

Custom panels so far: `jp2c` (jpPanelHTML), `marshall1987` (jcmPanelHTML), `triaxis` / `triaxis290` (triaxisPanelHTML, s290PanelHTML; CSS banner `Mesa/Boogie TriAxis + Simul-Class 2:Ninety`). Their parsing rules are data in `custom-amps.json`: JP-2C `match` (JP2C source / `jp2c` tag / `CA John` names) + Hz, `Pull Press`, `Shred Mode` aliases + Shred option aliases; JCM800 1987 `match`; TriAxis `parse.channelFromRows` + `ignoreWhenNA`; TriAxis + 2:90 also `parse.sections`.
