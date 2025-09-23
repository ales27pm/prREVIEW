import type { TurboModule } from 'react-native';
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';

export interface DeepCaptureOptions {
  udpPort: number;
  filter?: string;
}

export interface CaptureStatistics {
  bytesCaptured: number;
  packetsProcessed: number;
  dropped: number;
}

export interface StartDeepCaptureResult {
  sessionId: string;
}

export type DeepPacketEvent = {
  id: string;
  timestamp: number;
  payload: string;
  headers: Record<string, unknown>;
  preview?: string;
};

export interface Spec extends TurboModule {
  // Legacy surface
  scan: () => Promise<Array<Record<string, unknown>>>;
  start: (interfaceName: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
  deauth: (bssid: string, channel: number) => Promise<boolean>;

  // Deep mode APIs
  startDeepCapture: (
    options: DeepCaptureOptions
  ) => Promise<StartDeepCaptureResult>;
  stopDeepCapture: (sessionId: string) => Promise<void>;
  getCaptureStats: (sessionId: string) => Promise<CaptureStatistics>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

const LINKING_ERROR =
  "The native module 'WifiCapture' is not linked. Ensure pods are installed and that the app was rebuilt.";

const nativeModule = TurboModuleRegistry.get<Spec>('WifiCapture');

const fallbackEmitter = new NativeEventEmitter();

const createFallbackModule = (): Spec => ({
  async scan() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return [];
  },
  async start() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return false;
  },
  async stop() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return false;
  },
  async deauth() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return false;
  },
  async startDeepCapture() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return { sessionId: 'fallback' };
  },
  async stopDeepCapture() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
  },
  async getCaptureStats() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return { bytesCaptured: 0, packetsProcessed: 0, dropped: 0 };
  },
  addListener(eventName: string) {
    fallbackEmitter.addListener(eventName, () => undefined);
  },
  removeListeners(count: number) {
    for (let index = 0; index < count; index += 1) {
      fallbackEmitter.removeAllListeners('onDeepPacket');
    }
  },
});

const WifiCapture: Spec = nativeModule ?? createFallbackModule();

export const WifiCaptureEvents = nativeModule
  ? new NativeEventEmitter(
      (NativeModules.WifiCapture as unknown as object | undefined) ??
        (nativeModule as unknown as object)
    )
  : fallbackEmitter;

export default WifiCapture;
