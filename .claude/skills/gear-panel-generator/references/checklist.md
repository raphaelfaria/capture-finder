# One-page checklist
Inputs: [ ] photo clear & front-on (else ask) [ ] exact variant + look-alikes [ ] control list/ranges
Trace:  [ ] left→right control table [ ] knob style/scale [ ] jacks/switch side [ ] colours [ ] conflicts logged (photo/manual/list/captures)
Data:   [ ] capture values mined (options, N/A, spellings) [ ] one `primary` per channel [ ] every weight deliberate [ ] aliases complete [ ] defaults + defaultsNote [ ] only matching controls shown
Build:  [ ] custom-amps.json entry [ ] match/aliases/parse rules in the data, not in code [ ] npm run build:data (no hand-edit of generated JSON; commit public/data too) [ ] panel folder (component + CSS) [ ] registered in registry.tsx [ ] CSS imported in src/styles/index.css [ ] npm run artboard + screenshot reviewed [ ] reference panels untouched
Style:  [ ] flat, no gradients [ ] knob shape/pointer/readout [ ] levers via Lever/Toggle [ ] pull ring+dot [ ] cabinet fit-content, grille 60–70 [ ] text-only model name
A11y:   [ ] buttons+aria (primitives) [ ] aria-valuetext [ ] focus rings (light panel recoloured) [ ] targets ≥40px
Verify: [ ] tests/component (every gear draws; every matched control settable) [ ] unit test for the gear's parsing/scoring (tests/unit/matching.test.ts) [ ] custom-panel count in tests/unit/matching.test.ts and tests/legacy/test_app.cjs [ ] npm run verify:gear -- <id> [ ] npm test [ ] npm run test:e2e [ ] npm run test:legacy:new [ ] 390px no h-scroll [ ] ?amp=<id> [ ] JP-2C + JCM1987 still render
Report: [ ] traced [ ] conflicts [ ] open questions [ ] changed files
