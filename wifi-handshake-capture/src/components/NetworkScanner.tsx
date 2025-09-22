import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WiFiSnifferService from '../services/WiFiSnifferService';
import type { WiFiNetwork } from '../types/WiFiSniffer';

interface NetworkScannerProps {
  onNetworkSelect: (network: WiFiNetwork) => void;
}

export const NetworkScanner: React.FC<NetworkScannerProps> = ({ onNetworkSelect }) => {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);

  const startScan = useCallback(async () => {
    setScanning(true);
    try {
      const foundNetworks = await WiFiSnifferService.scanNetworks();
      setNetworks(foundNetworks);
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

  const renderNetwork = ({ item }: { item: WiFiNetwork }) => (
    <TouchableOpacity
      style={styles.networkItem}
      onPress={() => onNetworkSelect(item)}
      accessibilityRole="button"
    >
      <View style={styles.networkInfo}>
        <Text style={styles.ssid}>{item.ssid || 'Hidden network'}</Text>
        <Text style={styles.bssid}>BSSID: {item.bssid}</Text>
        <Text style={styles.signal}>Signal: {item.signal} dBm</Text>
      </View>
      <View style={styles.security}>
        <Text style={styles.securityText}>{item.security}</Text>
        <Text style={styles.channel}>CH {item.channel}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
        onPress={startScan}
        disabled={scanning}
        accessibilityRole="button"
      >
        <Text style={styles.scanButtonText}>{scanning ? 'Scanning…' : 'Scan Networks'}</Text>
      </TouchableOpacity>

      <FlatList
        data={networks}
        keyExtractor={(item) => item.bssid}
        renderItem={renderNetwork}
        style={styles.list}
        contentContainerStyle={networks.length === 0 ? styles.emptyContainer : undefined}
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
  scanButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
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
    color: '#999',
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
  emptyText: {
    textAlign: 'center',
    padding: 32,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default NetworkScanner;
