// Who a capture is of: the described source, its brand, and the identity rules.
import { escapeRe, lines, norm, rstripChars, slug, stripChars } from '../lib/text';
import { AMP_TYPES } from './raw';
import type { Identity, Row, Rule } from './types';

export const TRADEMARK_RE = /[®™]/;

/** The described source amp/model, not the user's capture nickname. */
export function sourceAmpName(description: string): string {
  const ls = lines(description);
  for (const line of ls) {
    const m = line.match(/^\s*This is a capture of\s+(.+?)\s*$/i);
    if (m) return rstripChars(m[1]!, ' .');
  }
  // In multi-device descriptions, Cortex Cloud lists the captured amp first, then pedals/processors.
  for (const line of ls) {
    const m = line.match(/^\s*Captured Devices?:\s*(.+?)\s*$/i);
    if (m) return rstripChars(m[1]!.split(',')[0]!.trim(), ' .');
  }
  for (const line of ls) {
    const m = line.match(/^\s*AMP:\s*(.+?)\s*$/i);
    if (m && m[1]!.trim()) return rstripChars(m[1]!.trim(), ' .');
  }
  // A few user-entered full-rig captures use prose instead of the standard labels.
  for (const line of ls) {
    const m = line.match(/^\s*(?:full\s+rig|raw)\s+capture\s+(?:(?:made\s+)?from|form)\s+(.+?)\s*$/i);
    if (m) return rstripChars(m[1]!.split(/\s+(?:ch(?:annel)?\.?\s*\d+|with\b|and\b|made\s+by\b)/i)[0]!.trim(), ' .');
  }
  return '';
}

