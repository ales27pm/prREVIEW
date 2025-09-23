import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Circle, G, Path, Svg, Text as SvgText } from 'react-native-svg';
import type { HandshakePacket, ParsedHandshake } from '@/types/WiFiSniffer';
import { formatTimestamp } from '@/utils/formatters';

interface HandshakeVisualizationProps {
  handshake: ParsedHandshake | null;
  packets: HandshakePacket[];
  isCapturing: boolean;
}

const { width: screenWidth } = Dimensions.get('window');
const chartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.5,
  propsForDots: {
    r: '3',
    strokeWidth: '1',
    stroke: '#1C1C1E',
  },
};

export const HandshakeVisualization: React.FC<HandshakeVisualizationProps> = ({
  handshake,
  packets,
  isCapturing,
}) => {
  const eapolPackets = useMemo(
    () => packets.filter((packet) => packet.type === 'EAPOL'),
    [packets]
  );

  const timelineData = useMemo(() => {
    if (!handshake) {
      return eapolPackets.map((packet) =>
        Math.max(-100, Math.min(-20, packet.signal))
      );
    }

    const dataset = eapolPackets.map((packet) =>
      Math.max(-100, Math.min(-20, packet.signal))
    );
    return dataset.length ? dataset : [handshake.signal];
  }, [eapolPackets, handshake]);

  const labels = useMemo(
    () =>
      eapolPackets.map((packet, index) => `M${packet.message ?? index + 1}`),
    [eapolPackets]
  );

  if (!handshake || !handshake.isComplete) {
    return (
      <View style={styles.incompleteContainer}>
        <Text style={styles.incompleteText}>
          {isCapturing
            ? 'Capturing packets… waiting for complete handshake'
            : 'No complete handshake captured yet'}
        </Text>
      </View>
    );
  }

  const flowDiagramWidth = Math.min(340, screenWidth - 64);
  const flowDiagramHeight = 160;
  const apX = 32;
  const clientX = flowDiagramWidth - 32;
  const segmentHeight = flowDiagramHeight / 4;

  const flowSegments = [
    {
      label: 'M1',
      fromX: apX,
      toX: clientX,
      y: segmentHeight * 0.5,
      color: '#007AFF',
    },
    {
      label: 'M2',
      fromX: clientX,
      toX: apX,
      y: segmentHeight * 1.5,
      color: '#34C759',
    },
    {
      label: 'M3',
      fromX: apX,
      toX: clientX,
      y: segmentHeight * 2.5,
      color: '#FF9500',
    },
    {
      label: 'M4',
      fromX: clientX,
      toX: apX,
      y: segmentHeight * 3.5,
      color: '#AF52DE',
    },
  ];

  const renderHandshakeFlow = () => (
    <View style={styles.flowContainer}>
      <Text style={styles.flowTitle}>4-Way Handshake Flow</Text>
      <Svg width={flowDiagramWidth} height={flowDiagramHeight}>
        <Path
          d={`M${apX},10 L${apX},${flowDiagramHeight - 10}`}
          stroke="#1C1C1E"
          strokeWidth={1}
          strokeDasharray="4"
        />
        <Path
          d={`M${clientX},10 L${clientX},${flowDiagramHeight - 10}`}
          stroke="#1C1C1E"
          strokeWidth={1}
          strokeDasharray="4"
        />
        <SvgText
          x={apX}
          y={16}
          fill="#1C1C1E"
          fontSize={12}
          textAnchor="middle"
        >
          AP ({handshake.bssid})
        </SvgText>
        <SvgText
          x={clientX}
          y={16}
          fill="#1C1C1E"
          fontSize={12}
          textAnchor="middle"
        >
          Client ({handshake.clientMac})
        </SvgText>
        {flowSegments.map((segment) => (
          <G key={segment.label}>
            <Path
              d={`M${segment.fromX},${segment.y} L${segment.toX},${segment.y}`}
              stroke={segment.color}
              strokeWidth={3}
            />
            <Circle
              cx={segment.toX}
              cy={segment.y}
              r={4}
              fill={segment.color}
            />
            <SvgText
              x={(segment.fromX + segment.toX) / 2}
              y={segment.y - 6}
              fill={segment.color}
              fontSize={12}
              fontWeight="bold"
              textAnchor="middle"
            >
              {segment.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );

  const renderSecurityAnalysis = () => (
    <View style={styles.analysisContainer}>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Security</Text>
        <Text style={styles.analysisValue}>{handshake.securityType}</Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Channel</Text>
        <Text style={styles.analysisValue}>{handshake.channel}</Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Pairwise Cipher</Text>
        <Text style={styles.analysisValue}>{handshake.pairwiseCipher}</Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Group Cipher</Text>
        <Text style={styles.analysisValue}>{handshake.groupCipher}</Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Authentication</Text>
        <Text style={styles.analysisValue}>
          {handshake.authKeyManagement.join(', ')}
        </Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Crackable</Text>
        <Text style={styles.analysisValue}>
          {handshake.isCrackable ? 'Yes' : 'No'}
        </Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisLabel}>Complexity</Text>
        <Text style={[styles.analysisValue, styles.complexityValue]}>
          {handshake.crackComplexity}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Handshake Analysis</Text>
      {renderHandshakeFlow()}
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Signal Strength Timeline</Text>
        <LineChart
          data={{
            labels: labels.length
              ? labels
              : timelineData.map((_, index) => `#${index + 1}`),
            datasets: [{ data: timelineData }],
          }}
          width={screenWidth - 64}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withInnerLines={false}
        />
      </View>
      {renderSecurityAnalysis()}
      <View style={styles.metadata}>
        <Text style={styles.metadataLabel}>BSSID</Text>
        <Text style={styles.metadataValue}>{handshake.bssid}</Text>
        <Text style={styles.metadataLabel}>Client</Text>
        <Text style={styles.metadataValue}>{handshake.clientMac}</Text>
        <Text style={styles.metadataLabel}>Captured At</Text>
        <Text style={styles.metadataValue}>
          {formatTimestamp(handshake.timestamp)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 16,
  },
  incompleteContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  incompleteText: {
    textAlign: 'center',
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  flowContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  flowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  chartContainer: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  analysisContainer: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  analysisLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  analysisValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  complexityValue: {
    textTransform: 'capitalize',
  },
  metadata: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E7',
    paddingTop: 12,
  },
  metadataLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  metadataValue: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '500',
  },
});

export default HandshakeVisualization;
