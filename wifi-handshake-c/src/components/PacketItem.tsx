import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { HandshakePacket } from '@/types/WiFiSniffer';
import { formatSignalStrength } from '@/utils/formatters';

interface PacketItemProps {
  packet: HandshakePacket;
  onPress?: (packet: HandshakePacket) => void;
  isSelected?: boolean;
}

export const PacketItem: React.FC<PacketItemProps> = ({
  packet,
  onPress,
  isSelected = false,
}) => {
  const handlePress = () => {
    onPress?.(packet);
  };

  const timestamp = new Date(packet.timestamp * 1000).toLocaleTimeString();
  const isEapol = packet.type === 'EAPOL';

  return (
    <TouchableOpacity
      style={[styles.packetItem, isSelected && styles.packetItemSelected]}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <View style={styles.headerRow}>
        <Text style={styles.packetType}>{packet.type}</Text>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
      <View style={styles.addressRow}>
        <Text style={styles.address} numberOfLines={1}>
          {packet.source}
        </Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.address} numberOfLines={1}>
          {packet.destination}
        </Text>
      </View>
      {isEapol && packet.message && (
        <Text style={styles.meta}>Message {packet.message}</Text>
      )}
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>BSSID</Text>
        <Text style={styles.metaValue}>{packet.bssid}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Signal</Text>
        <Text style={styles.metaValue}>
          {formatSignalStrength(packet.signal)} {packet.signal} dBm
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  packetItem: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  packetItemSelected: {
    borderColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  packetType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: '#3A3A3C',
  },
  arrow: {
    marginHorizontal: 6,
    color: '#8E8E93',
  },
  meta: {
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  metaValue: {
    fontSize: 11,
    color: '#1C1C1E',
    fontWeight: '500',
  },
});

export default PacketItem;
