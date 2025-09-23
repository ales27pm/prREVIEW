import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Buffer } from 'buffer';
import type { HandshakePacket } from '@/types/WiFiSniffer';
import {
  bytesToHumanReadable,
  formatMacAddress,
  formatSignalStrength,
} from '@/utils/formatters';

interface PacketItemProps {
  packet: HandshakePacket;
  onPress?: (packet: HandshakePacket) => void;
  isSelected?: boolean;
}

const MAX_PREVIEW_BYTES = 48;
const MAX_PREVIEW_LENGTH = 96;

const createDataPreview = (data?: string): string | null => {
  if (!data) {
    return null;
  }

  try {
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      return null;
    }

    const asciiPreview = buffer
      .subarray(0, MAX_PREVIEW_BYTES)
      .toString('utf8')
      .replace(/[^\x20-\x7e]/g, '.');

    if (/[A-Za-z0-9]/.test(asciiPreview)) {
      return buffer.length > MAX_PREVIEW_BYTES
        ? `${asciiPreview}…`
        : asciiPreview;
    }

    const hexPreview = buffer.toString('hex').toUpperCase();
    return hexPreview.length > MAX_PREVIEW_LENGTH
      ? `${hexPreview.slice(0, MAX_PREVIEW_LENGTH)}…`
      : hexPreview;
  } catch (_error) {
    return data.length > MAX_PREVIEW_LENGTH
      ? `${data.slice(0, MAX_PREVIEW_LENGTH)}…`
      : data;
  }
};

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
  const bssid = formatMacAddress(packet.bssid);
  const client = packet.clientMac
    ? formatMacAddress(packet.clientMac)
    : 'Unknown';
  const packetSize = bytesToHumanReadable(packet.rawLength);
  const dataPreview = createDataPreview(packet.data);

  const metadataChips: string[] = [];

  if (isEapol) {
    if (packet.message) {
      metadataChips.push(`Message ${packet.message}`);
    }
    if (packet.subtype) {
      metadataChips.push(packet.subtype);
    }
    if (typeof packet.keyInfo === 'number') {
      metadataChips.push(
        `Key 0x${packet.keyInfo.toString(16).padStart(4, '0')}`
      );
    }
    if (packet.replayCounter && packet.replayCounter.length > 0) {
      const replay = packet.replayCounter.toString('hex').toUpperCase();
      metadataChips.push(
        `Replay ${replay.length > 12 ? `${replay.slice(0, 12)}…` : replay}`
      );
    }
  }

  if (packet.security) {
    metadataChips.push(packet.security);
  }

  if (packet.ssid) {
    metadataChips.push(packet.ssid);
  }

  if (typeof packet.reasonCode === 'number') {
    metadataChips.push(`Reason ${packet.reasonCode}`);
  }

  if (typeof packet.count === 'number' && packet.count > 1) {
    metadataChips.push(`${packet.count} frames`);
  }

  let channelLabel: string | null = null;
  if (typeof packet.channel === 'number' && packet.channel > 0) {
    channelLabel = `${packet.channel}`;
    if (typeof packet.frequency === 'number' && packet.frequency > 0) {
      channelLabel = `${channelLabel} • ${packet.frequency} MHz`;
    }
  }

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
      {metadataChips.length > 0 && (
        <View style={styles.metadataRow}>
          {Array.from(new Set(metadataChips)).map((chip) => (
            <View key={chip} style={styles.metadataChip}>
              <Text style={styles.metadataChipText}>{chip}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>BSSID</Text>
        <Text style={styles.metaValue}>{bssid}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Client</Text>
        <Text style={styles.metaValue}>{client}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Signal</Text>
        <Text style={styles.metaValue}>
          {formatSignalStrength(packet.signal)} {packet.signal} dBm
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Size</Text>
        <Text style={styles.metaValue}>{packetSize}</Text>
      </View>
      {channelLabel && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Channel</Text>
          <Text style={styles.metaValue}>{channelLabel}</Text>
        </View>
      )}
      {dataPreview && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Data Preview</Text>
          <Text style={styles.previewText}>{dataPreview}</Text>
        </View>
      )}
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  metaLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  metaValue: {
    fontSize: 11,
    color: '#1C1C1E',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  metadataChip: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  metadataChipText: {
    fontSize: 11,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  previewLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 4,
  },
  previewText: {
    fontSize: 12,
    color: '#3A3A3C',
    fontFamily: 'Courier',
  },
});

export default PacketItem;
