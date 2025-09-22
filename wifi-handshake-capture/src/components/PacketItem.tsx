import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HandshakePacket } from '../services/WiFiSnifferService';

interface PacketItemProps {
  packet: HandshakePacket;
}

export const PacketItem: React.FC<PacketItemProps> = ({ packet }) => {
  const preview = packet.data
    ? packet.data.length > 64
      ? `${packet.data.substring(0, 64)}…`
      : packet.data
    : '';

  return (
    <View style={styles.packetItem}>
      <Text style={styles.packetHeader}>
        {packet.type}
        {packet.message ? ` Msg ${packet.message}` : ''}
      </Text>
      <Text style={styles.packetMeta}>
        {new Date(packet.timestamp * 1000).toLocaleTimeString()}
      </Text>
      <Text style={styles.packetData}>{preview}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  packetItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  packetHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  packetMeta: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  packetData: {
    fontSize: 11,
    color: '#48484A',
    fontFamily: 'Courier',
  },
});

export default PacketItem;
