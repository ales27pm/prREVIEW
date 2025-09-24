import React, { forwardRef, useImperativeHandle } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { NativeModules } from 'react-native';
import type { DeepPacketEvent } from 'specs/WifiCaptureSpec';
import usePackets, { type UsePacketsResult } from '../usePackets';

jest.mock('react-native', () => {
  const { EventEmitter } = require('events');

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
  }

  return {
    NativeModules: {},
    NativeEventEmitter: MockNativeEventEmitter,
  };
});

jest.mock('specs/WifiCaptureSpec', () => {
  const { EventEmitter } = require('events');
  const emitter = new EventEmitter();
  return {
    __esModule: true,
    default: {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      startDeepCapture: jest.fn(),
      stopDeepCapture: jest.fn(),
      getCaptureStats: jest.fn(),
    },
    WifiCaptureEvents: {
      addListener: (event: string, listener: (...args: unknown[]) => void) => {
        emitter.on(event, listener);
        return {
          remove: () => emitter.removeListener(event, listener),
        };
      },
    },
  };
});

beforeEach(() => {
  // Ensure the hook uses the shared mock emitter rather than instantiating a NativeEventEmitter.
  (NativeModules as Record<string, unknown>).WifiCapture = undefined;
});

const HookHarness = forwardRef<UsePacketsResult, { sessionId: string | null }>(
  ({ sessionId }, ref) => {
    const hook = usePackets(sessionId);
    useImperativeHandle(ref, () => hook, [hook]);
    return null;
  }
);

HookHarness.displayName = 'HookHarness';

describe('usePackets', () => {
  it('normalizes raw packet payloads', () => {
    const payload = Buffer.from('abc', 'utf8').toString('base64');
    const raw: DeepPacketEvent = {
      id: '1',
      timestamp: 123,
      payload,
      headers: {},
      preview: '',
    };

    const ref = React.createRef<UsePacketsResult>();

    act(() => {
      TestRenderer.create(<HookHarness ref={ref} sessionId="session" />);
    });

    act(() => {
      ref.current?.ingest(raw);
    });

    expect(ref.current?.packets[0]?.preview).toContain('61 62 63');
  });
});
