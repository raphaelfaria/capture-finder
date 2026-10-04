// Channel names and labels.
import type { Capture, GearDef } from '../../shared/schema';

export const chName = (def: GearDef, n: number | null): string =>
  (def.channels || []).find((x) => x.n === n)?.name ?? '';

/** How a channel is named in the UI: "Channel 2", "Lead channel", "LD1 Red mode", "Ch 2 Crunch". */
export function channelLabel(def: GearDef, n: number | null): string {
  const name = chName(def, n);
  return def.panel === 'generic'
    ? /^\d/.test(name)
      ? 'Channel ' + name
      : name + ' channel'
    : /^triaxis/.test(def.panel)
      ? name + ' mode'
      : 'Ch ' + n + ' ' + name;
}

/** The channel(s) a capture records, as text. */
export function captureChannelLabel(def: GearDef, cap: Capture): string {
  const s = cap.settings;
  if (!s) return 'Channel not stated';
  const recorded = Object.keys(s.byChannel || {});
  return recorded.length > 1
    ? recorded.map((n) => channelLabel(def, Number(n))).join(' + ')
    : s.channel != null
      ? channelLabel(def, s.channel)
      : 'Channel not stated';
}
