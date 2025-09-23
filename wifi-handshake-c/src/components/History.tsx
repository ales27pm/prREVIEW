import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import WiFiSnifferService, {
  type HistoryItem,
} from '@/services/WiFiSnifferService';
import RNFS from 'react-native-fs';

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const formatSize = (size: number): string => {
  if (!size) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024))
  );
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${
    units[exponent]
  }`;
};

const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await WiFiSnifferService.getHistory();
      setHistory(entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)));
    } catch (error) {
      console.error('Failed to load history', error);
      Alert.alert('History Error', 'Unable to load handshake history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      const unsubscribe = WiFiSnifferService.onHistoryUpdated((entries) => {
        setHistory(
          entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        );
      });
      return () => {
        unsubscribe();
      };
    }, [loadHistory])
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleView = async (item: HistoryItem) => {
    if (!item.path.endsWith('.json')) {
      Alert.alert('Handshake Export', `Binary export saved to:\n${item.path}`);
      return;
    }

    try {
      const content = await RNFS.readFile(item.path, 'utf8');
      Alert.alert(
        'Handshake Export',
        content.length > 800 ? `${content.slice(0, 800)}…` : content
      );
    } catch (error) {
      Alert.alert('Read Error', 'Unable to open exported handshake.');
    }
  };

  const handleDelete = (item: HistoryItem) => {
    Alert.alert(
      'Delete Export',
      `Remove the export for ${item.ssid ?? item.bssid}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await WiFiSnifferService.deleteHistoryItem(item.id);
            loadHistory();
          },
        },
      ]
    );
  };

  const handleClear = () => {
    if (history.length === 0) {
      return;
    }
    Alert.alert('Clear History', 'Remove all saved handshakes?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await WiFiSnifferService.clearHistory();
          setHistory([]);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.ssid ?? 'Unknown SSID'}</Text>
        <Text style={styles.itemSubtitle}>
          {formatTimestamp(item.timestamp)}
        </Text>
      </View>
      <Text style={styles.itemDetail}>BSSID: {item.bssid}</Text>
      {item.clientMac ? (
        <Text style={styles.itemDetail}>Client: {item.clientMac}</Text>
      ) : null}
      <View style={styles.itemMetaRow}>
        <Text style={styles.itemMeta}>
          {item.security} • CH {item.channel} • {item.signal} dBm
        </Text>
        <Text style={styles.itemMeta}>{formatSize(item.size)}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleView(item)}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item)}
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          history.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshing={loading}
        onRefresh={loadHistory}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading
              ? 'Loading exported handshakes…'
              : 'No handshake exports yet.'}
          </Text>
        }
      />
      <TouchableOpacity
        style={[
          styles.clearButton,
          history.length === 0 && styles.disabledButton,
        ]}
        onPress={handleClear}
        disabled={history.length === 0}
        accessibilityRole="button"
      >
        <Text style={styles.clearButtonText}>Clear History</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  listContent: {
    padding: 16,
  },
  item: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  itemDetail: {
    fontSize: 12,
    color: '#444',
    marginBottom: 2,
  },
  itemMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  itemMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  actionText: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FFEAEA',
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 16,
    textAlign: 'center',
  },
  clearButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default History;
