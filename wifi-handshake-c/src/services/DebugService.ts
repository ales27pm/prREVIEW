import { Alert, Platform, Share } from 'react-native';
import RNFS from 'react-native-fs';
import WiFiSnifferService from '@/services/WiFiSnifferService';

export class DebugService {
  static async generateDebugReport(): Promise<string> {
    const state = WiFiSnifferService.getCaptureState();
    const systemInfo = await this.getSystemInfo();
    const permissions = await this.checkPermissions();
    const networkInfo = await this.getNetworkDiagnostics();

    const report = {
      app: {
        version: '1.0.0',
        build: __DEV__ ? 'debug' : 'release',
        timestamp: new Date().toISOString(),
      },
      system: systemInfo,
      permissions,
      capture: {
        isCapturing: state.isCapturing,
        packetCount: state.capturedPackets.length,
        hasCompleteHandshake: state.hasCompleteHandshake,
        currentNetwork: state.currentNetwork,
        channel: state.channel,
      },
      network: networkInfo,
      packets: state.capturedPackets.slice(0, 10).map((packet) => ({
        type: packet.type,
        bssid: packet.bssid,
        timestamp: packet.timestamp,
        message: packet.message,
        source: packet.source,
        destination: packet.destination,
      })),
      parsedHandshake: state.parsedHandshake,
    };

    const reportContent = JSON.stringify(report, null, 2);
    const filepath = `${
      RNFS.DocumentDirectoryPath
    }/debug-report-${Date.now()}.json`;

    await RNFS.writeFile(filepath, reportContent, 'utf8');
    return filepath;
  }

  static async getSystemInfo(): Promise<Record<string, unknown>> {
    const constants = Platform.constants as
      | Record<string, unknown>
      | undefined;
    const constantModel =
      typeof constants?.["Model"] === 'string'
        ? (constants?.["Model"] as string)
        : typeof constants?.["model"] === 'string'
        ? (constants?.["model"] as string)
        : undefined;
    const modelValue = constantModel ?? 'Unknown';

    return {
      platform: Platform.OS,
      osVersion: Platform.Version,
      deviceModel: modelValue,
    };
  }

  static async checkPermissions(): Promise<Record<string, unknown>> {
    try {
      const {
        check,
        PERMISSIONS,
        RESULTS,
      } = require('react-native-permissions');
      const locationStatus = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
      return {
        location: {
          status: locationStatus,
          granted: locationStatus === RESULTS.GRANTED,
        },
      };
    } catch (error) {
      return {
        location: {
          status: 'unknown',
          granted: false,
          error: (error as Error).message,
        },
      };
    }
  }

  static async getNetworkDiagnostics(): Promise<Record<string, unknown>> {
    try {
      const stats = await WiFiSnifferService.getInterfaceStats();
      return stats ?? { interface: 'unknown' };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  static async shareDebugReport() {
    try {
      const filepath = await this.generateDebugReport();
      const result = await Share.share({
        url: `file://${filepath}`,
        message: 'WiFi Handshake Capture Debug Report',
      });

      if (result.action === Share.sharedAction) {
        Alert.alert('Success', 'Debug report shared successfully');
      }
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to share debug report: ${(error as Error).message}`
      );
    }
  }

  static logPacketAnalysis(packet: any) {
    console.group?.('Packet Analysis');
    console.log('Type:', packet.type);
    console.log('BSSID:', packet.bssid);
    console.log('Source:', packet.source);
    console.log('Destination:', packet.destination);
    console.log('Timestamp:', new Date(packet.timestamp * 1000).toISOString());
    console.log('Signal:', packet.signal, 'dBm');

    if (packet.type === 'EAPOL' && packet.message) {
      console.log('Message:', packet.message);
      console.log(
        'Key Info:',
        packet.keyInfo ? `0x${packet.keyInfo.toString(16)}` : 'n/a'
      );
      console.log('Replay Counter:', packet.replayCounter?.toString('hex'));
      console.log('Nonce:', packet.keyNonce?.toString('hex')?.slice(0, 32));
    }

    console.groupEnd?.();
  }

  static validateHandshake(handshake: any) {
    const issues: string[] = [];

    if (!handshake?.packets || handshake.packets.length < 4) {
      issues.push('Insufficient packets');
    }

    const messages = (handshake?.packets ?? [])
      .map((packet: any) => packet.message)
      .filter(Boolean);

    if (new Set(messages).size !== 4) {
      issues.push('Missing handshake messages');
    }

    if (issues.length > 0) {
      console.warn('Handshake validation failed:', issues);
      return { valid: false, issues };
    }

    console.log('Handshake validation passed');
    return { valid: true, issues: [] };
  }
}

export default DebugService;
