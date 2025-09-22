import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  DeviceEventEmitter,
} from 'react-native';
import WiFiSnifferService, {
  type CaptureState,
  type HandshakePacket,
} from '../services/WiFiSnifferService';
import type { WiFiNetwork } from '../types/WiFiSniffer';

interface HandshakeCaptureProps {
  selectedNetwork: WiFiNetwork | null;
  onBack?: () => void;
}

export const HandshakeCapture: React.FC<HandshakeCaptureProps> = ({
  selectedNetwork,
  onBack,
}) => {
  const [captureState, setCaptureState] = useState<CaptureState>(
    WiFiSnifferService.getCaptureState()
  );
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener('packetCaptured', () => {
        setCaptureState(WiFiSnifferService.getCaptureState());
      }),
      DeviceEventEmitter.addListener('handshakeComplete', () => {
        Alert.alert('Success!', 'Complete 4-way handshake captured!');
        setCaptureState(WiFiSnifferService.getCaptureState());
      }),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
    };
  }, []);

  const packetCount = captureState.capturedPackets.length;

  const disabled = useMemo(() => !selectedNetwork || isBusy, [selectedNetwork, isBusy]);

  const startCapture = async () => {
    if (!selectedNetwork) {
      Alert.alert('Error', 'Please select a network first.');
      return;
    }

    setIsBusy(true);
    try {
      await WiFiSnifferService.startCapture('en0');
      setCaptureState(WiFiSnifferService.getCaptureState());
    } catch (error) {
      console.error(error);
      Alert.alert('Capture Failed', 'Unable to start packet capture.');
    } finally {
      setIsBusy(false);
    }
  };

  const stopCapture = async () => {
    setIsBusy(true);
    try {
      await WiFiSnifferService.stopCapture();
      setCaptureState(WiFiSnifferService.getCaptureState());
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to stop capture');
    } finally {
      setIsBusy(false);
    }
  };

  const sendDeauth = async () => {
    if (!selectedNetwork) {
      return;
    }

    Alert.alert(
      'Send Deauth',
      `Send deauthentication frames to ${selectedNetwork.ssid}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setIsBusy(true);
            try {
              const success = await WiFiSnifferService.sendDeauth(
                selectedNetwork.bssid,
                'FF:FF:FF:FF:FF:FF',
                5
              );
              if (success) {
                Alert.alert('Deauth Sent', 'Deauthentication frames sent.');
              }
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to send deauth frames');
            } finally {
              setIsBusy(false);
            }
          },
        },
      ]
    );
  };

  const exportHandshake = async () => {
    setIsBusy(true);
    try {
      const path = await WiFiSnifferService.exportHandshake();
      if (path) {
        Alert.alert('Exported', `Handshake saved to: ${path}`);
      } else {
        Alert.alert('Error', 'No complete handshake to export');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Export Failed', 'Could not save handshake data');
    } finally {
      setIsBusy(false);
    }
  };

  const renderPacket = (packet: HandshakePacket, index: number) => (
    <View style={styles.packetItem} key={`${packet.timestamp}-${index}`}>
      <Text style={styles.packetHeader}>
        {packet.type} {packet.message ? `Msg ${packet.message}` : ''}
      </Text>
      <Text style={styles.packetMeta}>
        {new Date(packet.timestamp * 1000).toLocaleTimeString()}
      </Text>
      <Text style={styles.packetData}>{packet.data.substring(0, 64)}…</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Handshake Capture</Text>
        {selectedNetwork && (
          <View style={styles.networkInfo}>
            <Text style={styles.networkName}>{selectedNetwork.ssid}</Text>
            <Text style={styles.networkBssid}>{selectedNetwork.bssid}</Text>
          </View>
        )}
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isBusy && styles.disabledButton]}
          onPress={captureState.isCapturing ? stopCapture : startCapture}
          disabled={disabled}
        >
          <Text style={styles.controlButtonText}>
            {captureState.isCapturing ? 'Stop Capture' : 'Start Capture'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.secondaryButton, disabled && styles.disabledButton]}
          onPress={sendDeauth}
          disabled={disabled}
        >
          <Text style={styles.controlButtonText}>Send Deauth</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.exportButton, isBusy && styles.disabledButton]}
          onPress={exportHandshake}
          disabled={isBusy}
        >
          <Text style={styles.controlButtonText}>Export Handshake</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Status</Text>
          <Text style={styles.statValue}>
            {captureState.isCapturing ? 'Capturing' : 'Idle'}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Packets</Text>
          <Text style={styles.statValue}>{packetCount}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Complete?</Text>
          <Text style={styles.statValue}>{captureState.hasCompleteHandshake ? 'Yes' : 'No'}</Text>
        </View>
      </View>

      {packetCount > 0 && (
        <View style={styles.packetsSection}>
          <Text style={styles.sectionTitle}>Captured Packets</Text>
          <ScrollView style={styles.packetsList}>
            {captureState.capturedPackets.map(renderPacket)}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E7',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  networkInfo: {
    padding: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  networkName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  networkBssid: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  backButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 8,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  controls: {
    padding: 16,
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#FF3B30',
  },
  exportButton: {
    backgroundColor: '#34C759',
  },
  disabledButton: {
    opacity: 0.6,
  },
  controlButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E7',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  packetsSection: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  packetsList: {
    maxHeight: 320,
  },
  packetItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  packetHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  packetMeta: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  packetData: {
    fontSize: 11,
    color: '#48484A',
    fontFamily: 'Courier',
  },
});

export default HandshakeCapture;
