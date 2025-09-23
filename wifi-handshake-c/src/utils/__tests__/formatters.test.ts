import { Buffer } from 'buffer';
import {
  bytesToHumanReadable,
  formatBytesAsHexDump,
  formatMacAddress,
  parseChannelFromFrequency,
} from '../formatters';

describe('formatters', () => {
  it('formats hex dump output with ascii preview', () => {
    const buffer = Buffer.from('48656c6c6f2057694669', 'hex');
    const dump = formatBytesAsHexDump(buffer, 8);

    expect(dump).toContain('48 65 6c 6c 6f 20 57 69');
    expect(dump).toContain('Hello Wi');
  });

  it('normalizes MAC address representation', () => {
    expect(formatMacAddress('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
    expect(formatMacAddress('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('parses WiFi channel from frequency', () => {
    expect(parseChannelFromFrequency(2412)).toBe(1);
    expect(parseChannelFromFrequency(2462)).toBe(11);
    expect(parseChannelFromFrequency(5180)).toBe(36);
    expect(parseChannelFromFrequency(0)).toBe(0);
  });

  it('converts bytes to human readable strings', () => {
    expect(bytesToHumanReadable(0)).toBe('0 B');
    expect(bytesToHumanReadable(1024)).toBe('1.0 KB');
    expect(bytesToHumanReadable(10 * 1024 * 1024)).toBe('10 MB');
  });
});
