# Code templates (condensed from jcmPanelHTML / jpPanelHTML — copy, then trace from the photo)

Replace `<id>` with the panel id (e.g. `marshall2203`), `<P>` with a short CSS prefix.

## 1. Definition (single-channel; data/custom-amps.json)
```json
{"id":"<ampId>","brand":"…","model":"…","panel":"<id>","definitionSource":"photo + manual + capture settings","fullName":"…","channels":null,
 "controls":[
  {"key":"gain","label":"PRE-AMP VOLUME","aliases":["Preamp Volume","Pre-amp"],"kind":"knob","scope":"global","min":0,"max":10,"step":0.5,"weight":2,"primary":true},
  {"key":"input","label":"Input","kind":"switch","scope":"global","weight":1,"options":[{"v":"High","label":"HIGH"},{"v":"Low","label":"LOW"}]}],
 "panelOrder":["presence","bass","middle","treble","master","gain"],
 "defaults":{"channel":null,"ch":{},"global":{"gain":5,"input":"High"}},"defaultsNote":"…"}
```
Multi-channel: `channels:[{n,name}]`, `scope:'channel'`, `defaults.ch['1']={…}`, see jp2c entry.

## 2. renderStage branch (assets/app.js, `function renderStage`)
`renderStage` builds the amp header (title, Single channel / Loaded-from pills, channel tabs, Reset), then a `cab` string per panel, then wraps it in the `.bench` grid with the (i) info button. Add one branch to the `cab` chain; never add explanation text to the stage (notes go in `renderInfo`, via `defaultsNote`).
```js
  if (def.panel === '<id>') {
    cab = '<div class="cab"><div class="<P>grille" aria-hidden="true"></div>' + <id>PanelHTML(def, as) + '</div>';
  } else if (/^triaxis/.test(def.panel)) { … }   // keep existing branches untouched
// amp picker subtitle (renderAmpPopup): a.panel === '<id>' ? '<short descriptor> · ' : …
// if the panel has its own channel/mode selector, hide the header tabs for it (see the triaxis condition)
```

## 3. Renderer skeleton (single channel; globals live in `as.global`)
```js
function <id>PanelHTML(def, as){
  const cs = as.global;
  let h = '<div class="<P>face" role="group" aria-label="BRAND MODEL front panel">'
    + '<div class="<P>badge">MODEL NAME (plain text, no logo)</div><div class="<P>knobs">';
  def.panelOrder.forEach(key => {
    const c = def.controls.find(x => x.key === key), v = cs[key];
    const angle = (-150 + (v - c.min)/(c.max - c.min)*300).toFixed(1);
    h += '<div class="<P>k"><span class="<P>lab">'+esc(c.label)+'</span>'
      + '<label class="kctl"><input id="k-'+c.key+'-" class="sr knob-in" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"'
      + ' aria-label="'+esc(nice(c.label))+'" aria-valuetext="'+f1(v)+' of '+c.max+'" data-ctrl="'+c.key+'" data-ch="">'
      + '<span class="kwrap" data-drag="knob" data-ctrl="'+c.key+'" data-ch="">'
      + '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">'/* ticks (JCM_TICKS) */+'<g transform="rotate('+angle+' 32 32)">'/* KNOB SHAPE traced from photo: cap fill/stroke, flute path, pointer line */+'</g></svg>'
      + /* printed numbers (JCM_NUMS) */''+'</span></label><span class="jro" aria-hidden="true">'+f1(v)+'</span></div>';
  });
  h += '</div>';
  // input jacks (sensitivity): selectable buttons, plugged-in state in text + graphic
  h += '<div class="jjacks" role="group" aria-label="Input jack (input sensitivity)">';
  def.controls.find(x => x.key === 'input').options.forEach(o => {
    const on = cs.input === o.v;
    h += '<button id="jack-'+o.v+'" class="jjack'+(on ? ' on' : '')+'" aria-pressed="'+on+'" aria-label="'+esc('Plug into the '+nice(o.label).toLowerCase()+' input')+'"'
      + ' data-act="pick" data-target="ctrl" data-key="input" data-ch="" data-v="'+jattr(o.v)+'"><span class="jgfx" aria-hidden="true"></span>'
      + '<span style="display:flex;flex-direction:column;gap:2px;text-align:left"><span class="jtxt">'+esc(nice(o.label))+'</span><span class="jstate">'+(on ? '● Plugged in' : '○ Empty')+'</span></span></button>';
  });
  return h + '</div></div>';
}
```
Jack ids: if two amps could share `jack-<value>` ids, namespace them (`jack-<id>-<value>`) only for the new panel; never rename the JCM1987 ones.
Position the jacks on the side the photo shows (DOM order left/right in the `face` flex row).

## 4. Pull knob / switch / fader / absolute layout (copy from jpPanelHTML, l.505–545)
- Pull: `<button id="p-<key>-<n>" class="pullbtn pos" aria-pressed data-act="pick" data-target="ctrl" data-key data-ch data-v="jattr(!on)"><span class="pdot"></span><span class="silk">PULL …</span></button>` and pass `' pulled'` as `extraCls` to `knobHTML`.
- Lever switch: `jpToggle(x,y,options,current,{key,ch},aria,labelPos,title,titleY)` inside a `position:relative` fixed-size `.panel`.
- Fader: `faderInput` + `.ftrack[data-drag=fader][data-geo=jp|gen]` (`FG` geometry), `.ro` above cap.
- `knobHTML(c,n,value,prefix,extraCls,style)` is reusable for any knob (56px) when the panel doesn't need a custom cap — pass `style='position:absolute;left:..;top:..'`.

## 5. CSS block (flat; mirror `.j*` rules l.111–131)
```css
/* ---------- <Brand Model> panel ---------- */
.<P>grille{height:64px;border-radius:4px;background:#0b0b0b;border:3px solid <trim>}   /* flat: no gradients */
.<P>face{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 22px;padding:6px 18px;border-radius:3px;background:<plate colour traced from photo>;border:1px solid #000;min-width:0}
.<P>face .knob-in:focus-visible + .kwrap{outline-color:#111}   /* light plates */
```
Reuse `.jk/.jlab/.jro/.jnum/.jjack/.jgfx/.jtxt/.jstate` only if the colours suit; otherwise define prefixed copies. Add a `@media(max-width:380px)` tweak if the face overflows at 390px.
