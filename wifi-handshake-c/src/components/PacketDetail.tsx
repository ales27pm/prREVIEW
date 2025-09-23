import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { HandshakePacket } from '@/types/WiFiSniffer';
import { formatBytesAsHexDump, formatTimestamp } from '@/utils/formatters';

interface PacketDetailProps {
  packet: HandshakePacket;
  onClose: () => void;
}

export const PacketDetail: React.FC<PacketDetailProps> = ({
  packet,
  onClose,
}) => {
  const renderHexDump = () => {
    if (!packet.keyData || packet.keyData.length === 0) {
      return <Text style={styles.emptyField}>No key data available</Text>;
    }

    return (
      <View style={styles.hexDumpContainer}>
        <Text style={styles.hexDumpTitle}>Raw Key Data (Hex)</Text>
        <ScrollView style={styles.hexDump} horizontal>
          <Text style={styles.hexDumpContent}>
            {formatBytesAsHexDump(packet.keyData)}
          </Text>
        </ScrollView>
      </View>
    );
  };

  const renderEapolDetails = () => {
    if (packet.type !== 'EAPOL') {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EAPOL Key Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Message</Text>
          <Text style={styles.detailValue}>
            {packet.message ? `Message ${packet.message}` : 'Unknown'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Key Info</Text>
          <Text style={styles.detailValue}>
            {packet.keyInfo
              ? `0x${packet.keyInfo.toString(16).padStart(4, '0')}`
              : 'N/A'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Key Length</Text>
          <Text style={styles.detailValue}>{packet.keyLength ?? 0} bytes</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Replay Counter</Text>
          <Text style={styles.detailValue}>
            {packet.replayCounter
              ? packet.replayCounter.toString('hex')
              : 'N/A'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Nonce</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {packet.keyNonce
              ? `${packet.keyNonce.toString('hex').slice(0, 32)}…`
              : 'N/A'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>MIC</Text>
          <Text style={styles.detailValue}>
            {packet.keyMIC && packet.keyMIC.length > 0
              ? `${packet.keyMIC.toString('hex').slice(0, 16)}…`
              : 'None'}
          </Text>
        </View>
        {renderHexDump()}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Packet Details</Text>
          <Text style={styles.timestamp}>
            {formatTimestamp(packet.timestamp)}
          </Text>
        </View>
      </View>
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>802.11 Header</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{packet.type}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>BSSID</Text>
            <Text style={styles.detailValue}>{packet.bssid}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Source</Text>
            <Text style={styles.detailValue}>{packet.source}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Destination</Text>
            <Text style={styles.detailValue}>{packet.destination}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Signal</Text>
            <Text style={styles.detailValue}>{packet.signal} dBm</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Length</Text>
            <Text style={styles.detailValue}>{packet.rawLength} bytes</Text>
          </View>
        </View>
        {renderEapolDetails()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  closeButton: {
    padding: 4,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 14,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1C1C1E',
    fontFamily: 'Courier',
    fontWeight: '500',
    marginLeft: 12,
  },
  hexDumpContainer: {
    marginTop: 12,
  },
  hexDumpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  hexDump: {
    backgroundColor: '#F8F8F8',
    borderRadius: 6,
    padding: 8,
    maxHeight: 200,
  },
  hexDumpContent: {
    fontFamily: 'Courier',
    fontSize: 11,
    lineHeight: 16,
    color: '#333',
  },
  emptyField: {
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'center',
    padding: 8,
  },
});

export default PacketDetail;
