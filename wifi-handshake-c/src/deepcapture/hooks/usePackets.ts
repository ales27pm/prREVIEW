import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { decode } from 'base64-arraybuffer';
import WifiCapture, {
  WifiCaptureEvents,
  type DeepPacketEvent,
} from 'specs/WifiCaptureSpec';
import { parsePacket as parseDeepPacket } from '@/services/PacketParserService';

export interface PacketPreview {
  id: string;
  timestamp: number;
  binary: Uint8Array;
  preview: string;
  headers: Record<string, unknown>;
  isHandshake?: boolean;
}

const HEX_PREVIEW_BYTES = 32;

const createPreview = (binary: Uint8Array): string => {
  if (binary.length === 0) {
    return '0 bytes';
  }

  const slice = binary.slice(0, HEX_PREVIEW_BYTES);
  const hexSlice = Array.from(slice)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
  const suffix = binary.length > HEX_PREVIEW_BYTES ? '…' : '';
  return `${hexSlice}${suffix} (${binary.length} bytes)`;
};

export interface UsePacketsResult {
  packets: PacketPreview[];
  clear: () => void;
  normalize: (raw: DeepPacketEvent) => PacketPreview | null;
  ingest: (raw: DeepPacketEvent) => void;
}

export const usePackets = (sessionId: string | null): UsePacketsResult => {
  const [packets, setPackets] = useState<PacketPreview[]>([]);
  const packetIds = useRef(new Set<string>());

  const normalize = useCallback(
    (raw: DeepPacketEvent): PacketPreview | null => {
      if (!raw || typeof raw.payload !== 'string') {
        return null;
      }

      let binary: Uint8Array;
      try {
        binary = new Uint8Array(decode(raw.payload));
      } catch (error) {
        console.warn('[usePackets] Failed to decode payload:', error);
        return null;
      }

      const preview =
        typeof raw.preview === 'string' && raw.preview.length > 0
          ? `${raw.preview} (${binary.length} bytes)`
          : createPreview(binary);

      const enriched = parseDeepPacket({
        id: raw.id,
        timestamp: raw.timestamp,
        payload: raw.payload,
        headers: raw.headers ?? {},
        preview: raw.preview ?? '',
      });

      const packet: PacketPreview = {
        id: raw.id,
        timestamp: raw.timestamp,
        binary,
        preview,
        headers: raw.headers ?? {},
        isHandshake: enriched.isHandshake,
      };

      return packet;
    },
    []
  );

  const ingest = useCallback(
    (raw: DeepPacketEvent) => {
      const normalized = normalize(raw);
      if (!normalized) {
        return;
      }

      setPackets((current) => {
        if (packetIds.current.has(normalized.id)) {
          return current;
        }

        const next = [...current, normalized];
        packetIds.current.add(normalized.id);
        return next;
      });
    },
    [normalize]
  );

  const clear = useCallback(() => {
    packetIds.current.clear();
    setPackets([]);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    const nativeModule = NativeModules.WifiCapture as
      | Record<string, unknown>
      | undefined;
    const hasNativeModule = Boolean(nativeModule);
    const emitter = hasNativeModule
      ? new NativeEventEmitter(nativeModule)
      : WifiCaptureEvents;

    if (typeof WifiCapture.addListener === 'function') {
      WifiCapture.addListener('onDeepPacket');
    }

    const subscription = emitter.addListener('onDeepPacket', ingest);

    return () => {
      subscription.remove();
      if (typeof WifiCapture.removeListeners === 'function') {
        WifiCapture.removeListeners(1);
      }
      if (hasNativeModule) {
        (emitter as NativeEventEmitter).removeAllListeners('onDeepPacket');
      }
    };
  }, [ingest, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      clear();
    }
  }, [clear, sessionId]);

  return useMemo(
    () => ({
      packets,
      clear,
      normalize,
      ingest,
    }),
    [clear, ingest, normalize, packets]
  );
};

export default usePackets;
