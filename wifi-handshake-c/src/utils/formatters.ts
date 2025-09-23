import { Buffer } from 'buffer';

export const formatBytesAsHexDump = (
  buffer: Buffer,
  bytesPerLine = 16
): string => {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (let index = 0; index < buffer.length; index += bytesPerLine) {
    const chunk = buffer.subarray(index, index + bytesPerLine);
    const hexPairs = chunk.toString('hex').match(/.{1,2}/g) ?? [];
    const hex = hexPairs.join(' ').padEnd(bytesPerLine * 3 - 1, ' ');
    const ascii = Array.from(chunk)
      .map((value) => {
        const char = String.fromCharCode(value);
        return /[\x20-\x7e]/.test(char) ? char : '.';
      })
      .join('')
      .padEnd(bytesPerLine, ' ');

    lines.push(`${hex}  ${ascii}`);
  }

  return lines.join('\n');
};

export const formatMacAddress = (mac: string): string => {
  const normalized = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (normalized.length !== 12) {
    return mac;
  }

  return normalized.replace(/(.{2})(?=.)/g, '$1:');
};

export const formatTimestamp = (timestamp: number): string => {
  if (!timestamp) {
    return 'Unknown';
  }

  return new Date(timestamp * 1000).toLocaleString();
};

export const formatSignalStrength = (signal: number): string => {
  const normalized = Math.max(-100, Math.min(-20, signal));
  const bars = Math.round(((normalized + 100) / 80) * 4);
  return '█'.repeat(bars).padEnd(4, '░');
};

export const bytesToHumanReadable = (bytes: number): string => {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${
    units[exponent]
  }`;
};

export const parseChannelFromFrequency = (frequency: number): number => {
  if (frequency >= 2412 && frequency <= 2484) {
    return Math.round((frequency - 2412) / 5) + 1;
  }

  if (frequency >= 5180 && frequency <= 5825) {
    return Math.round((frequency - 5180) / 5) + 36;
  }

  return 0;
};
