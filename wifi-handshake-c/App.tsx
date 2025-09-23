import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import WiFiSnifferService from '@/services/WiFiSnifferService';
import { NetworkScanner } from '@/components/NetworkScanner';
import { HandshakeCapture } from '@/components/HandshakeCapture';
import History from '@/components/History';
import type { WiFiNetwork } from '@/types/WiFiSniffer';

type RootStackParamList = {
  Scanner: undefined;
  Capture: { network: WiFiNetwork };
  History: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type ScannerScreenProps = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const ScannerScreen: React.FC<ScannerScreenProps> = ({ navigation }) => {
  const handleNetworkSelect = (network: WiFiNetwork) => {
    navigation.navigate('Capture', { network });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <NetworkScanner
        onNetworkSelect={handleNetworkSelect}
        onOpenHistory={() => navigation.navigate('History')}
      />
    </SafeAreaView>
  );
};

type CaptureScreenProps = NativeStackScreenProps<RootStackParamList, 'Capture'>;

const CaptureScreen: React.FC<CaptureScreenProps> = ({ route, navigation }) => {
  const { network } = route.params;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <HandshakeCapture
        selectedNetwork={network}
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
};

type HistoryScreenProps = NativeStackScreenProps<RootStackParamList, 'History'>;

const HistoryScreen: React.FC<HistoryScreenProps> = () => (
  <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="dark-content" />
    <History />
  </SafeAreaView>
);

const App: React.FC = () => {
  useEffect(() => {
    WiFiSnifferService.initialize().catch((error) => {
      console.error('App initialization failed:', error);
    });

    return () => {
      WiFiSnifferService.cleanup();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Scanner"
            component={ScannerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Capture"
            component={CaptureScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: 'Handshake History' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
});

export default App;
