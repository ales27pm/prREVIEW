import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

export interface WiFiNetwork {
  bssid: string;
  ssid: string;
  signal: number;
  channel: number;
  security: string;
}

export type PacketType = 'EAPOL' | 'DEAUTH' | 'BEACON';

export interface HandshakePacket {
  timestamp: number;
  type: PacketType;
  bssid: string;
  clientMac: string;
  data: string;
  message?: 1 | 2 | 3 | 4;
  ssid?: string;
  channel?: number;
  signal?: number;
  security?: string;
  replayCounter?: number;
  reasonCode?: number;
  count?: number;
}

export interface Spec extends TurboModule {
  scanNetworks(): Promise<WiFiNetwork[]>;
  startCapture(interfaceName: string, network: WiFiNetwork | null): Promise<string>;
  stopCapture(): Promise<string>;
  sendDeauth(bssid: string, clientMac: string, count: number): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('WiFiSniffer');
