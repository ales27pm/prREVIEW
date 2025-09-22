import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CaptureStatsProps {
  isCapturing: boolean;
  packetCount: number;
  hasCompleteHandshake: boolean;
}

export const CaptureStats: React.FC<CaptureStatsProps> = ({
  isCapturing,
  packetCount,
  hasCompleteHandshake,
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
      <Text style={styles.statValue}>{hasCompleteHandshake ? 'Yes' : 'No'}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
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
});

export default CaptureStats;
