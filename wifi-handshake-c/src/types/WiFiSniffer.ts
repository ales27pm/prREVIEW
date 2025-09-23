import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { Buffer } from 'buffer';

export interface WiFiNetwork {
  bssid: string;
  ssid: string;
  signal: number;
  channel: number;
  security: 'Open' | 'WEP' | 'WPA' | 'WPA2' | 'WPA3' | 'Unknown';
  frequency: number;
  capabilities: string;
}

export type PacketType =
  | 'BEACON'
  | 'PROBE_REQ'
  | 'PROBE_RESP'
  | 'ASSOC_REQ'
  | 'ASSOC_RESP'
  | 'AUTH'
  | 'DEAUTH'
  | 'DISASSOC'
  | 'EAPOL'
  | 'DATA'
  | 'MANAGEMENT';

export interface BasePacket {
  timestamp: number;
  type: PacketType;
  bssid: string;
  source: string;
  destination: string;
  rawLength: number;
  signal: number;
  channel?: number;
  frequency?: number;
  data?: string;
  clientMac?: string;
  ssid?: string;
  security?: string;
  reasonCode?: number;
  count?: number;
}

export interface HandshakePacket extends BasePacket {
  type: 'EAPOL';
  subtype?: 'Key' | 'Pairwise' | 'Group' | 'RSN';
  keyInfo?: number;
  keyLength?: number;
  replayCounter?: Buffer;
  keyNonce?: Buffer;
  keyIV?: Buffer;
  keyRSC?: Buffer;
  keyID?: Buffer;
  keyMIC?: Buffer;
  keyData?: Buffer;
  message?: 1 | 2 | 3 | 4;
  isComplete?: boolean;
  eapolVersion?: number;
  eapolType?: number;
  completeHandshake?: boolean;
}

export interface ParsedHandshake {
  bssid: string;
  clientMac: string;
  timestamp: number;
  packets: HandshakePacket[];
  isComplete: boolean;
  apMac: string;
  ssid: string;
  securityType: string;
  channel: number;
  signal: number;
  keyVersion: number;
  groupCipher: string;
  pairwiseCipher: string;
  authKeyManagement: string[];
  isCrackable: boolean;
  crackComplexity: 'Easy' | 'Medium' | 'Hard' | 'Impossible';
}

export interface InterfaceStats {
  interfaceName: string;
  channel: number;
  frequency: number;
  capturedPackets: number;
  droppedPackets: number;
  lastUpdated: number;
  [key: string]: unknown;
}

export interface Spec extends TurboModule {
  scanNetworks(): Promise<WiFiNetwork[]>;
  startCapture(interfaceName: string, channel: number): Promise<boolean>;
  stopCapture(): Promise<boolean>;
  sendDeauth(bssid: string, clientMac: string, count: number): Promise<boolean>;
  getInterfaceStats(): Promise<InterfaceStats | null>;
  setChannel(channel: number): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const nativeModule = TurboModuleRegistry.get<Spec>('WiFiSniffer');

const LINKING_ERROR =
  "The native module 'WiFiSniffer' is not linked. Ensure pods are installed and the app has been rebuilt.";

if (!nativeModule) {
  console.warn(`[WiFiSniffer] ${LINKING_ERROR}`);
}

const createFallbackModule = (): Spec => ({
  async scanNetworks() {
    console.warn(
      '[WiFiSniffer] Returning empty network list (fallback module).'
    );
    return [];
  },
  async startCapture() {
    console.warn('[WiFiSniffer] startCapture called on fallback module.');
    return false;
  },
  async stopCapture() {
    console.warn('[WiFiSniffer] stopCapture called on fallback module.');
    return true;
  },
  async sendDeauth() {
    console.warn('[WiFiSniffer] sendDeauth called on fallback module.');
    return false;
  },
  async getInterfaceStats() {
    return null;
  },
  async setChannel() {
    console.warn('[WiFiSniffer] setChannel called on fallback module.');
    return false;
  },
  addListener() {
    /* no-op */
  },
  removeListeners() {
    /* no-op */
  },
});

const WiFiSniffer: Spec = nativeModule ?? createFallbackModule();

export const WiFiSnifferEvents = new NativeEventEmitter(
  NativeModules.WiFiSniffer ?? (nativeModule as unknown as object | undefined)
);

export const isWiFiSnifferAvailable = Boolean(nativeModule);

export default WiFiSniffer;

export type { HandshakePacket as WiFiHandshakePacket };
