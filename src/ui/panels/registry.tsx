// Which component draws which gear: definitions name their panel (data/custom-amps.json "panel");
// everything else gets the generic panel. Adding a custom panel = a folder here + one line below.
import type { ComponentType } from 'preact';
import { B7kUltraPanel } from './b7kultra/B7kUltraPanel';
import { BbPreampPanel } from './bbpreamp/BbPreampPanel';
import { Ca3sePanel } from './ca3se/Ca3sePanel';
import { Cali76Panel } from './cali76/Cali76Panel';
import { EcstasyPanel } from './ecstasy/EcstasyPanel';
import { FishPanel } from './fish/FishPanel';
import { Ge7Panel } from './ge7/Ge7Panel';
import { GenericPanel } from './generic/GenericPanel';
import { HotRodPanel } from './hotrod/HotRodPanel';
import { Jcm800Panel } from './jcm800/Jcm800Panel';
import { Jp2cPanel } from './jp2c/Jp2cPanel';
import { MarkPanel } from './mark/MarkPanel';
import { Mt15Panel } from './mt15/Mt15Panel';
import type { PanelProps } from './shared';
import { SonicStompPanel } from './sonicstomp/SonicStompPanel';
import { ThunderverbPanel } from './thunderverb/ThunderverbPanel';
import { ToneHammerPanel } from './tonehammer/ToneHammerPanel';
import { TriaxisPanel } from './triaxis/TriaxisPanel';
import { Ts9Panel } from './ts9/Ts9Panel';
import { UberschallPanel } from './uberschall/UberschallPanel';

export const PANELS: Record<string, ComponentType<PanelProps>> = {
  jp2c: Jp2cPanel,
  marshall1987: Jcm800Panel,
  triaxis: TriaxisPanel,
  triaxis290: TriaxisPanel,
  tonehammer: ToneHammerPanel,
  ts9: Ts9Panel,
  cali76: Cali76Panel,
  b7kultra: B7kUltraPanel,
  ecstasy: EcstasyPanel,
  markiic: MarkPanel,
  markiii: MarkPanel,
  hotrod: HotRodPanel,
  fish: FishPanel,
  fish290: FishPanel,
  uberschall: UberschallPanel,
  bbpreamp: BbPreampPanel,
  ge7: Ge7Panel,
  sonicstomp: SonicStompPanel,
  mt15: Mt15Panel,
  thunderverb: ThunderverbPanel,
  ca3se: Ca3sePanel,
  ca3se290: Ca3sePanel,
};

/** The drawn gear for a definition and its settings (custom panel, or the generic one). */
export function GearPanel(props: PanelProps) {
  const Panel = PANELS[props.def.panel] || GenericPanel;
  return <Panel {...props} />;
}
