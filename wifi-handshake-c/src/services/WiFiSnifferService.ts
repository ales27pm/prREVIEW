import { DeviceEventEmitter, Platform } from 'react-native';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import { Buffer } from 'buffer';
import PacketParserService from '@/services/PacketParserService';
import ExportService, { ExportOptions } from '@/services/ExportService';
import {
  WiFiSnifferEvents,
  isWiFiSnifferAvailable,
  type HandshakePacket,
  type InterfaceStats,
  type ParsedHandshake,
  type WiFiNetwork,
} from '@/types/WiFiSniffer';
import WiFiSnifferModule from '@/types/WiFiSniffer';
import { parseChannelFromFrequency } from '@/utils/formatters';

type Subscription = { remove: () => void };

export interface HandshakeCompletePayload {
  handshake: ParsedHandshake;
}

export interface CaptureState {
  isCapturing: boolean;
  currentNetwork: WiFiNetwork | null;
  capturedPackets: HandshakePacket[];
  hasCompleteHandshake: boolean;
  parsedHandshake: ParsedHandshake | null;
  interfaceStats: InterfaceStats | null;
  channel: number;
  captureStartedAt: number | null;
}

class WiFiSnifferService {
  private captureState: CaptureState = {
    isCapturing: false,
    currentNetwork: null,
    capturedPackets: [],
    hasCompleteHandshake: false,
    parsedHandshake: null,
    interfaceStats: null,
    channel: 1,
    captureStartedAt: null,
  };

  private eventSubscriptions: Subscription[] = [];

  private handshakeListeners = new Set<
    (payload: HandshakeCompletePayload) => void
  >();

  async initialize(): Promise<void> {
    try {
      await this.requestPermissions();
    } catch (error) {
      console.error('Permission initialization failed:', error);
    }

    if (!isWiFiSnifferAvailable) {
      console.warn(
        '[WiFiSnifferService] Native module not available; running in fallback mode.'
      );
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
      WiFiSnifferEvents.addListener(
        'packetCaptured',
        (packet: HandshakePacket) => {
          this.handlePacketCaptured(packet);
        }
      )
    );

    this.eventSubscriptions.push(
      WiFiSnifferEvents.addListener(
        'handshakeComplete',
        (handshake: ParsedHandshake) => {
          this.handleHandshakeComplete(handshake);
        }
      )
    );
  }

  private handlePacketCaptured(packetData: HandshakePacket): void {
    const packet = this.normalizePacket(packetData);

    this.captureState = {
      ...this.captureState,
      capturedPackets: [...this.captureState.capturedPackets, packet],
    };

    DeviceEventEmitter.emit('packetCaptured', packet);

    if (packet.type === 'EAPOL') {
      this.evaluateHandshakeCompletion(packet);
    }
  }

  private handleHandshakeComplete(handshake: ParsedHandshake): void {
    const enriched = this.enrichHandshake(handshake);
    this.captureState = {
      ...this.captureState,
      hasCompleteHandshake: true,
      parsedHandshake: enriched,
    };

    this.emitHandshakeComplete(enriched);
  }

  private evaluateHandshakeCompletion(latestPacket: HandshakePacket): void {
    const matchingPackets = this.captureState.capturedPackets.filter(
      (packet): packet is HandshakePacket =>
        packet.type === 'EAPOL' &&
        packet.bssid === latestPacket.bssid &&
        packet.clientMac === latestPacket.clientMac
    );

    const parsed = PacketParserService.analyzeHandshake(matchingPackets);
    if (!parsed) {
      return;
    }

    const enriched = this.enrichHandshake(parsed);
    if (
      this.captureState.hasCompleteHandshake &&
      this.captureState.parsedHandshake?.clientMac === enriched.clientMac &&
      this.captureState.parsedHandshake?.bssid === enriched.bssid
    ) {
      return;
    }

    this.captureState = {
      ...this.captureState,
      hasCompleteHandshake: true,
      parsedHandshake: enriched,
    };

    this.emitHandshakeComplete(enriched);
  }

  private emitHandshakeComplete(handshake: ParsedHandshake): void {
    const payload: HandshakeCompletePayload = { handshake };
    this.handshakeListeners.forEach((listener) => listener(payload));
    DeviceEventEmitter.emit('handshakeComplete', handshake);
  }

  private enrichHandshake(handshake: ParsedHandshake): ParsedHandshake {
    const ssid = this.captureState.currentNetwork?.ssid ?? handshake.ssid;
    const channel =
      this.captureState.currentNetwork?.channel ?? handshake.channel;
    const signal =
      this.captureState.currentNetwork?.signal ?? handshake.signal ?? -60;

    return {
      ...handshake,
      ssid,
      channel,
      signal,
    };
  }

