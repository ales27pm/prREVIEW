import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decode } from 'base64-arraybuffer';
import WifiCapture, {
  WifiCaptureEvents,
  type DeepPacketEvent,
} from 'specs/WifiCaptureSpec';

export interface PacketPreview {
  id: string;
  timestamp: number;
  binary: Uint8Array;
  preview: string;
  headers: Record<string, unknown>;
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

      const packet: PacketPreview = {
        id: raw.id,
        timestamp: raw.timestamp,
        binary,
        preview,
        headers: raw.headers ?? {},
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

    if (typeof WifiCapture.addListener === 'function') {
      WifiCapture.addListener('onDeepPacket');
    }

    const subscription = WifiCaptureEvents.addListener('onDeepPacket', ingest);

    return () => {
      subscription.remove();
      if (typeof WifiCapture.removeListeners === 'function') {
        WifiCapture.removeListeners(1);
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
