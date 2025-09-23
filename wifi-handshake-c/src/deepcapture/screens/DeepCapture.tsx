import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import WifiCapture from 'specs/WifiCaptureSpec';
import type { CaptureStatistics } from 'specs/WifiCaptureSpec';
import PacketItem from '../components/PacketItem';
import usePackets from '../hooks/usePackets';

const DEFAULT_PORT = 16999;

const DeepCaptureScreen: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [stats, setStats] = useState<CaptureStatistics | null>(null);
  const { packets, clear } = usePackets(sessionId);

  const handleStart = useCallback(async () => {
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

  const handleStop = useCallback(async () => {
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

  const handleRefreshStats = useCallback(async () => {
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
      <View style={styles.controls}>
        <Button
          title="Start"
          onPress={handleStart}
          disabled={isBusy || Boolean(sessionId)}
        />
        <Button
          title="Stop"
          onPress={handleStop}
          disabled={isBusy || !sessionId}
        />
        <Button
          title="Refresh Stats"
          onPress={handleRefreshStats}
          disabled={isBusy || !sessionId}
        />
      </View>
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
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