  private normalizePacket(packetData: HandshakePacket): HandshakePacket {
    const timestamp =
      typeof packetData.timestamp === 'number'
        ? packetData.timestamp
        : Date.now() / 1000;

    const signal =
      typeof packetData.signal === 'number'
        ? packetData.signal
        : this.captureState.currentNetwork?.signal ?? -60;

    const basePacket: HandshakePacket = {
      ...packetData,
      timestamp,
      signal,
      channel: packetData.channel ?? this.captureState.channel,
      rawLength:
        packetData.rawLength ??
        (packetData.data ? Buffer.from(packetData.data, 'base64').length : 0),
      clientMac:
        packetData.clientMac ??
        (packetData.source === packetData.bssid
          ? packetData.destination
          : packetData.source),
    };

    if (packetData.type === 'EAPOL' && packetData.data) {
      const rawBuffer = Buffer.from(packetData.data, 'base64');
      const parsed = PacketParserService.parseEAPOLPacket(rawBuffer);
      if (parsed) {
        return {
          ...basePacket,
          ...parsed,
          data: packetData.data,
          timestamp,
          signal,
          channel: basePacket.channel,
          rawLength: rawBuffer.length,
        };
      }
    }

    return basePacket;
  }

  async scanNetworks(): Promise<WiFiNetwork[]> {
    try {
      const networks = await WiFiSnifferModule.scanNetworks();
      return networks.map((network) => ({
        ...network,
        channel:
          network.channel || parseChannelFromFrequency(network.frequency),
      }));
    } catch (error) {
      console.error('Network scan failed:', error);
      return [];
    }
  }

  async startCapture(
    interfaceName: string,
    network?: WiFiNetwork
  ): Promise<void> {
    if (this.captureState.isCapturing) {
      throw new Error('Capture already in progress');
    }

    const channel = network?.channel ?? this.captureState.channel ?? 1;

    this.captureState = {
      ...this.captureState,
      isCapturing: true,
      currentNetwork: network ?? null,
      capturedPackets: [],
      hasCompleteHandshake: false,
      parsedHandshake: null,
      channel,
      captureStartedAt: Date.now(),
    };

    try {
      await WiFiSnifferModule.setChannel(channel).catch(() => false);
      await WiFiSnifferModule.startCapture(interfaceName, channel);
    } catch (error) {
      this.captureState = {
        ...this.captureState,
        isCapturing: false,
        currentNetwork: null,
        captureStartedAt: null,
      };
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (!this.captureState.isCapturing) {
      return;
    }

    try {
      await WiFiSnifferModule.stopCapture();
    } finally {
      this.captureState = {
        ...this.captureState,
        isCapturing: false,
        currentNetwork: null,
        captureStartedAt: null,
      };
    }
  }

  async sendDeauth(
    bssid: string,
    clientMac: string,
    count = 10
  ): Promise<boolean> {
    try {
      return await WiFiSnifferModule.sendDeauth(bssid, clientMac, count);
    } catch (error) {
      console.error('Deauth failed:', error);
      return false;
    }
  }

  async exportHandshake(options: ExportOptions = {}): Promise<string | null> {
    const handshake =
      this.captureState.parsedHandshake ??
      PacketParserService.analyzeHandshake(
        this.captureState.capturedPackets.filter(
          (packet): packet is HandshakePacket => packet.type === 'EAPOL'
        )
      );

    if (!handshake) {
      return null;
    }

    const enriched = this.enrichHandshake(handshake);
    return ExportService.exportHandshake(enriched, options);
  }

  async getInterfaceStats(): Promise<InterfaceStats | null> {
    try {
      const stats = await WiFiSnifferModule.getInterfaceStats();
      this.captureState = {
        ...this.captureState,
        interfaceStats: stats,
      };
      return stats;
    } catch (error) {
      console.error('Failed to fetch interface stats:', error);
      return null;
    }
  }

  async setChannel(channel: number): Promise<boolean> {
    try {
      const success = await WiFiSnifferModule.setChannel(channel);
      if (success) {
        this.captureState = {
          ...this.captureState,
          channel,
        };
      }
      return success;
    } catch (error) {
      console.error('Failed to set channel:', error);
      return false;
    }
  }

  getCaptureState(): CaptureState {
    return {
      ...this.captureState,
      capturedPackets: [...this.captureState.capturedPackets],
    };
  }

  cleanup(): void {
    this.eventSubscriptions.forEach((subscription) => subscription.remove());
    this.eventSubscriptions = [];
  }

  onHandshakeComplete(
    listener: (payload: HandshakeCompletePayload) => void
  ): () => void {
    this.handshakeListeners.add(listener);
    return () => {
      this.handshakeListeners.delete(listener);
    };
  }
}

export type { WiFiNetwork, HandshakePacket } from '@/types/WiFiSniffer';

export default new WiFiSnifferService();
