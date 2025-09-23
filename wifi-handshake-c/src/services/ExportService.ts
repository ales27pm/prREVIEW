import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';
import { gzip } from 'pako';
import type { ParsedHandshake } from '@/types/WiFiSniffer';
import { formatBytesAsHexDump } from '@/utils/formatters';

export interface ExportOptions {
  includeRawPackets?: boolean;
  includeAnalysis?: boolean;
  format?: 'json' | 'pcap' | 'cap';
  compress?: boolean;
}

interface ExportPacket {
  timestamp: number;
  type: string;
  bssid: string;
  source: string;
  destination: string;
  signal: number;
  message?: number;
  keyInfo?: number;
  keyNonce?: string;
  keyMIC?: string;
  rawData?: string;
  hexDump?: string;
}

interface ExportData {
  metadata: Record<string, unknown>;
  security: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  packets?: ExportPacket[];
}

export class ExportService {
  static async exportHandshake(
    handshake: ParsedHandshake,
    options: ExportOptions = {}
  ): Promise<string> {
    const {
      includeRawPackets = true,
      includeAnalysis = true,
      format = 'json',
      compress = false,
    } = options;

    const exportData = this.buildExportData(handshake, {
      includeRawPackets,
      includeAnalysis,
    });

    const timestamp = new Date(handshake.timestamp * 1000)
      .toISOString()
      .replace(/[:.]/g, '-');
    const filename = `handshake_${handshake.bssid.replace(
      /:/g,
      ''
    )}_${timestamp}`;
    const extension = format === 'json' ? 'json' : 'pcap';
    const filepath = `${RNFS.DocumentDirectoryPath}/${filename}.${extension}`;

    let content: string;
    let encoding: 'utf8' | 'base64' = 'utf8';

    switch (format) {
      case 'json':
        content = JSON.stringify(exportData, null, 2);
        break;
      case 'pcap':
      case 'cap': {
        const buffer = this.generatePcapBuffer(exportData);
        content = Buffer.from(buffer).toString('base64');
        encoding = 'base64';
        break;
      }
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    await RNFS.writeFile(filepath, content, encoding);

    if (compress) {
      const compressedPath = await this.compressFile(filepath, encoding);
      await RNFS.unlink(filepath);
      return compressedPath;
    }

    return filepath;
  }

  private static buildExportData(
    handshake: ParsedHandshake,
    options: { includeRawPackets: boolean; includeAnalysis: boolean }
  ): ExportData {
    const baseData: ExportData = {
      metadata: {
        bssid: handshake.bssid,
        clientMac: handshake.clientMac,
        apMac: handshake.apMac,
        ssid: handshake.ssid,
        capturedAt: handshake.timestamp,
        channel: handshake.channel,
        signal: handshake.signal,
        packetCount: handshake.packets.length,
      },
      security: {
        type: handshake.securityType,
        keyVersion: handshake.keyVersion,
        groupCipher: handshake.groupCipher,
        pairwiseCipher: handshake.pairwiseCipher,
        authKeyManagement: handshake.authKeyManagement,
        crackable: handshake.isCrackable,
        complexity: handshake.crackComplexity,
      },
    };

    if (options.includeAnalysis) {
      baseData.analysis = {
        handshakeQuality: this.assessHandshakeQuality(handshake),
        micVerification: this.verifyMicIntegrity(handshake),
        replayProtection: this.checkReplayCounter(handshake),
      };
    }

    if (options.includeRawPackets) {
      baseData.packets = handshake.packets.map((packet) => ({
        timestamp: packet.timestamp,
        type: packet.type,
        bssid: packet.bssid,
        source: packet.source,
        destination: packet.destination,
        signal: packet.signal,
        message: packet.message,
        keyInfo: packet.keyInfo,
        keyNonce: packet.keyNonce ? packet.keyNonce.toString('hex') : undefined,
        keyMIC: packet.keyMIC ? packet.keyMIC.toString('hex') : undefined,
        rawData: packet.data,
        hexDump: packet.keyData
          ? formatBytesAsHexDump(packet.keyData, 16)
          : undefined,
      }));
    }

    return baseData;
  }

  private static assessHandshakeQuality(handshake: ParsedHandshake): {
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 100;

    const timestamps = handshake.packets.map((packet) => packet.timestamp);
    const deltas = timestamps
      .slice(1)
      .map((timestamp, index) => timestamp - timestamps[index]);

    const maxDelta = deltas.length ? Math.max(...deltas) : 0;
    if (maxDelta > 5) {
      issues.push('Long delay between EAPOL messages');
      score -= 20;
    }

    const signals = handshake.packets.map((packet) => packet.signal);
    const signalVariance = this.calculateVariance(signals);
    if (signalVariance > 10) {
      issues.push('Signal fluctuation detected during handshake');
      score -= 15;
    }

    const replayCounters = handshake.packets
      .map((packet) => packet.replayCounter?.toString('hex'))
      .filter(Boolean) as string[];
    const uniqueCounters = new Set(replayCounters);
    if (uniqueCounters.size < replayCounters.length) {
      issues.push('Possible retransmissions detected (replay counter reuse)');
      score -= 25;
    }

    return { score: Math.max(0, score), issues };
  }

  private static calculateVariance(samples: number[]): number {
    if (!samples.length) {
      return 0;
    }

    const mean =
      samples.reduce((total, value) => total + value, 0) / samples.length;
    const variance =
      samples.reduce((total, value) => total + (value - mean) ** 2, 0) /
      samples.length;
    return Math.sqrt(variance);
  }

  private static verifyMicIntegrity(handshake: ParsedHandshake): boolean {
    return handshake.packets.every((packet) => {
      if (!packet.keyMIC) {
        return true;
      }
      return packet.keyMIC.length === 16;
    });
  }

  private static checkReplayCounter(handshake: ParsedHandshake): {
    valid: boolean;
    sequence: number[];
  } {
    const counters = handshake.packets
      .map((packet) => packet.replayCounter)
      .filter((counter): counter is Buffer => Boolean(counter))
      .map((counter) => counter.readUInt32BE(counter.length - 4));
    const isStrictlyIncreasing = counters.every(
      (counter, index) => index === 0 || counter > counters[index - 1]
    );

    return { valid: isStrictlyIncreasing, sequence: counters };
  }

  private static async compressFile(
    filepath: string,
    encoding: 'utf8' | 'base64'
  ): Promise<string> {
    const rawContent = await RNFS.readFile(filepath, encoding);
    const buffer = Buffer.from(
      rawContent,
      encoding === 'base64' ? 'base64' : 'utf8'
    );
    const compressed = gzip(buffer);
    const compressedPath = filepath.replace(/\.[^.]+$/, '.gz');
    const base64 = Buffer.from(compressed).toString('base64');
    await RNFS.writeFile(compressedPath, base64, 'base64');
    return compressedPath;
  }

  private static generatePcapBuffer(exportData: ExportData): Buffer {
    const header = Buffer.alloc(24);
    header.writeUInt32LE(0xa1b2c3d4, 0);
    header.writeUInt16LE(2, 4);
    header.writeUInt16LE(4, 6);
    header.writeInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
    header.writeUInt32LE(65535, 16);
    header.writeUInt32LE(105, 20); // 105 = LINKTYPE_IEEE802_11_RADIOTAP

    const packetBuffers: Buffer[] = [header];

    exportData.packets?.forEach((packet) => {
      if (!packet.rawData) {
        return;
      }

      const frameBuffer = Buffer.from(packet.rawData, 'base64');
      const recordHeader = Buffer.alloc(16);
      const seconds = Math.floor(packet.timestamp);
      const microseconds = Math.floor((packet.timestamp % 1) * 1_000_000);

      recordHeader.writeUInt32LE(seconds, 0);
      recordHeader.writeUInt32LE(microseconds, 4);
      recordHeader.writeUInt32LE(frameBuffer.length, 8);
      recordHeader.writeUInt32LE(frameBuffer.length, 12);

      packetBuffers.push(recordHeader, frameBuffer);
    });

    return Buffer.concat(packetBuffers);
  }
}

export default ExportService;
