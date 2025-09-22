import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import WiFiSnifferService from './src/services/WiFiSnifferService';
import { NetworkScanner } from './src/components/NetworkScanner';
import { HandshakeCapture } from './src/components/HandshakeCapture';
import type { WiFiNetwork } from './src/types/WiFiSniffer';

const App: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<WiFiNetwork | null>(null);
  const [currentView, setCurrentView] = useState<'scanner' | 'capture'>('scanner');

  useEffect(() => {
    WiFiSnifferService.initialize().catch((error) => {
      console.error('App initialization failed:', error);
    });

    return () => {
      WiFiSnifferService.cleanup();
    };
  }, []);

  const handleNetworkSelect = (network: WiFiNetwork) => {
    setSelectedNetwork(network);
    setCurrentView('capture');
  };

  const handleBackToScanner = () => {
    setCurrentView('scanner');
    setSelectedNetwork(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {currentView === 'scanner' ? (
        <NetworkScanner onNetworkSelect={handleNetworkSelect} />
      ) : (
        <View style={styles.captureView}>
          <HandshakeCapture selectedNetwork={selectedNetwork} onBack={handleBackToScanner} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  captureView: {
    flex: 1,
  },
});

export default App;
