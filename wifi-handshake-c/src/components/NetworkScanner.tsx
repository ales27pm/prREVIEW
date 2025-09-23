import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatMacAddress, formatSignalStrength } from '@/utils/formatters';
import WiFiSnifferService from '@/services/WiFiSnifferService';
import type { WiFiNetwork } from '@/types/WiFiSniffer';

interface NetworkScannerProps {
  onNetworkSelect: (network: WiFiNetwork) => void;
  onOpenHistory: () => void;
}

export const NetworkScanner: React.FC<NetworkScannerProps> = ({
  onNetworkSelect,
  onOpenHistory,
}) => {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const startScan = useCallback(async () => {
    setScanning(true);
    try {
      const foundNetworks = await WiFiSnifferService.scanNetworks();
      setNetworks(foundNetworks);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error('Scan failed', error);
      Alert.alert('Scan Failed', 'Unable to scan for networks');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    startScan();
  }, [startScan]);

  const renderNetwork = ({ item }: { item: WiFiNetwork }) => {
    const ssid = item.ssid || 'Hidden network';
    const channel = item.channel ? `CH ${item.channel}` : 'Unknown channel';
    return (
      <TouchableOpacity
        style={styles.networkItem}
        onPress={() => onNetworkSelect(item)}
        accessibilityRole="button"
      >
        <View style={styles.networkInfo}>
          <Text style={styles.ssid}>{ssid}</Text>
          <Text style={styles.bssid}>
            BSSID: {formatMacAddress(item.bssid)}
          </Text>
          <Text style={styles.signal}>
            {formatSignalStrength(item.signal)} {item.signal} dBm
          </Text>
          <Text style={styles.capabilities}>{item.capabilities}</Text>
        </View>
        <View style={styles.security}>
          <Text style={styles.securityText}>{item.security}</Text>
          <Text style={styles.channel}>{channel}</Text>
          <Text style={styles.frequency}>{item.frequency} MHz</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={startScan}
          disabled={scanning}
          accessibilityRole="button"
        >
          <Text style={styles.scanButtonText}>
            {scanning ? 'Scanning…' : 'Scan Networks'}
          </Text>
          {lastUpdated && (
            <Text style={styles.scanSubtitle}>
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={onOpenHistory}
          accessibilityRole="button"
        >
          <Text style={styles.historyButtonText}>History</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={networks}
        keyExtractor={(item) => `${item.bssid}_${item.ssid}`}
        renderItem={renderNetwork}
        style={styles.list}
        contentContainerStyle={
          networks.length === 0 ? styles.emptyContainer : undefined
        }
        refreshControl={
          <RefreshControl refreshing={scanning} onRefresh={startScan} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {scanning ? 'Scanning for networks…' : 'No networks found'}
          </Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scanSubtitle: {
    color: '#F2F2F2',
    fontSize: 12,
    marginTop: 4,
  },
  historyButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#34C759',
  },
  historyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  networkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  networkInfo: {
    flex: 1,
    paddingRight: 16,
  },
  ssid: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1C1C1E',
  },
  bssid: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  signal: {
    fontSize: 12,
    color: '#1C1C1E',
    marginTop: 4,
  },
  capabilities: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 6,
  },
  security: {
    alignItems: 'flex-end',
  },
  securityText: {
    backgroundColor: '#E5E5E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 4,
    color: '#333',
  },
  channel: {
    fontSize: 12,
    color: '#666',
  },
  frequency: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    padding: 32,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default NetworkScanner;
