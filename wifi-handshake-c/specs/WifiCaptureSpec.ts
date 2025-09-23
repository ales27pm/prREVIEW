import type { TurboModule } from 'react-native';
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import type {
  DeepCaptureOptions,
  PacketData,
  WiFiCaptureNativeModule,
} from '@/types/WiFiSniffer';

export type DeepPacketEvent = PacketData;

export type Spec = TurboModule & WiFiCaptureNativeModule;

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
  async startDeepCapture(_options: DeepCaptureOptions) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return { sessionId: 'fallback' };
  },
  async stopDeepCapture(_sessionId: string) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
  },
  async getCaptureStats(_sessionId: string) {
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

export type {
  CaptureStatistics,
  DeepCaptureOptions,
  StartDeepCaptureResult,
} from '@/types/WiFiSniffer';

export default WifiCapture;
