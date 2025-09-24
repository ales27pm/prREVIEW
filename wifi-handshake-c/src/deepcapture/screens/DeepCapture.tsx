import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import WifiCapture, { type CaptureStatistics } from 'specs/WifiCaptureSpec';
import PacketItem from '../components/PacketItem';
import usePackets from '../hooks/usePackets';
import WiFiSnifferService from '@/services/WiFiSnifferService';

const DEFAULT_PORT = 16999;

const DeepCaptureScreen: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [stats, setStats] = useState<CaptureStatistics | null>(null);
  const [advancedScanEnabled, setAdvancedScanEnabled] = useState(false);
  const [tetheredModeEnabled, setTetheredModeEnabled] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cachedNetworksCount, setCachedNetworksCount] = useState(0);
  const [lastImportedPackets, setLastImportedPackets] = useState<number | null>(
    null
  );
  const { packets, clear } = usePackets(sessionId);

  const startCapture = useCallback(async () => {
    if (isBusy || sessionId) {
      return;
    }

    setIsBusy(true);
    try {
      const result = await WifiCapture.startDeepCapture({
        udpPort: DEFAULT_PORT,
      });
      setSessionId(result.sessionId);
      setStats({ bytesCaptured: 0, packetsProcessed: 0, dropped: 0 });
    } catch (error) {
      console.error('[DeepCapture] Failed to start deep capture:', error);
      Alert.alert('Deep Capture', 'Unable to start deep capture session.');
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, sessionId]);

  const stopCapture = useCallback(async () => {
    if (!sessionId || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await WifiCapture.stopDeepCapture(sessionId);
      setSessionId(null);
      clear();
      setStats(null);
    } catch (error) {
      console.error('[DeepCapture] Failed to stop deep capture:', error);
      Alert.alert('Deep Capture', 'Unable to stop deep capture session.');
    } finally {
      setIsBusy(false);
    }
  }, [clear, isBusy, sessionId]);

  const refreshStats = useCallback(async () => {
    if (!sessionId || isBusy) {
      return;
    }

    try {
      const result = await WifiCapture.getCaptureStats(sessionId);
      setStats(result);
    } catch (error) {
      console.error('[DeepCapture] Failed to fetch stats:', error);
      Alert.alert('Deep Capture', 'Unable to fetch capture statistics.');
    }
  }, [isBusy, sessionId]);

  const refreshCachedNetworks = useCallback(async () => {
    try {
      const results = await WifiCapture.getCachedScanResults();
      setCachedNetworksCount(results.length);
    } catch (error) {
      console.warn('[DeepCapture] Failed to fetch cached scans', error);
    }
  }, []);

  const handleAdvancedToggle = useCallback(
    async (value: boolean) => {
      setAdvancedScanEnabled(value);
      try {
        await WifiCapture.setAdvancedScanMode(value);
        await WiFiSnifferService.setAdvancedScanMode(value);
        if (value) {
          await refreshCachedNetworks();
        } else {
          setCachedNetworksCount(0);
        }
      } catch (error) {
        console.error(
          '[DeepCapture] Failed to update advanced scanning',
          error
        );
        Alert.alert(
          'Advanced Scan',
          'Unable to update advanced scanning state. Check permissions.'
        );
        setAdvancedScanEnabled((current) =>
          !value && current ? current : value
        );
      }
    },
    [refreshCachedNetworks]
  );

  const handleTetheredToggle = useCallback(async (value: boolean) => {
    setTetheredModeEnabled(value);
    if (value) {
      Alert.alert(
        'Tethered Capture',
        [
          'Connect this device to a macOS host and run:',
          'rvictl -s <device-udid>',
          'Capture with Wireshark, then share the resulting PCAP via Files or AirDrop.',
        ].join('\n\n'),
        [
          {
            text: 'Apple Guide',
            onPress: () =>
              Linking.openURL(
                'https://support.apple.com/guide/deployment/remote-virtual-interface-apdd5a212916/web'
              ).catch(() => undefined),
          },
          { text: 'OK' },
        ]
      );

      try {
        await WifiCapture.startTetheredCapture('auto');
      } catch (error) {
        console.warn('[DeepCapture] Unable to start tethered capture', error);
      }
    } else {
      try {
        await WifiCapture.stopTetheredCapture();
      } catch (error) {
        console.warn('[DeepCapture] Unable to stop tethered capture', error);
      }
      setLastImportedPackets(null);
    }
  }, []);

  const importLatestPcap = useCallback(async () => {
    setImporting(true);
    try {
      const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      const candidates = files.filter(
        (file) =>
          file.isFile() &&
          (file.name.toLowerCase().endsWith('.pcap') ||
            file.name.toLowerCase().endsWith('.pcapng'))
      );

      if (candidates.length === 0) {
        Alert.alert('Import PCAP', 'No PCAP files found in Documents.');
        return;
      }

      const latest = candidates.reduce((previous, current) =>
        (current.mtime?.getTime() ?? 0) > (previous.mtime?.getTime() ?? 0)
          ? current
          : previous
      );

      const result = await WifiCapture.importTetheredCapture(latest.path);
      setLastImportedPackets(result.packets);
      if (advancedScanEnabled) {
        await refreshCachedNetworks();
      }
      Alert.alert(
        'Import Complete',
        `Imported ${result.packets} packets from ${latest.name}`
      );
    } catch (error) {
      console.error('[DeepCapture] Failed to import PCAP', error);
      Alert.alert(
        'Import Failed',
        'Unable to import the selected PCAP file. Ensure it is accessible.'
      );
    } finally {
      setImporting(false);
    }
  }, [advancedScanEnabled, refreshCachedNetworks]);

  useEffect(() => {
    if (advancedScanEnabled) {
      refreshCachedNetworks().catch(() => undefined);
    }
  }, [advancedScanEnabled, refreshCachedNetworks]);

  const listEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          {sessionId
            ? 'Waiting for packets…'
            : 'Start a deep capture session to view packets.'}
        </Text>
      </View>
    ),
    [sessionId]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Advanced Scan Mode</Text>
            <Text style={styles.toggleDescription}>
              Cache CoreWLAN metadata for richer network diagnostics.
            </Text>
            {advancedScanEnabled && (
              <Text style={styles.toggleMeta}>
                Cached networks: {cachedNetworksCount}
              </Text>
            )}
          </View>
          <Switch
            value={advancedScanEnabled}
            onValueChange={handleAdvancedToggle}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Tethered Capture Mode</Text>
            <Text style={styles.toggleDescription}>
              Import rvictl/Wireshark PCAPs to analyze EAPOL and 802.11 frames.
            </Text>
            {lastImportedPackets != null && (
              <Text style={styles.toggleMeta}>
                Last import: {lastImportedPackets} packets
              </Text>
            )}
          </View>
          <Switch
            value={tetheredModeEnabled}
            onValueChange={handleTetheredToggle}
          />
        </View>

        <View style={styles.controls}>
          <Button
            title="Start"
            onPress={startCapture}
            disabled={isBusy || Boolean(sessionId)}
          />
          <Button
            title="Stop"
            onPress={stopCapture}
            disabled={isBusy || !sessionId}
          />
          <Button
            title="Refresh Stats"
            onPress={refreshStats}
            disabled={isBusy || !sessionId}
          />
        </View>

        {tetheredModeEnabled && (
          <View style={styles.tetheredActions}>
            <Button
              title={importing ? 'Importing…' : 'Import Latest PCAP'}
              onPress={importLatestPcap}
              disabled={importing}
            />
          </View>
        )}

        {isBusy && (
          <View style={styles.busyIndicator}>
            <ActivityIndicator />
          </View>
        )}
        {stats && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsLabel}>Session {sessionId}</Text>
            <Text style={styles.statsText}>
              {`Captured ${stats.packetsProcessed} packets (${stats.bytesCaptured} bytes), dropped ${stats.dropped}`}
            </Text>
          </View>
        )}
      </ScrollView>
      <FlatList
        data={packets}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PacketItem packet={item} />}
        ListEmptyComponent={listEmptyComponent}
        style={styles.list}
      />
    </SafeAreaView>
  );
};

export default DeepCaptureScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    paddingVertical: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tetheredActions: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleInfo: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#636366',
    marginTop: 4,
  },
  toggleMeta: {
    fontSize: 12,
    color: '#0A84FF',
    marginTop: 4,
  },
  busyIndicator: {
    paddingVertical: 8,
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  statsLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  statsText: {
    fontSize: 14,
    color: '#1C1C1E',
    marginTop: 4,
  },
  list: {
    flex: 1,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    textAlign: 'center',
  },
});
