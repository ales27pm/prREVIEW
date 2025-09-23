import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NetworkStatus } from '@/services/WiFiSnifferService';

interface CaptureStatsProps {
  isCapturing: boolean;
  packetCount: number;
  hasCompleteHandshake: boolean;
  networkStatus?: NetworkStatus | null;
  captureStartedAt?: number | null;
}

const formatDuration = (
  startedAt?: number | null,
  active?: boolean
): string => {
  if (!startedAt || !active) {
    return '--';
  }

  const elapsed = Math.max(0, Date.now() - startedAt);
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const resolveNetworkStatus = (status?: NetworkStatus | null): string => {
  if (!status) {
    return 'Unknown';
  }

  const availability = status.available ? 'Online' : 'Offline';
  const interfaceLabel = status.interfaceType
    ? ` • ${status.interfaceType}`
    : '';
  return `${availability}${interfaceLabel}`;
};

export const CaptureStats: React.FC<CaptureStatsProps> = ({
  isCapturing,
  packetCount,
  hasCompleteHandshake,
  networkStatus,
  captureStartedAt,
}) => (
  <View style={styles.stats}>
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>Status</Text>
      <Text style={styles.statValue}>{isCapturing ? 'Capturing' : 'Idle'}</Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>Packets</Text>
      <Text style={styles.statValue}>{packetCount}</Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>Complete?</Text>
      <Text style={styles.statValue}>
        {hasCompleteHandshake ? 'Yes' : 'No'}
      </Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>Network</Text>
      <Text style={styles.statValue}>
        {resolveNetworkStatus(networkStatus)}
      </Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>Duration</Text>
      <Text style={styles.statValue}>
        {formatDuration(captureStartedAt ?? null, isCapturing)}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E7',
    rowGap: 12,
  },
  statItem: {
    width: '50%',
    paddingRight: 12,
    alignItems: 'flex-start',
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
});

export default CaptureStats;
