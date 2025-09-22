import { NativeEventEmitter, Platform } from 'react-native';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import RNFS from 'react-native-fs';
import WiFiSnifferModule, {
  WiFiSnifferEvents,
  isWiFiSnifferAvailable,
  type HandshakePacket,
  type WiFiNetwork,
} from '@/types/WiFiSniffer';

type Subscription = { remove: () => void };

export interface HandshakeCompletePayload {
  bssid?: string;
  clientMac?: string;
  packets: HandshakePacket[];
}

export interface CaptureState {
  isCapturing: boolean;
  currentNetwork?: WiFiNetwork;
  capturedPackets: HandshakePacket[];
  hasCompleteHandshake: boolean;
}

class WiFiSnifferService {
  private captureState: CaptureState = {
    isCapturing: false,
    capturedPackets: [],
    hasCompleteHandshake: false,
  };

  private emitter: NativeEventEmitter | null = null;
  private eventSubscriptions: Subscription[] = [];
  private handshakeListeners = new Set<(payload: HandshakeCompletePayload) => void>();

  async initialize(): Promise<void> {
    try {
      await this.requestPermissions();
    } catch (error) {
      console.error('Permission initialization failed:', error);
    }

    if (!isWiFiSnifferAvailable) {
      console.warn('[WiFiSnifferService] Native module not available; running in fallback mode.');
    }

    this.setupEventListeners();
  }

  private async requestPermissions(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    if (result !== RESULTS.GRANTED) {
      throw new Error('Location permission denied');
    }
  }

  private setupEventListeners(): void {
    this.cleanup();

    this.emitter = WiFiSnifferEvents;

    this.eventSubscriptions.push(
      this.emitter.addListener('packetCaptured', (packetData: HandshakePacket) => {
        this.handlePacketCaptured(packetData);
      })
    );
  }

  private handlePacketCaptured(packetData: HandshakePacket): void {
    this.captureState.capturedPackets.push(packetData);

    if (
      packetData.type === 'EAPOL' &&
      this.isCompleteHandshake(packetData) &&
      !this.captureState.hasCompleteHandshake
    ) {
      this.captureState.hasCompleteHandshake = true;
      this.notifyCompleteHandshake();
    }
  }

  private isCompleteHandshake(packet: HandshakePacket): boolean {
    const eapolMessages = this.captureState.capturedPackets
      .filter(
        (p) =>
          p.type === 'EAPOL' &&
          p.bssid === packet.bssid &&
          p.clientMac === packet.clientMac &&
          p.message !== undefined
      )
      .map((p) => p.message as number);

    const uniqueMessages = new Set(eapolMessages);
    return uniqueMessages.size === 4 && [1, 2, 3, 4].every((msg) => uniqueMessages.has(msg));
  }

  private notifyCompleteHandshake(): void {
    const [firstPacket] = this.captureState.capturedPackets;
    const payload: HandshakeCompletePayload = {
      bssid: firstPacket?.bssid,
      clientMac: firstPacket?.clientMac,
      packets: this.captureState.capturedPackets,
    };

    this.handshakeListeners.forEach((listener) => listener(payload));
    this.emitter?.emit('handshakeComplete', payload);
  }

  async scanNetworks(): Promise<WiFiNetwork[]> {
    try {
      return await WiFiSnifferModule.scanNetworks();
    } catch (error) {
      console.error('Network scan failed:', error);
      return [];
    }
  }

  async startCapture(interfaceName: string, network?: WiFiNetwork): Promise<void> {
    if (this.captureState.isCapturing) {
      throw new Error('Capture already in progress');
    }

    this.captureState.isCapturing = true;
    this.captureState.currentNetwork = network;

    try {
      await WiFiSnifferModule.startCapture(interfaceName);
      this.captureState.capturedPackets = [];
      this.captureState.hasCompleteHandshake = false;
    } catch (error) {
      this.captureState.isCapturing = false;
      this.captureState.currentNetwork = undefined;
      console.error('Failed to start capture:', error);
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (!this.captureState.isCapturing) {
      return;
    }

    try {
      await WiFiSnifferModule.stopCapture();
      this.captureState.isCapturing = false;
      this.captureState.currentNetwork = undefined;
    } catch (error) {
      console.error('Failed to stop capture:', error);
      throw error;
    }
  }

  async sendDeauth(bssid: string, clientMac: string, count = 10): Promise<boolean> {
    try {
      return await WiFiSnifferModule.sendDeauth(bssid, clientMac, count);
    } catch (error) {
      console.error('Deauth failed:', error);
      return false;
    }
  }

  getCaptureState(): CaptureState {
    return { ...this.captureState, capturedPackets: [...this.captureState.capturedPackets] };
  }

  async exportHandshake(): Promise<string | null> {
    if (!this.captureState.hasCompleteHandshake || this.captureState.capturedPackets.length === 0) {
      return null;
    }

    const [firstPacket] = this.captureState.capturedPackets;
    const handshakeData = {
      bssid: firstPacket?.bssid,
      clientMac: firstPacket?.clientMac,
      packets: this.captureState.capturedPackets,
      timestamp: new Date().toISOString(),
    };

    try {
      const filePath = `${RNFS.DocumentDirectoryPath}/handshake_${Date.now()}.json`;
      await RNFS.writeFile(filePath, JSON.stringify(handshakeData, null, 2), 'utf8');
      return filePath;
    } catch (error) {
      console.error('Export failed:', error);
      return null;
    }
  }

  cleanup(): void {
    this.eventSubscriptions.forEach((subscription) => subscription.remove());
    this.eventSubscriptions = [];
    this.emitter = null;
  }

  onHandshakeComplete(listener: (payload: HandshakeCompletePayload) => void): () => void {
    this.handshakeListeners.add(listener);
    return () => {
      this.handshakeListeners.delete(listener);
    };
  }
}

export type { WiFiNetwork, HandshakePacket } from '@/types/WiFiSniffer';

export default new WiFiSnifferService();
