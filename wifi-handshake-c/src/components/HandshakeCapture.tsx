import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { CaptureControls } from '@/components/CaptureControls';
import { CaptureStats } from '@/components/CaptureStats';
import PacketList from '@/components/PacketList';
import PacketDetail from '@/components/PacketDetail';
import HandshakeVisualization from '@/components/HandshakeVisualization';
import WiFiSnifferService, {
  type CaptureState,
} from '@/services/WiFiSnifferService';
import type {
  HandshakePacket,
  ParsedHandshake,
  WiFiNetwork,
} from '@/types/WiFiSniffer';

interface HandshakeCaptureProps {
  selectedNetwork: WiFiNetwork | null;
  onBack: () => void;
}

export const HandshakeCapture: React.FC<HandshakeCaptureProps> = ({
  selectedNetwork,
  onBack,
}) => {
  const [captureState, setCaptureState] = useState<CaptureState>(
    WiFiSnifferService.getCaptureState()
  );
  const [isBusy, setIsBusy] = useState(false);
  const [selectedPacket, setSelectedPacket] = useState<
    HandshakePacket | undefined
  >(undefined);
  const [showPacketDetail, setShowPacketDetail] = useState(false);
  const [parsedHandshake, setParsedHandshake] =
    useState<ParsedHandshake | null>(
      WiFiSnifferService.getCaptureState().parsedHandshake
    );
  const [handshakeAlerted, setHandshakeAlerted] = useState(false);
  const [deauthCount, setDeauthCount] = useState('10');
  const [clientMac, setClientMac] = useState('FF:FF:FF:FF:FF:FF');

  useEffect(() => {
    const packetSubscription = DeviceEventEmitter.addListener(
      'packetCaptured',
      () => {
        setCaptureState(WiFiSnifferService.getCaptureState());
      }
    );

    const handshakeSubscription = DeviceEventEmitter.addListener(
      'handshakeComplete',
      (handshake: ParsedHandshake) => {
        setParsedHandshake(handshake);
        setCaptureState(WiFiSnifferService.getCaptureState());
      }
    );

    const networkSubscription = DeviceEventEmitter.addListener(
      'networkStatus',
      () => {
        setCaptureState(WiFiSnifferService.getCaptureState());
      }
    );

    const interval = setInterval(() => {
      setCaptureState(WiFiSnifferService.getCaptureState());
      setParsedHandshake(WiFiSnifferService.getCaptureState().parsedHandshake);
    }, 2000);

    return () => {
      packetSubscription.remove();
      handshakeSubscription.remove();
      networkSubscription.remove();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (parsedHandshake && !handshakeAlerted) {
      Alert.alert(
        'Complete Handshake Captured',
        `${parsedHandshake.securityType} handshake from ${parsedHandshake.ssid}`
      );
      setHandshakeAlerted(true);
    }
  }, [parsedHandshake, handshakeAlerted]);

  const packetCount = captureState.capturedPackets.length;
  const hasSelectedNetwork = Boolean(selectedNetwork);
  const canExport = captureState.hasCompleteHandshake && packetCount > 0;

  const handleStartCapture = useCallback(async () => {
    if (!selectedNetwork) {
      Alert.alert(
        'Select Network',
        'Please choose a network before capturing packets.'
      );
      return;
    }

    setIsBusy(true);
    try {
      await WiFiSnifferService.startCapture('en0', selectedNetwork);
      setCaptureState(WiFiSnifferService.getCaptureState());
      setParsedHandshake(null);
      setHandshakeAlerted(false);
    } catch (error) {
      Alert.alert('Capture Failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }, [selectedNetwork]);

  const handleStopCapture = useCallback(async () => {
    setIsBusy(true);
    try {
      await WiFiSnifferService.stopCapture();
      setCaptureState(WiFiSnifferService.getCaptureState());
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleSendDeauth = useCallback(async () => {
    if (!selectedNetwork) {
      Alert.alert('Select Network', 'Choose a network before sending frames.');
      return;
    }

    const normalizedCount = Number.parseInt(deauthCount, 10);
    if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
      Alert.alert('Invalid Count', 'Enter a positive number of frames.');
      return;
    }

    const normalizedMac = clientMac.trim().toUpperCase();
    const macPattern = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
    if (!macPattern.test(normalizedMac)) {
      Alert.alert(
        'Invalid MAC',
        'Enter a client MAC in the format AA:BB:CC:DD:EE:FF.'
      );
      return;
    }

    setIsBusy(true);
    try {
      const success = await WiFiSnifferService.sendDeauth(
        selectedNetwork.bssid,
        normalizedMac,
        normalizedCount
      );
      if (success) {
        Alert.alert(
          'Deauthentication Sent',
          `Transmitted ${normalizedCount} frame${
            normalizedCount > 1 ? 's' : ''
          } to ${normalizedMac}`
        );
      } else {
        Alert.alert('Transmission Failed', 'Unable to transmit frames.');
      }
    } catch (error) {
      Alert.alert('Deauth Failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }, [clientMac, deauthCount, selectedNetwork]);

  const handleExportHandshake = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = await WiFiSnifferService.exportHandshake({
        includeAnalysis: true,
      });
      if (path) {
        Alert.alert(
          'Exported',
          `Handshake saved to Documents\n${path.split('/').pop()}`
        );
      } else {
        Alert.alert(
          'No Handshake',
          'Capture a complete handshake before exporting.'
        );
      }
    } catch (error) {
      Alert.alert('Export Failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handlePacketSelect = useCallback((packet: HandshakePacket) => {
    setSelectedPacket(packet);
    setShowPacketDetail(true);
  }, []);

  const headerNetwork = useMemo(
    () => selectedNetwork ?? captureState.currentNetwork,
    [selectedNetwork, captureState.currentNetwork]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={styles.backText}>Networks</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>
            {headerNetwork?.ssid ?? 'Select a network'}
          </Text>
          {headerNetwork && (
            <Text style={styles.subtitle}>
              {headerNetwork.bssid} • {headerNetwork.signal} dBm • CH{' '}
              {headerNetwork.channel}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <CaptureControls
          isCapturing={captureState.isCapturing}
          isBusy={isBusy}
          hasSelectedNetwork={hasSelectedNetwork}
          canExport={canExport}
          onStartCapture={handleStartCapture}
          onStopCapture={handleStopCapture}
          onExportHandshake={handleExportHandshake}
        />

        <View style={styles.deauthContainer}>
          <Text style={styles.sectionTitle}>Deauthentication Controls</Text>
          <View style={styles.deauthRow}>
            <View style={styles.deauthField}>
              <Text style={styles.deauthLabel}>Frame Count</Text>
              <TextInput
                value={deauthCount}
                onChangeText={setDeauthCount}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#AEAEB2"
                style={styles.deauthInput}
                editable={!isBusy}
              />
            </View>
            <View style={styles.deauthField}>
              <Text style={styles.deauthLabel}>Client MAC</Text>
              <TextInput
                value={clientMac}
                onChangeText={(value) => setClientMac(value.toUpperCase())}
                placeholder="FF:FF:FF:FF:FF:FF"
                placeholderTextColor="#AEAEB2"
                style={styles.deauthInput}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isBusy}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.deauthButton,
              (!hasSelectedNetwork || isBusy) && styles.disabledButton,
            ]}
            onPress={handleSendDeauth}
            disabled={!hasSelectedNetwork || isBusy}
            accessibilityRole="button"
          >
            <Text style={styles.deauthButtonText}>Send Deauth Frames</Text>
          </TouchableOpacity>
        </View>

        <CaptureStats
          isCapturing={captureState.isCapturing}
          packetCount={packetCount}
          hasCompleteHandshake={captureState.hasCompleteHandshake}
          networkStatus={captureState.networkStatus}
          captureStartedAt={captureState.captureStartedAt}
        />

        <HandshakeVisualization
          handshake={parsedHandshake}
          packets={captureState.capturedPackets}
          isCapturing={captureState.isCapturing}
        />

        <View style={styles.packetListContainer}>
          <Text style={styles.sectionTitle}>Captured Packets</Text>
          <PacketList
            packets={captureState.capturedPackets}
            onPacketSelect={handlePacketSelect}
            selectedPacket={selectedPacket}
          />
        </View>
      </ScrollView>

      <Modal
        visible={showPacketDetail}
        animationType="slide"
        onRequestClose={() => setShowPacketDetail(false)}
      >
        {selectedPacket && (
          <PacketDetail
            packet={selectedPacket}
            onClose={() => setShowPacketDetail(false)}
          />
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  packetListContainer: {
    flex: 1,
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  deauthContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    gap: 12,
  },
  deauthRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deauthField: {
    flex: 1,
  },
  deauthLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 6,
    fontWeight: '600',
  },
  deauthInput: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1C1C1E',
  },
  deauthButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deauthButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
});

export default HandshakeCapture;
