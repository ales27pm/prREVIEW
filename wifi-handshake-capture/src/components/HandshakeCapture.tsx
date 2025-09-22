import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useHandshakeCapture } from '@/hooks/useHandshakeCapture';
import type { WiFiNetwork } from '@/types/WiFiSniffer';
import { CaptureControls } from '@/components/CaptureControls';
import { CaptureStats } from '@/components/CaptureStats';
import { PacketItem } from '@/components/PacketItem';

interface HandshakeCaptureProps {
  selectedNetwork: WiFiNetwork | null;
  onBack?: () => void;
}

export const HandshakeCapture: React.FC<HandshakeCaptureProps> = ({
  selectedNetwork,
  onBack,
}) => {
  const { captureState, isBusy, startCapture, stopCapture, sendDeauth, exportHandshake } =
    useHandshakeCapture(selectedNetwork);

  const packetCount = captureState.capturedPackets.length;
  const hasSelectedNetwork = Boolean(selectedNetwork);
  const canExport = captureState.hasCompleteHandshake && packetCount > 0;

  const handleSendDeauth = () => {
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
            const success = await sendDeauth();
            if (success) {
              Alert.alert('Deauth Sent', 'Deauthentication frames sent.');
            }
          },
        },
      ]
    );
  };

  const handleExportHandshake = async () => {
    const path = await exportHandshake();
    if (path) {
      Alert.alert('Exported', `Handshake saved to: ${path}`);
    }
  };

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

      <CaptureControls
        isCapturing={captureState.isCapturing}
        isBusy={isBusy}
        hasSelectedNetwork={hasSelectedNetwork}
        canExport={canExport}
        onStartCapture={startCapture}
        onStopCapture={stopCapture}
        onSendDeauth={handleSendDeauth}
        onExportHandshake={handleExportHandshake}
      />

      <CaptureStats
        isCapturing={captureState.isCapturing}
        packetCount={packetCount}
        hasCompleteHandshake={captureState.hasCompleteHandshake}
      />

      {packetCount > 0 && (
        <View style={styles.packetsSection}>
          <Text style={styles.sectionTitle}>Captured Packets</Text>
          <ScrollView style={styles.packetsList}>
            {captureState.capturedPackets.map((packet, index) => (
              <PacketItem key={`${packet.timestamp}-${index}`} packet={packet} />
            ))}
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
});

export default HandshakeCapture;
