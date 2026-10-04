# Capture Finder

**Live app: https://raphaelfaria.github.io/capture-finder/**

Dial in your gear's controls — amps, pedals, compressors, fuzz, overdrive — and find Cortex Cloud captures with similar **written settings**. This is a static app, not an audio model or a physical gear controller.

**Unofficial fan project.** Not affiliated with or endorsed by Neural DSP or any gear manufacturer. Product names and trademarks belong to their owners and are used only to identify the gear captured (see [Trademarks and data](#trademarks-and-data)).

The gear picker browses by category (Amps, Compressors, Fuzz, Overdrive, Pedals) or searches everything in one list; capture search finds any capture by its name or its gear. Both keep the last search in their field (focusing a field selects it, so typing replaces it). Both searches are fuzzy: words match across punctuation ("jp2c"), as letters in order ("ecsty", or across two words: "mkiic"), in shorthand (mk = mark, Roman numerals = digits: "mk2c") or with a typo ("ecstacy", "marshal"), best matches first. Lists are sorted by maker, then name. The current gear is in the address (`?amp=<gear id>`), so links open on that gear and the browser's back and forward buttons move between the gear you picked. Every capture links to its own page on Cortex Cloud (built from its author and id, so no extra data is stored).

## Run, build and deploy

Capture Finder is a [Vite](https://vite.dev) + [Preact](https://preactjs.com) + TypeScript app. It needs no login, API key or server: the build is a static site, and the app makes no external requests (fonts use local/system fallbacks).

```sh
npm install        # once (Node 22+)
npm run dev        # http://127.0.0.1:5173 with hot reload
npm run build      # the static site in dist/
npm run preview    # serve dist/ at http://127.0.0.1:4173
```

The dev and preview servers only listen on this machine (127.0.0.1). The app fetches its data (`data/gear.json`, `data/captures.json`, from `public/data/`), so it has to be served over http; opening `dist/index.html` from disk won't load the data.

**Deploy:** every push to `main` runs the checks and publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`, with GitHub's own Pages actions; no build output is committed). Pull requests run the same checks (`.github/workflows/ci.yml`). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Custom panels: **Mesa/Boogie JP-2C, Mark IIC+, Mark III Red Stripe, TriAxis** (alone and with a **Simul-Class 2:Ninety**), **Marshall JCM800 1987**, **Bogner Ecstasy 100B** (and its preamp and power amp sections), **Fish** (alone and with a 2:Ninety) and **Überschall**, **Fender Hot Rod Deluxe** (and its power amp section), **Orange Thunderverb 50**, **PRS MT15**, **Custom Audio Amplifiers 3+SE** (alone and with a 2:90), **Aguilar Tone Hammer 500**, **Ibanez TS9**, **Origin Effects Cali76**, the **Darkglass Microtubes B7K Ultra** (Neural DSP Darkglass Ultra and Ultimate), **Xotic Effects BB Preamp**, **Boss GE-7** and **BBE Sonic Stomp**. All other gear uses the generic panel (amps with a cabinet and grille; pedals and other effects as just their control area).

## Architecture

```
shared/schema.ts      the data model (GearDef, Control, Capture…), shared by the tools and the app
tools/                the data pipeline and dev tools (TypeScript, run with tsx)
  har-to-captures/    HAR → data/captures-raw.json (whitelisted fields only)
  build-data/         raw captures + gear rules → public/data/*.json (identity, settings parsing, inference, chains, defaults)
  artboard/, verify-gear.ts, capture-values.ts   panel tooling (see Contributing)
src/
  main.tsx            fetch the data → catalog → store → render <App/>; saved state and the address follow the store
  domain/             pure logic, no DOM: matching (similarity), chains, channels, controls, weights, fuzzy search
  data/               the catalog (indexes and derived lists) and the pickers' rows
  state/              the store (one Preact Signals signal of AppState, selectors, actions), saved state, URL sync, ranking
  ui/                 components: layout, search (pickers), stage (header, bench, chain row, weights, info), results
    primitives/       knob/fader/button/lever primitives: they own every interaction and write through a ControlScope
    panels/           one folder per custom panel (component + CSS), the generic panel, the panel registry
  styles/index.css    every component's CSS, in cascade order
  testing/            the legacy bridge (test builds only)
tests/                unit/ and component/ (Vitest), e2e/ (Playwright), visual/ (pixel parity), legacy/ (the original suites)
legacy/app/           the pre-refactor app, kept as the baseline the original tests and the parity check compare against
```

Data flows one way: the catalog (immutable) → the store's state → computed selectors → components → actions. Panels are pure views of a gear's settings: they draw the gear and build every control from the primitives, which handle keys, dragging, clicks and double-click (back to the starting value) and write through a **control scope** — the gear on the bench, or one pedal in its chain.

## Data

Two steps, both TypeScript run with `tsx` (`npm install` once). The deployed app never needs Node.

```sh
npm run captures -- har/captures.har   # 1. HAR → data/captures-raw.json (whitelisted fields only)
npm run build:data                     # 2. captures-raw.json + custom-amps.json → public/data/gear.json, captures.json, mapping-report.json
npm run data                           # both, with the HAR at har/captures.har
```

1. **`tools/har-to-captures/`** joins every Cortex Cloud capture-list page (and any opened detail views) from the HAR and writes the capture list, copying **only the fields on its `FIELDS` whitelist** (`fields.ts`) (public catalogue data the app needs: id, name, description, tags, type, hash, device/instrument/gain/version, publisher username, published flag, like/star/download counts, creator device). Descriptions keep only their gear and settings lines; stock header lines such as "Quad Cortex Factory Captures" are left out. Everything else — the recording account's liked/starred/download state, author ids and avatars, dates, and any field the API adds later — is left out, and each run lists what it didn't copy. Add a field to `FIELDS` only if the app needs it and it can't identify a user. To record the HAR: sign in to Cortex Cloud, open the capture list, load every page, then in the browser's Network tools choose **Save all as HAR with content** and save it as `har/captures.har`. HAR files can contain session cookies, so `*.har` and `har/` are gitignored.
2. **`tools/build-data/`** reads `data/captures-raw.json` (never modified), `data/custom-amps.json` and `data/gear-identities.json`, identifies each capture's gear, parses the settings written in its description, and writes the files the app fetches to `public/data/`. The build is deterministic: a test checks that rebuilding from the committed sources gives exactly the committed output, so commit both together. The app's `captures.json` carries each capture's name, ids, type, description, tags and parsed settings; the details drawer shows the recorded settings, the comparison, the description and the tags.

Files in `data/` (sources) and `public/data/` (generated, fetched by the app):

- `captures-raw.json`: generated by step 1, the raw dataset (whitelisted API fields, under their API names).
- `gear-identities.json`: **hand-maintained**. Rules for generic gear (controls are still inferred from the captures): identity rules where the automatic naming gets the description wording wrong (`{id, brand, model, match}`), and `valueAliases` for values written several ways (`{id, valueAliases: {"Pre. EQ": {"Normal": "Mid", "Middle": "Mid"}}}` — the Bogner Ecstasy's channel 2/3 Pre. EQ is Dark/Mid/Bright).
- `custom-amps.json`: **hand-maintained**. Custom panel definitions (any gear, despite the name) plus any gear-specific parsing knowledge, so the build code has none:
  - `match`: how captures are identified as this amp (`source` regex on the described amp; `tags`/`name` when the description names none).
  - `aliases` on controls and on switch options: other spellings used in descriptions (e.g. `Pull Press`, `Shred 2+3`).
  - `parse`: description structure, e.g. TriAxis `channelFromRows: ["RHY","LD1","LD2"]` (the one non-N/A row is the mode), `ignoreWhenNA`, `sections` (rows after `Simul-Class 2` belong to the power amp; its `Presence` becomes `Power Presence`), `assumeWhenMissing` (JP-2C: EQ on unless stated), and `readOn` (keep reading past a device header such as the Fish + 2:Ninety captures' "Power amp: Mesa Boogie® 2:Ninety…" row, then use `sections` to rename its repeated labels).
- `public/data/gear.json`, `captures.json`, `mapping-report.json`: generated by step 2; don't edit by hand.

## Interpretation and limitations

- Explicit source descriptions identify gear of every capture type; strict manufacturer/model tags also identify amps without one. Each gear entry's category is its captures' most common Cortex device type. Ambiguous rows remain browsable under **Unmapped captures**, without a score.
- Generic panels expose observed controls, options and channel labels. Numeric ranges assume 0–10 and expand to include recorded values; the true hardware scale may differ. These are **capture-derived, not manual-verified hardware specifications**. Recorded channel count is not necessarily the amp's full channel count.
- **Pedals.** "Pedal 1: …", "Pedal 2: …" blocks after a capture's settings are read as its chain, in signal order: each pedal is identified like any gear and its knobs are read with that pedal's definition (pedals that only ever appear in chains get a generic one, marked `chainOnly` and kept out of the pickers). A block ending with "In efx loop" is in the gear's effects loop. On a gear page, **Pedals** lists the chains its captures use: picking one (starting from the most downloaded capture that uses it) draws the pedals in front to the left of the gear and the effects-loop pedals to its right, in an FX LOOP group, all on one row that scrolls sideways when it doesn't fit (starting with the gear centred), smaller than on their own page (knobs and case shrink, text and switches don't); Load sets the chain too. Above each pedal in a chain, its name links to its own page (pedals only seen in chains have none); on a pedal's page, **Used with** lists the gear it's used with and opens one with that chain. Matching: a different chain (including a pedal moved between the front and the loop), or a pedal on one side only, keeps a capture at most a partial match (×0.6); the same chain adds its pedals' knobs (the ones the capture states), which count for a quarter of the score. The starting settings include the starting capture's chain, if any.
- Only the first amplifier settings block is compared as the gear's own settings; pedals are compared as its chain (above), and the full description remains visible.
- Missing values are not filled with defaults. `N/A` is tracked separately. Unknown switch values, out-of-range custom-panel values and conflicting repeated labels are left uninterpreted for review.
- Multi-channel descriptions retain separate values for each channel. They do not overwrite one another.
- Generic gear lists its channels from clean to high gain: explicit numbers or letters first (1, 2 / A, B), otherwise by name (Clean/Normal → Rhythm/Crunch → other names → Lead/Distortion; colours such as Green → Blue → Red → Purple). Each channel's first gain/drive/volume knob is its main control.
- Generic panels keep each control on the channels it was recorded on, and a switch only offers the positions that channel uses (e.g. the Bogner Ecstasy's Pre. EQ differs per channel).
- One label can stand for several controls. On the Bogner Ecstasy, "Gain" is both a 0–10 knob and a Lo/Hi switch (and on the preamp section's channel 3 also Plexi/Lead): numbers under a label form a knob, text values that appear together in one capture become separate switches, and a label repeated in one capture with numbers or on/off values becomes numbered controls (e.g. "Volume 1"/"Volume 2", "Pull Bright 1"/"Pull Bright 2"). Each line is matched to the right one instead of being discarded as a conflict.
- JP-2C EQ: a capture that doesn't state EQ on/off is taken as **EQ on** (`parse.assumeWhenMissing` in `custom-amps.json`), so its band positions are compared. The details table marks the value as "(assumed)". A stated `EQ: Off` is respected.
- JP-2C Master retains the approved design's weight of zero. Marshall Volume I/II both contribute to similarity. JP-2C Shred keeps its three recorded states; its effect is compared on the active channel (2 and 2+3 are equivalent on channel 2). The malformed `Shred 2x` remains unknown.
- Matching weights can be edited per gear with the sliders button next to (i): the panel dims and each control shows its weight on top of it (0 = shown, not matched). While editing, "Reset weights" and "Done" take the place of Reset. Edited weights re-rank the captures right away, are saved in this browser, and "Reset weights" restores the gear's own.
- Preamps captured both on their own and through a power amp (an entry "<preamp> + <power amp>" whose captures say "… with <power amp> power amp") get a button above the weights button: a power tube on the preamp, a 12AX7 on the power amp version. With one power amp it goes straight to the other entry; with several it opens a list of the versions. The bench buttons have tooltips.
- Starting settings (what Reset and a double-click on a control restore) come from the captures, for every gear: each channel starts from its **most downloaded capture**, with anything it doesn't state taken from the next most downloaded capture of that channel; the gear opens on the channel of its most downloaded capture, and knobs shared by channels follow that channel. The (i) notes name the captures. A definition's own `defaults` are only a fallback for values no capture states.
- While a control moves, the ranking is refreshed at most every 150 ms (the final settings always land), so dragging stays smooth on gear with many captures.
- Similarity uses weighted, range-normalized numeric differences and switch equality. A four-point difference on a normalized 0–10 range contributes zero similarity. Missing weighted settings reduce the score proportionally. A known different channel halves it; an unstated channel reduces it by 20%. No comparable values means **no score**.
- Like/star/download counts are a static snapshot, not live data. No account-specific state (liked, starred, downloaded), author ids, avatars or dates are kept.

## Trademarks and data

Capture Finder is an unofficial, free fan project. It is not affiliated with, sponsored or endorsed by Neural DSP Technologies or any of the manufacturers whose gear appears in it. Neural DSP®, Neural Capture®, Quad Cortex® and the other product and company names mentioned are trademarks of their respective owners, used here only to identify the captured gear. Panels are simplified drawings for reference, with names as plain text and no logos.

The capture list is a snapshot of public Cortex Cloud catalogue data: capture names, ids, types, public counts and the settings parsed from each description. If you represent a rights holder and would like something changed or removed, please open an issue.

## Tests

```sh
npm run typecheck       # TypeScript (app, tools and tests)
npm run lint            # ESLint
npm test                # Vitest: data tools (incl. a byte-for-byte rebuild check), matching, search, store, panels, controls
npm run test:e2e        # Playwright: the main flows through the page, against the production build
npm run test:legacy:new # the original test suites (tests/legacy), unchanged, against the new app
npm run test:legacy:old # …and against the frozen pre-refactor app (legacy/app), for comparison
npm run test:visual     # every gear's panel, pixel-diffed against the pre-refactor app at desktop and phone widths
```

The browser tests use your installed Google Chrome (no browser download); set `CHROME_PATH` if it isn't in its default location. The original suites read the old app's page globals (`state`, `cur()`, `pickAmp()`…): the new app provides them through a test-only bridge (`src/testing/legacyBridge.tsx`), built with `vite build --mode legacy-test`; the deployed build doesn't include it.

## Contributing

Got a pedal, amp or other piece of gear you'd love to see with its own panel? Contributions are very welcome! 🎛️ Every gear in the app already works with a generic panel; a custom panel makes it look and feel like the real thing.

### Creating a new gear panel

The easiest way is with [Claude Code](https://claude.com/claude-code): this repo ships a skill, `gear-panel-generator` (in `.claude/skills/`), that walks through the whole process. Open the repo in Claude Code and run:

```
/gear-panel-generator <brand and model>
```

…then attach a clear, front-on photo of the gear. The skill reads the captures for that gear, traces the panel from the photo, builds it, and runs the checks. It asks you when something is ambiguous.

Prefer doing it by hand? The skill's [`SKILL.md`](.claude/skills/gear-panel-generator/SKILL.md) and its `references/` folder double as the guide. In short:

1. **Find the gear's data.** Look it up in `public/data/gear.json` (reuse its `id`) and check which settings its captures actually record with `npm run capture-values -- <gearId>`.
2. **Define it** in `data/custom-amps.json`: controls, weights, a `match` rule and any `aliases`, then run `npm run build:data`.
3. **Draw it.** Add a folder in `src/ui/panels/` with the panel component and its CSS (build the controls from `src/ui/primitives`), register it in `src/ui/panels/registry.tsx` and import its CSS in `src/styles/index.css`. Keep the gear's real shape and layout; only crop away what isn't a setting (footswitches, jacks, LEDs, empty enclosure, logos).
4. **Generate its artboard** with `npm run artboard -- <gearId> <Name>` (a standalone page drawn by the panel component itself).
5. **Check it:** `npm test`, `npm run test:e2e` and `npm run verify:gear -- <gearId>`, and make sure loading each of its captures scores 100 (or explain why one can't).

### Opening the pull request

Please send your panel as a **pull request**, one gear per PR. In the description, it really helps to include:

- **A screenshot of the new panel** in the app. This is the quickest way for us to see how it looks next to the real gear.
- The **photo** you traced it from (or a link to it).
- Anything that didn't line up: controls on the gear that no capture records, settings you weren't sure about, choices you made along the way.

Thanks for the help! 🙌
