import type { EmitterSubscription, TurboModule } from 'react-native';
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
  WiFiNetwork,
  TetheredCaptureResult,
} from '../src/types/WiFiSniffer';

export type DeepPacketEvent = PacketData;

export type Spec = TurboModule & WiFiCaptureNativeModule;

const LINKING_ERROR =
  "The native module 'WifiCapture' is not linked. Ensure pods are installed and that the app was rebuilt.";

const nativeModule = TurboModuleRegistry.get<Spec>('WifiCapture');

const fallbackEmitter = new NativeEventEmitter();
const fallbackSubscriptions: EmitterSubscription[] = [];

const trackFallbackSubscription = (subscription: EmitterSubscription) => {
  fallbackSubscriptions.push(subscription);
};

const removeFallbackListeners = (count: number) => {
  if (count <= 0) {
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const subscription = fallbackSubscriptions.pop();
    if (!subscription) {
      break;
    }
    subscription.remove();
  }
};

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
  async setAdvancedScanMode(enabled: boolean) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    if (!enabled) {
      return;
    }
  },
  async getCachedScanResults() {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return [] as WiFiNetwork[];
  },
  async importTetheredCapture(_path: string, _options?: DeepCaptureOptions) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return { packets: 0, duration: 0 } as TetheredCaptureResult;
  },
  async startTetheredCapture(_deviceIdentifier: string) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
    return { interface: '' };
  },
  async stopTetheredCapture(_deviceIdentifier?: string) {
    if (Platform.OS === 'ios') {
      console.warn(`[WifiCapture] ${LINKING_ERROR}`);
    }
  },
  addListener(eventName: string) {
    const subscription = fallbackEmitter.addListener(
      eventName,
      () => undefined
    );
    trackFallbackSubscription(subscription);
  },
  removeListeners(count: number) {
    removeFallbackListeners(count);
  },
});

const WifiCapture: Spec = nativeModule ?? createFallbackModule();

const nativeBridgeModule =
  typeof NativeModules !== 'undefined' && NativeModules != null
    ? ((NativeModules as Record<string, unknown>).WifiCapture as
        | object
        | undefined)
    : undefined;

export const WifiCaptureEvents = nativeModule
  ? new NativeEventEmitter(
      nativeBridgeModule ?? (nativeModule as unknown as object)
    )
  : fallbackEmitter;

export type {
  CaptureStatistics,
  DeepCaptureOptions,
  StartDeepCaptureResult,
  WiFiNetwork,
  TetheredCaptureResult,
} from '../src/types/WiFiSniffer';

export default WifiCapture;
