import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CaptureControlsProps {
  isCapturing: boolean;
  isBusy: boolean;
  hasSelectedNetwork: boolean;
  canExport: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onSendDeauth: () => void;
  onExportHandshake: () => void;
}

export const CaptureControls: React.FC<CaptureControlsProps> = ({
  isCapturing,
  isBusy,
  hasSelectedNetwork,
  canExport,
  onStartCapture,
  onStopCapture,
  onSendDeauth,
  onExportHandshake,
}) => {
  const captureDisabled = isBusy || (!hasSelectedNetwork && !isCapturing);
  const sendDeauthDisabled = isBusy || !hasSelectedNetwork;
  const exportDisabled = isBusy || !canExport;

  return (
    <View style={styles.controls}>
      <TouchableOpacity
        style={[styles.controlButton, captureDisabled && styles.disabledButton]}
        onPress={isCapturing ? onStopCapture : onStartCapture}
        disabled={captureDisabled}
        accessibilityRole="button"
      >
        <Text style={styles.controlButtonText}>
          {isCapturing ? 'Stop Capture' : 'Start Capture'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.controlButton,
          styles.secondaryButton,
          sendDeauthDisabled && styles.disabledButton,
        ]}
        onPress={onSendDeauth}
        disabled={sendDeauthDisabled}
        accessibilityRole="button"
      >
        <Text style={styles.controlButtonText}>Send Deauth</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.controlButton,
          styles.exportButton,
          exportDisabled && styles.disabledButton,
        ]}
        onPress={onExportHandshake}
        disabled={exportDisabled}
        accessibilityRole="button"
      >
        <Text style={styles.controlButtonText}>Export Handshake</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  controls: {
    padding: 16,
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#FF3B30',
  },
  exportButton: {
    backgroundColor: '#34C759',
  },
  disabledButton: {
    opacity: 0.6,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CaptureControls;
