import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { HandshakePacket, PacketType } from '@/types/WiFiSniffer';
import PacketItem from '@/components/PacketItem';

interface PacketListProps {
  packets: HandshakePacket[];
  onPacketSelect: (packet: HandshakePacket) => void;
  selectedPacket?: HandshakePacket;
}

const FILTERS: Array<{ label: string; value: PacketType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'EAPOL', value: 'EAPOL' },
  { label: 'Deauth', value: 'DEAUTH' },
  { label: 'Beacon', value: 'BEACON' },
];

export const PacketList: React.FC<PacketListProps> = ({
  packets,
  onPacketSelect,
  selectedPacket,
}) => {
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<PacketType | 'all'>('all');

  const filteredPackets = useMemo(() => {
    const search = filterText.trim().toLowerCase();

    return packets.filter((packet) => {
      const matchesSearch = search
        ? [packet.bssid, packet.source, packet.destination]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(search))
        : true;

      const matchesType =
        filterType === 'all' ? true : packet.type === filterType;

      return matchesSearch && matchesType;
    });
  }, [packets, filterText, filterType]);

  const clearSearch = () => {
    setFilterText('');
  };

  const renderPacket = ({ item }: { item: HandshakePacket }) => (
    <PacketItem
      packet={item}
      onPress={onPacketSelect}
      isSelected={item === selectedPacket}
    />
  );

  const renderFilterChips = () => (
    <View style={styles.filterContainer}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#8E8E93" />
        <TextInput
          value={filterText}
          onChangeText={setFilterText}
          placeholder="Filter by MAC address"
          placeholderTextColor="#AEAEB2"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {filterText.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.chipContainer}>
        {FILTERS.map((filter) => {
          const isActive = filterType === filter.value;
          return (
            <TouchableOpacity
              key={filter.value}
              style={[styles.filterChip, isActive && styles.activeFilterChip]}
              onPress={() => setFilterType(filter.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.activeFilterChipText,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderFilterChips()}
      <FlatList
        data={filteredPackets}
        keyExtractor={(item, index) =>
          `${item.timestamp}-${item.type}-${index}`
        }
        renderItem={renderPacket}
        style={styles.list}
        contentContainerStyle={
          filteredPackets.length === 0 ? styles.emptyContainer : undefined
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.headerText}>
            Showing {filteredPackets.length} of {packets.length} packets
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={32} color="#8E8E93" />
            <Text style={styles.emptyText}>
              {filterText || filterType !== 'all'
                ? 'No packets match your filters'
                : 'No packets captured yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1C1C1E',
  },
  clearButton: {
    padding: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterChip: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    marginRight: 8,
    marginBottom: 8,
  },
  activeFilterChip: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  activeFilterChipText: {
    color: 'white',
  },
  list: {
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 32,
  },
  headerText: {
    fontSize: 12,
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 16,
  },
});

export default PacketList;
