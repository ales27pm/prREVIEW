import { DeviceEventEmitter, NativeEventEmitter, Platform } from 'react-native';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import RNFS from 'react-native-fs';
import WiFiSnifferModule, {
  type HandshakePacket,
  type WiFiNetwork,
} from '../types/WiFiSniffer';

type Subscription = { remove: () => void };

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

  private emitter = new NativeEventEmitter(WiFiSnifferModule as any);
  private eventSubscriptions: Subscription[] = [];

  async initialize(): Promise<void> {
    try {
      await this.requestPermissions();
    } catch (error) {
      console.error('Permission initialization failed:', error);
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

    this.eventSubscriptions.push(
      this.emitter.addListener('packetCaptured', (packetData: HandshakePacket) => {
        const sanitized = this.handlePacketCaptured(packetData);
        DeviceEventEmitter.emit('packetCaptured', sanitized);
      })
    );

    this.eventSubscriptions.push(
      this.emitter.addListener('networkStatus', (status) => {
        DeviceEventEmitter.emit('networkStatus', status);
      })
    );

    this.eventSubscriptions.push(
      this.emitter.addListener('locationPermission', (status) => {
        DeviceEventEmitter.emit('locationPermission', status);
      })
    );
  }

  private handlePacketCaptured(packetData: HandshakePacket): HandshakePacket {
    const sanitizedPacket: HandshakePacket = {
      timestamp: packetData.timestamp,
      type: packetData.type,
      bssid: packetData.bssid.toUpperCase(),
      clientMac: packetData.clientMac.toUpperCase(),
      data: packetData.data,
      message: packetData.message,
      ssid: packetData.ssid,
      channel: packetData.channel,
      signal: packetData.signal,
      security: packetData.security,
      replayCounter: packetData.replayCounter,
      reasonCode: packetData.reasonCode,
      count: packetData.count,
    };

    if (
      sanitizedPacket.ssid &&
      (!this.captureState.currentNetwork ||
        this.captureState.currentNetwork.bssid === sanitizedPacket.bssid)
    ) {
      this.captureState.currentNetwork = {
        ssid: sanitizedPacket.ssid,
        bssid: sanitizedPacket.bssid,
        channel: sanitizedPacket.channel ?? 0,
        signal: sanitizedPacket.signal ?? -127,
        security: sanitizedPacket.security ?? 'Unknown',
      };
    }

    this.captureState.capturedPackets.push(sanitizedPacket);

    if (
      sanitizedPacket.type === 'EAPOL' &&
      this.isCompleteHandshake(sanitizedPacket) &&
      !this.captureState.hasCompleteHandshake
    ) {
      this.captureState.hasCompleteHandshake = true;
      this.notifyCompleteHandshake();
    }

    return sanitizedPacket;
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
    DeviceEventEmitter.emit('handshakeComplete', {
      bssid: firstPacket?.bssid,
      clientMac: firstPacket?.clientMac,
      network: this.captureState.currentNetwork,
      packets: this.captureState.capturedPackets,
    });
  }

  async scanNetworks(): Promise<WiFiNetwork[]> {
    try {
      const networks = await WiFiSnifferModule.scanNetworks();
      return networks
        .map((network) => ({
          ...network,
          bssid: network.bssid.toUpperCase(),
          signal: Number.isFinite(network.signal) ? network.signal : -127,
        }))
        .sort((a, b) => (b.signal ?? -200) - (a.signal ?? -200));
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
    this.captureState.currentNetwork = network
      ? {
          ...network,
          bssid: network.bssid.toUpperCase(),
          signal: Number.isFinite(network.signal) ? network.signal : -127,
        }
      : undefined;

    try {
      const payload = network
        ? {
            ...network,
            bssid: network.bssid.toUpperCase(),
            signal: Number.isFinite(network.signal) ? network.signal : -127,
          }
        : null;
      await WiFiSnifferModule.startCapture(interfaceName, payload);
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
    return {
      ...this.captureState,
      currentNetwork: this.captureState.currentNetwork
        ? { ...this.captureState.currentNetwork }
        : undefined,
      capturedPackets: [...this.captureState.capturedPackets],
    };
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
      network: this.captureState.currentNetwork,
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
  }
}

export type { WiFiNetwork, HandshakePacket } from '../types/WiFiSniffer';

export default new WiFiSnifferService();
