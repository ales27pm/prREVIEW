import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import WiFiSnifferService, {
  type CaptureState,
} from '@/services/WiFiSnifferService';
import { WiFiSnifferEvents } from '@/types/WiFiSniffer';
import type { WiFiNetwork } from '@/types/WiFiSniffer';

export function useHandshakeCapture(selectedNetwork: WiFiNetwork | null) {
  const [captureState, setCaptureState] = useState<CaptureState>(
    WiFiSnifferService.getCaptureState()
  );
  const [isBusy, setIsBusy] = useState(false);

  const refreshCaptureState = useCallback(() => {
    setCaptureState(WiFiSnifferService.getCaptureState());
  }, []);

  useEffect(() => {
    const subscriptions: Array<{ remove: () => void }> = [];

    subscriptions.push(
      WiFiSnifferEvents.addListener('packetCaptured', refreshCaptureState)
    );

    const unsubscribeHandshake = WiFiSnifferService.onHandshakeComplete(() => {
      Alert.alert('Success!', 'Complete 4-way handshake captured!');
      refreshCaptureState();
    });

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      unsubscribeHandshake();
    };
  }, [refreshCaptureState]);

  const startCapture = useCallback(async () => {
    if (!selectedNetwork) {
      Alert.alert('Error', 'Please select a network first.');
      return;
    }

    setIsBusy(true);
    try {
      await WiFiSnifferService.startCapture('en0', selectedNetwork);
      refreshCaptureState();
    } catch (error) {
      console.error(error);
      Alert.alert('Capture Failed', 'Unable to start packet capture.');
    } finally {
      setIsBusy(false);
    }
  }, [selectedNetwork, refreshCaptureState]);

  const stopCapture = useCallback(async () => {
    setIsBusy(true);
    try {
      await WiFiSnifferService.stopCapture();
      refreshCaptureState();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to stop capture');
    } finally {
      setIsBusy(false);
    }
  }, [refreshCaptureState]);

  const sendDeauth = useCallback(async () => {
    if (!selectedNetwork) {
      Alert.alert('Error', 'Please select a network first.');
      return false;
    }

    setIsBusy(true);
    try {
      const success = await WiFiSnifferService.sendDeauth(
        selectedNetwork.bssid,
        'FF:FF:FF:FF:FF:FF',
        5
      );
      if (!success) {
        Alert.alert('Error', 'Failed to send deauth frames');
      }
      return success;
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to send deauth frames');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [selectedNetwork]);

  const exportHandshake = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = await WiFiSnifferService.exportHandshake();
      if (!path) {
        Alert.alert('Error', 'No complete handshake to export');
      }
      return path;
    } catch (error) {
      console.error(error);
      Alert.alert('Export Failed', 'Could not save handshake data');
      return null;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return {
    captureState,
    isBusy,
    startCapture,
    stopCapture,
    sendDeauth,
    exportHandshake,
  };
}

export type UseHandshakeCaptureReturn = ReturnType<typeof useHandshakeCapture>;
