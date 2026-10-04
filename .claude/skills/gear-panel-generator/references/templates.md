# Code templates (condensed from the existing panels — copy the closest one, then trace from the photo)

Replace `<Name>`/`<name>` with the panel name (e.g. `Marshall2203` / `marshall2203`), `<id>` with the panel id used in the definition (`"panel": "<id>"`), `<P>` with a short CSS prefix.

## 1. Definition (single-channel; data/custom-amps.json)
```json
{"id":"<gearId>","brand":"…","model":"…","panel":"<id>","definitionSource":"photo + manual + capture settings","fullName":"…","channels":null,
 "match":{"source":"\\bMODEL\\b"},
 "controls":[
  {"key":"gain","label":"PRE-AMP VOLUME","aliases":["Preamp Volume","Pre-amp"],"kind":"knob","scope":"global","min":0,"max":10,"step":0.1,"weight":2,"primary":true},
  {"key":"input","label":"Input","kind":"switch","scope":"global","weight":1,"options":[{"v":"High","label":"HIGH"},{"v":"Low","label":"LOW"}]}],
 "panelOrder":["presence","bass","middle","treble","master","gain"],
 "defaults":{"channel":null,"ch":{},"global":{"gain":5,"input":"High"}},"defaultsNote":"…"}
```
Multi-channel: `channels:[{n,name,aliases}]`, `scope:'channel'` (or `scope:'global'` + `channels:[…]` per physical knob), `defaults.ch['1']={…}`; see the jp2c and ca3se entries.

## 2. Panel component (src/ui/panels/<name>/<Name>Panel.tsx)
```tsx
// <Brand Model>: what the panel shows (traced from the photo) and what is cropped away.
import type { RangeControl } from '../../../../shared/schema';
import { knobAngle } from '../../../domain/controls';
import { nice } from '../../../domain/format';
import { KnobControl, Readout } from '../../primitives/controls';
import { Cab, ctl, num, type PanelProps } from '../shared';

const POS: Record<string, [number, number]> = { gain: [42, 0], bass: [132, 0] }; // traced geometry

function Knob({ c, v }: { c: RangeControl; v: number }) {
  const [x, y] = POS[c.key]!;
  return (
    <div class="<P>k" style={{ left: x + 'px', top: y + 'px' }}>
      <span class="<P>lab">{c.label}</span>
      <KnobControl c={c} n={null} value={v} label={nice(c.label)} size={44}>
        <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
          <g transform={`rotate(${knobAngle(c, v).toFixed(1)} 22 22)`}>{/* KNOB SHAPE traced from the photo; only this group turns */}</g>
        </svg>
      </KnobControl>
      <Readout v={v} class="jro" />
    </div>
  );
}

/** Amp head: the faceplate over a short grille. */
export function <Name>Panel({ def, as }: PanelProps) {
  return (
    <Cab variant="<P>cab">
      <div class="<P>grille" aria-hidden="true" />
      <div class="<P>face" role="group" aria-label={def.brand + ' ' + def.model + ' front panel'}>
        <span class="<P>name">MODEL NAME</span>
        {def.panelOrder!.map((k) => <Knob c={ctl(def, k)} v={num(as.global[k])} />)}
      </div>
    </Cab>
  );
}
```
- Switch positions: `<PickButton c n v id class aria-pressed aria-label>` (jacks, pulls, LEDs, stepped-knob numbers); the lever of a toggle: `<Toggle x y options current control n aria labelPos title titleY>` (or `channel` for a channel selector); a lever without labels: `<CycleButton>` + `<Lever pos horizontal?>`.
- Channel selectors on the panel: `<ChannelButton n>`; next channel: `<ChannelButton cycle>`. A pedal in a chain can't switch channels (its scope locks them).
- Faders: `<FaderInput c n value prefix>` + `<FaderTrack class geo c n value>` with the slot and cap inside (geometry in `primitives/drag.ts`).
- Element ids that aren't built by a primitive: prefix them with the scope's prefix (`const scope = useScope(); id={scope.prefix + 'jack-' + o.v}`).
- Compact size in a chain (pedals): read `compact` and scale knobs and case, not text and switches (see `BbPreampPanel`, `Ts9Panel`).
- Dim controls of other channels: `available(c, as.channel)` → an `…off` class (opacity) + ", not used on channel …" in the aria-label.
- Mixed text and values: render one string (`{'CH' + n}`), not `CH{n}` — separate text nodes lose the kerning between them.

## 3. Register it (src/ui/panels/registry.tsx)
```ts
import { <Name>Panel } from './<name>/<Name>Panel';
// in PANELS:
  <id>: <Name>Panel,
```
If the panel has its own channel/mode selector, hide the header tabs for it in `StageHead.tsx` (see the triaxis/hotrod condition). A picker subtitle (gear picker, `GearPicker.tsx`) only if useful.

## 4. CSS (src/ui/panels/<name>/<name>.css, imported from src/styles/index.css before generic/generic.css)
```css
/* <Brand Model> panel. */
.<P>cab{gap:10px}
.<P>grille{height:64px;border-radius:4px;background:#0b0b0b;border:3px solid <trim>}   /* flat: no gradients */
.<P>face{position:relative;flex:none;width:<px>;height:<px>;border-radius:3px;background:<plate colour traced from the photo>;border:1px solid #000}
.<P>k{position:absolute;transform:translate(-50%,-50%)}
.<P>face .knob-in:focus-visible + .kwrap{outline-color:#111}   /* light plates */
@media (max-width:760px){.<P>face{zoom:.5}}   /* fixed-size faces scale rather than reflow */
@media (max-width:380px){.<P>face{zoom:.42}}
```
Reuse `.jro` for readouts under knobs; `.ro` for readouts beside them.