/** [normalized manufacturer, source brand prefix] when identifiable. */
export function brandInfo(sourceName: string): [string, string] {
  if (!sourceName) return ['', ''];
  // Product names ending in "by Neural DSP" name the software maker after "by".
  if (/\bby\s+Neural DSP\s*[®™]?\s*$/i.test(sourceName)) return ['Neural DSP', ''];
  // Mesa/Boogie sometimes marks the two words separately (Mesa® Boogie®).
  const mesa = sourceName.match(/^\s*mesa(?:\s*[®™]\s*|\s+)(?:\/\s*)?boogie/i);
  if (mesa) return ['Mesa/Boogie', mesa[0].replace(/[®™]/g, '').trim()];
  const mark = sourceName.search(TRADEMARK_RE);
  if (mark < 0) {
    // Unmarked "Maker’s Model" names the maker in the possessive.
    const possessive = sourceName.match(/^\s*([A-Z][\w&.\- ]*?)[’']s\s+(?=\S)/);
    return possessive ? [possessive[1]!.trim(), possessive[0].trim()] : ['', ''];
  }
  // Some stock descriptions put the amp's year before the manufacturer.
  const prefix = stripChars(sourceName.slice(0, mark), ' \t.,:;"\'“”‘’').replace(/^[’']?\d{2,4}\s+/, '');
  if (!prefix) return ['', ''];
  // The source descriptions consistently misspell Aguilar.
  const aliases: Record<string, string> = {
    aquilar: 'Aguilar',
    engl: 'ENGL',
    mesa: 'Mesa/Boogie',
    'mesa boogie': 'Mesa/Boogie',
  };
  return [aliases[prefix.toLowerCase()] || prefix, prefix];
}

/** Identity from the "match" rules of custom amps and data/gear-identities.json entries. */
function customIdentity(
  rules: Rule[],
  { source = null, row = null }: { source?: string | null; row?: Row | null },
): Identity | null {
  for (const d of rules) {
    const m = d.match || {};
    const found =
      source !== null
        ? !!m.source && new RegExp(m.source, 'i').test(source)
        : row!.tags.some((t) => (m.tags || []).some((x) => norm(x) === norm(t))) ||
          (!!m.name && new RegExp('^(?:' + m.name + ')').test(row!.name || ''));
    if (found)
      return {
        id: d.id,
        brand: d.brand!,
        model: d.model!,
        source: source !== null ? 'description' : 'capture-family/tags',
      };
  }
  return null;
}

/** Explicit identity and mapping provenance; ambiguous rows stay unmapped. */
export function ampIdentity(row: Row, rules: Rule[] = []): Identity | null {
  const description = row.description || '';
  let source = sourceAmpName(description);
  const explicit = description.match(/^Amp:[ \t]*(\S[^\n]*)$/im);
  const explicitModel = explicit ? explicit[1]!.replace(/^Mesa(?:[ /]+Boogie)?\s+/i, '') : '';
  // The stock "MixBass" rows sometimes name different amps in the source sentence and AMP
  // section. Preserve the row for review, don't choose one.
  if (explicit && source && !norm(source).includes(norm(explicitModel))) return null;
  if (!source) {
    // Without a described source, only amp captures are identified (from tags or name rules).
    if (!AMP_TYPES.has(row.type_code)) return null;
    const tags = new Set(row.tags.map(norm));
    const custom = customIdentity(rules, { row });
    if (custom) return custom;
    // Strict manufacturer + model pairs only. Do not infer from "Mesa" alone.
    if (tags.has('bogner') && (tags.has('ecstacy100b') || tags.has('ecstasy100b'))) {
      const variant = tags.has('preamp') ? ' Preamp section' : '';
      return {
        id: slug('Bogner Ecstasy 100B' + variant),
        brand: 'Bogner',
        model: 'Ecstasy 100B' + variant,
        source: 'manufacturer/model tags',
      };
    }
    if (tags.has('toneking') && tags.has('imperialmkii'))
      return {
        id: 'tone-king-imperial-mkii',
        brand: 'Tone King',
        model: 'Imperial MKII',
        source: 'manufacturer/model tags',
      };
    if ((tags.has('mesa') || tags.has('mesaboogie')) && tags.has('tremoverb'))
      return {
        id: 'mesa-boogie-trem-o-verb-dual-rectifier',
        brand: 'Mesa/Boogie',
        model: 'Trem-O-Verb Dual Rectifier',
        source: 'manufacturer/model tags',
      };
    return null;
  }
  // A distortion pedal + amplifier chain identifies the amp AFTER "with".
  const pedal = source.match(/\bpedal\s+with\s+/i);
  if (pedal) source = source.slice(pedal.index! + pedal[0].length);
  const custom = customIdentity(rules, { source });
  if (custom) return custom;
  if (/by Neural DSP/i.test(source)) {
    const model = source.replace(/\s+by Neural DSP[®™]?\s*$/i, '');
    return { id: slug('Neural DSP ' + model), brand: 'Neural DSP', model, source: 'description (software capture)' };
  }
  const [sourceBrand, prefix] = brandInfo(source);
  let brand = sourceBrand;
  let plain = rstripChars(source.replace(/[®™]/g, '').trim(), '.').replace(/^[’']?\d{2,4}\s+/, '');
  if (prefix) plain = plain.replace(new RegExp('^' + escapeRe(prefix) + '\\s*', 'i'), '');
  brand = ({ Douglas: 'Darkglass', Tech21: 'Tech 21' } as Record<string, string>)[brand] || brand;
  let suffix = '';
  if (brand === 'Hermansson') {
    brand = 'Hiwatt';
    plain = plain.replace(/^modded Hiwatt\s*/i, '');
    suffix = ' (Hermansson modified)';
  } else if (brand === 'Two Notes' && plain.startsWith('Supro')) {
    brand = 'Supro';
    plain = plain.replace(/^Supro\s*/, '');
    suffix = ' (Two Notes setup)';
  }
  // Keep separately captured preamps/power sections distinct from full heads.
  const variant = /preamp section/i.test(plain)
    ? ' Preamp section'
    : /power amp section/i.test(plain)
      ? ' Power amp section'
      : '';
  const chain = plain.match(/\bpreamp\s+with\s+(.+?)\s+power amp/i);
  if (chain) suffix += ' + ' + chain[1]!.trim();
  plain = plain.split(/\s+(?:combo\s+)?amp(?:lifier)?(?:[’']s)?\b/i)[0]!;
  plain = rstripChars(plain.split(/\s+with\b/i)[0]!, ' .');
  plain = plain.replace(/\s+(?:combo\s+)?power$/i, '').replace(/\s+pedals?$/i, '');
  const model = plain + suffix + variant;
  // Unmarked nicknames are preserved as such, without inventing a manufacturer.
  return model
    ? {
        id: slug((brand || 'unverified') + ' ' + model),
        brand: brand || 'Unverified source',
        model,
        source: 'description',
      }
    : null;
}
