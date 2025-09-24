import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PacketPreview } from '../hooks/usePackets';

interface PacketItemProps {
  packet: PacketPreview;
}

const formatTimestamp = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.debug('Failed to format packet timestamp', error);
    return `${timestamp}`;
  }
};

const PacketItem: React.FC<PacketItemProps> = React.memo(({ packet }) => {
  const typeLabel = useMemo(() => {
    if (typeof packet.headers.type === 'string' && packet.headers.type.length) {
      return packet.headers.type;
    }
    if (
      typeof packet.headers.frameType === 'string' &&
      packet.headers.frameType.length
    ) {
      return packet.headers.frameType;
    }
    return 'Unknown';
  }, [packet.headers.frameType, packet.headers.type]);

  const subtypeLabel = useMemo(() => {
    if (
      typeof packet.headers.subtype === 'string' &&
      packet.headers.subtype.length
    ) {
      return packet.headers.subtype;
    }
    if (
      typeof packet.headers.frameSubtype === 'string' &&
      packet.headers.frameSubtype.length
    ) {
      return packet.headers.frameSubtype;
    }
    if (typeof packet.headers.frameSubtype === 'number') {
      return `Subtype ${packet.headers.frameSubtype}`;
    }
    return undefined;
  }, [packet.headers.frameSubtype, packet.headers.subtype]);

  const protocol = useMemo(() => {
    if (typeof packet.headers.protocol === 'string') {
      return packet.headers.protocol.toUpperCase();
    }
    return undefined;
  }, [packet.headers.protocol]);

  const sourceLabel = useMemo(() => {
    if (typeof packet.headers.srcIP === 'string') {
      const port =
        typeof packet.headers.srcPort === 'number'
          ? `:${packet.headers.srcPort}`
          : '';
      return `${packet.headers.srcIP}${port}`;
    }
    if (typeof packet.headers.addr2 === 'string') {
      return packet.headers.addr2;
    }
    return undefined;
  }, [packet.headers.addr2, packet.headers.srcIP, packet.headers.srcPort]);

  const destinationLabel = useMemo(() => {
    if (typeof packet.headers.dstIP === 'string') {
      const port =
        typeof packet.headers.dstPort === 'number'
          ? `:${packet.headers.dstPort}`
          : '';
      return `${packet.headers.dstIP}${port}`;
    }
    if (typeof packet.headers.addr1 === 'string') {
      return packet.headers.addr1;
    }
    return undefined;
  }, [packet.headers.addr1, packet.headers.dstIP, packet.headers.dstPort]);

  const channel = useMemo(() => {
    if (typeof packet.headers.channel === 'number') {
      return `Channel ${packet.headers.channel}`;
    }
    return undefined;
  }, [packet.headers.channel]);

  const frequency = useMemo(() => {
    if (typeof packet.headers.frequency === 'number') {
      return `${packet.headers.frequency} MHz`;
    }
    return undefined;
  }, [packet.headers.frequency]);

  const signal = useMemo(() => {
    if (typeof packet.headers.signal === 'number') {
      return `${packet.headers.signal} dBm`;
    }
    return undefined;
  }, [packet.headers.signal]);

  const noise = useMemo(() => {
    if (typeof packet.headers.noise === 'number') {
      return `${packet.headers.noise} dBm noise`;
    }
    return undefined;
  }, [packet.headers.noise]);

  const packetSize = useMemo(() => {
    if (typeof packet.headers.packetSize === 'number') {
      return `${packet.headers.packetSize} bytes`;
    }
    return `${packet.binary.length} bytes`;
  }, [packet.binary.length, packet.headers.packetSize]);

  const infoLines = useMemo(() => {
    const lines: string[] = [];
    if (protocol) {
      lines.push(`Protocol: ${protocol}`);
    }
    if (sourceLabel) {
      const hasSrcIp = typeof packet.headers.srcIP === 'string';
      lines.push(`${hasSrcIp ? 'Source' : 'Source MAC'}: ${sourceLabel}`);
    }
    if (destinationLabel) {
      lines.push(`Destination: ${destinationLabel}`);
    }
    if (channel) {
      lines.push(channel);
    }
    if (frequency) {
      lines.push(frequency);
    }
    if (signal) {
      lines.push(`Signal: ${signal}`);
    }
    if (noise) {
      lines.push(noise);
    }
    lines.push(`Size: ${packetSize}`);
    return lines;
  }, [
    channel,
    destinationLabel,
    frequency,
    noise,
    packetSize,
    protocol,
    signal,
    packet.headers.srcIP,
    sourceLabel,
  ]);

  const handshakeLines = useMemo(() => {
    if (!packet.isHandshake) {
      return [] as string[];
    }

    const lines: string[] = [];
    if (typeof packet.headers.eapolMessage === 'number') {
      lines.push(`EAPOL Message: M${packet.headers.eapolMessage}`);
    }
    if (typeof packet.headers.keyInfo === 'number') {
      lines.push(`Key Info: 0x${packet.headers.keyInfo.toString(16)}`);
    }
    if (
      typeof packet.headers.replayCounter === 'string' &&
      packet.headers.replayCounter.length > 0
    ) {
      lines.push(`Replay Counter: ${packet.headers.replayCounter}`);
    }
    if (typeof packet.headers.keyMicPresent === 'boolean') {
      lines.push(
        `MIC: ${packet.headers.keyMicPresent ? 'present' : 'missing'}`
      );
    }
    if (typeof packet.headers.keyDescriptorVersion === 'number') {
      lines.push(`Descriptor Version: ${packet.headers.keyDescriptorVersion}`);
    }
    return lines;
  }, [
    packet.headers.eapolMessage,
    packet.headers.keyDescriptorVersion,
    packet.headers.keyInfo,
    packet.headers.keyMicPresent,
    packet.headers.replayCounter,
    packet.isHandshake,
  ]);

  return (
    <View style={styles.container}>
      <Text style={styles.timestamp}>{formatTimestamp(packet.timestamp)}</Text>
      <Text style={styles.preview} numberOfLines={2}>
        {packet.preview}
      </Text>
      <Text style={styles.type}>
        {[typeLabel, subtypeLabel, protocol].filter(Boolean).join(' · ')}
      </Text>
      {infoLines.map((line) => (
        <Text key={line} style={styles.metadata}>
          {line}
        </Text>
      ))}
      {handshakeLines.map((line) => (
        <Text key={line} style={styles.handshakeDetail}>
          {line}
        </Text>
      ))}
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
  metadata: {
    fontSize: 12,
    color: '#48484A',
    marginTop: 2,
  },
  handshakeDetail: {
    fontSize: 12,
    color: '#0A84FF',
    marginTop: 2,
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
