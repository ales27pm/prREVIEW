import { NativeEventEmitter, NativeModules } from 'react-native';

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
}

export interface Spec {
  scanNetworks(): Promise<WiFiNetwork[]>;
  startCapture(interfaceName: string): Promise<string>;
  stopCapture(): Promise<string>;
  sendDeauth(bssid: string, clientMac: string, count: number): Promise<boolean>;
}

const LINKING_ERROR =
  "The native module 'WiFiSniffer' is not linked. Ensure you have run pod install (iOS) or rebuilt the app after installing the module.";

const nativeModule = (NativeModules.WiFiSniffer as Spec | undefined) ?? null;

if (!nativeModule) {
  console.warn(`[WiFiSniffer] ${LINKING_ERROR}`);
}

const missingModuleError = () =>
  new Error('WiFiSniffer native module is not available on this platform.');

const createFallbackModule = (): Spec => ({
  async scanNetworks() {
    console.warn('[WiFiSniffer] Returning empty network list because the native module is unavailable.');
    return [];
  },
  async startCapture() {
    throw missingModuleError();
  },
  async stopCapture() {
    throw missingModuleError();
  },
  async sendDeauth() {
    console.warn('[WiFiSniffer] Cannot send deauth packets because the native module is unavailable.');
    return false;
  },
});

export const WiFiSnifferEvents = new NativeEventEmitter(nativeModule ?? undefined);

export const isWiFiSnifferAvailable = Boolean(nativeModule);

const WiFiSniffer: Spec = nativeModule ?? createFallbackModule();

export default WiFiSniffer;
