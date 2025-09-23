import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PacketPreview } from '../hooks/usePackets';

interface PacketItemProps {
  packet: PacketPreview;
}

const formatTimestamp = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_error) {
    return `${timestamp}`;
  }
};

const PacketItem: React.FC<PacketItemProps> = React.memo(({ packet }) => {
  const type =
    typeof packet.headers.type === 'string' ? packet.headers.type : 'Unknown';

  return (
    <View style={styles.container}>
      <Text style={styles.timestamp}>{formatTimestamp(packet.timestamp)}</Text>
      <Text style={styles.preview} numberOfLines={2}>
        {packet.preview}
      </Text>
      <Text style={styles.type}>Type: {type}</Text>
      {packet.isHandshake ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Handshake</Text>
        </View>
      ) : null}
    </View>
  );
});

PacketItem.displayName = 'DeepPacketItem';

export default PacketItem;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  preview: {
    fontSize: 13,
    color: '#1C1C1E',
  },
  type: {
    marginTop: 6,
    fontSize: 12,
    color: '#636366',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#34C75933',
  },
  badgeText: {
    fontSize: 11,
    color: '#34C759',
    fontWeight: '600',
  },
});
