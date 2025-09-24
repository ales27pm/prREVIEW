jest.mock('react-native', () => {
  const EventEmitter = require('events');

  class MockNativeEventEmitter {
    private readonly emitter = new EventEmitter();

    constructor(_nativeModule?: unknown) {}

    addListener(eventName: string, listener: (...args: unknown[]) => void) {
      this.emitter.on(eventName, listener);
      return {
        remove: () => this.emitter.removeListener(eventName, listener),
      };
    }

    removeAllListeners(eventName: string) {
      this.emitter.removeAllListeners(eventName);
    }

    emit(eventName: string, ...args: unknown[]) {
      this.emitter.emit(eventName, ...args);
    }
  }

  const nativeModules: Record<string, unknown> = {};
  const turboModuleRegistry = {
    get: jest.fn(),
  };

  return {
    NativeModules: nativeModules,
    TurboModuleRegistry: turboModuleRegistry,
    NativeEventEmitter: MockNativeEventEmitter,
    Platform: { OS: 'ios' },
  };
});

import type { Spec } from '../WifiCaptureSpec';

const { NativeModules, TurboModuleRegistry } = require('react-native');

const createNativeModule = () => ({
  scan: jest.fn().mockResolvedValue([
    {
      ssid: 'TestNetwork',
      bssid: '00:11:22:33:44:55',
      signal: -45,
      channel: 6,
      frequency: 2437,
      security: 'WPA2',
    },
  ]),
  start: jest.fn(),
  stop: jest.fn(),
  deauth: jest.fn(),
  startDeepCapture: jest.fn().mockResolvedValue({ sessionId: 'session-1' }),
  stopDeepCapture: jest.fn(),
  getCaptureStats: jest.fn().mockResolvedValue({
    bytesCaptured: 1024,
    packetsProcessed: 50,
    dropped: 1,
  }),
  setAdvancedScanMode: jest.fn().mockResolvedValue(undefined),
  getCachedScanResults: jest.fn().mockResolvedValue([]),
  importTetheredCapture: jest
    .fn()
    .mockResolvedValue({ packets: 12, duration: 1.2 }),
  startTetheredCapture: jest.fn().mockResolvedValue({ interface: 'rvi0' }),
  stopTetheredCapture: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
});

describe('WifiCaptureSpec', () => {
  afterEach(() => {
    delete NativeModules.WifiCapture;
    (TurboModuleRegistry.get as jest.Mock).mockReset();
  });

  it('scans for networks', async () => {
    const nativeModule = createNativeModule();
    (TurboModuleRegistry.get as jest.Mock).mockReturnValue(nativeModule);
    NativeModules.WifiCapture = nativeModule;

    let WifiCapture: Spec;
    jest.isolateModules(() => {
      const module = require('../WifiCaptureSpec');
      WifiCapture = module.default;
    });

    const networks = await WifiCapture.scan();
    expect(nativeModule.scan).toHaveBeenCalled();
    expect(networks).toEqual([
      expect.objectContaining({
        ssid: 'TestNetwork',
        bssid: '00:11:22:33:44:55',
        signal: -45,
        channel: 6,
        frequency: 2437,
        security: 'WPA2',
      }),
    ]);
  });

  it('rejects on invalid port for deep capture', async () => {
    const nativeModule = createNativeModule();
    nativeModule.startDeepCapture = jest
      .fn()
      .mockImplementation(async (options) => {
        if (!options || options.udpPort === undefined || options.udpPort <= 0) {
          throw new Error('INVALID_PORT');
        }
        return { sessionId: 'valid-session' };
      });

    (TurboModuleRegistry.get as jest.Mock).mockReturnValue(nativeModule);
    NativeModules.WifiCapture = nativeModule;

    let WifiCapture: Spec;
    jest.isolateModules(() => {
      const module = require('../WifiCaptureSpec');
      WifiCapture = module.default;
    });

    await expect(WifiCapture.startDeepCapture({ udpPort: -1 })).rejects.toThrow(
      'INVALID_PORT'
    );
  });

  it('supports tethered capture helpers', async () => {
    const nativeModule = createNativeModule();
    (TurboModuleRegistry.get as jest.Mock).mockReturnValue(nativeModule);
    NativeModules.WifiCapture = nativeModule;

    let WifiCapture: Spec;
    jest.isolateModules(() => {
      const module = require('../WifiCaptureSpec');
      WifiCapture = module.default;
    });

    await WifiCapture.setAdvancedScanMode(true);
    expect(nativeModule.setAdvancedScanMode).toHaveBeenCalledWith(true);

    const cached = await WifiCapture.getCachedScanResults();
    expect(nativeModule.getCachedScanResults).toHaveBeenCalled();
    expect(cached).toEqual([]);

    const importResult = await WifiCapture.importTetheredCapture(
      '/tmp/demo.pcap'
    );
    expect(nativeModule.importTetheredCapture).toHaveBeenCalledWith(
      '/tmp/demo.pcap'
    );
    expect(importResult.packets).toBe(12);

    const startResult = await WifiCapture.startTetheredCapture('auto');
    expect(startResult.interface).toBe('rvi0');
    expect(nativeModule.startTetheredCapture).toHaveBeenCalledWith('auto');

    await WifiCapture.stopTetheredCapture();
    expect(nativeModule.stopTetheredCapture).toHaveBeenCalled();
  });
});
