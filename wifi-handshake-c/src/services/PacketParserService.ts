import { Buffer } from 'buffer';
import type { HandshakePacket, ParsedHandshake } from '@/types/WiFiSniffer';

const MIN_EAPOL_FRAME_LENGTH = 99;

export class PacketParserService {
  private static readonly EAPOL_VERSION = 0x02;
  private static readonly KEY_INFO_MASK = 0x000f;
  private static readonly KEY_MIC_MASK = 0x0100;
  private static readonly KEY_ENCRYPTED_MASK = 0x0400;
  private static readonly KEY_ACK_MASK = 0x0010;

  static parseEAPOLPacket(rawPacket: Buffer): HandshakePacket | null {
    if (!rawPacket || rawPacket.length < MIN_EAPOL_FRAME_LENGTH) {
      return null;
    }

    try {
      const llcSnap = rawPacket.subarray(24, 32);
      if (
        llcSnap.length < 8 ||
        llcSnap[0] !== 0xaa ||
        llcSnap[1] !== 0xaa ||
        llcSnap[2] !== 0x03
      ) {
        return null;
      }

      const eapolHeader = rawPacket.subarray(32, 36);
      if (eapolHeader.length < 4) {
        return null;
      }

      const version = eapolHeader[0];
      const eapolType = eapolHeader[1];
      const length = eapolHeader.readUInt16BE(2);

      if (version !== this.EAPOL_VERSION || eapolType !== 0x03) {
        return null;
      }

      if (36 + length > rawPacket.length) {
        return null;
      }

      const keyData = rawPacket.subarray(36, 36 + length);
      if (keyData.length < 48) {
        return null;
      }

      const bssid = this.formatMac(rawPacket.subarray(10, 16));
      const source = this.formatMac(rawPacket.subarray(4, 10));
      const destination = this.formatMac(rawPacket.subarray(16, 22));
      const rawLength = rawPacket.length;

      const keyInfo = keyData.readUInt16BE(0);
      // eslint-disable-next-line no-bitwise
      const keyInfoFlags = keyInfo & this.KEY_INFO_MASK;
      // eslint-disable-next-line no-bitwise
      const hasKeyMic = (keyInfo & this.KEY_MIC_MASK) !== 0;
      // eslint-disable-next-line no-bitwise
      const isAck = (keyInfo & this.KEY_ACK_MASK) !== 0;

      let message: 1 | 2 | 3 | 4 | null = null;
      if (keyInfoFlags === 0x0008 && isAck) {
        message = 1;
      } else if (keyInfoFlags === 0x0009 && !isAck) {
        message = 2;
      } else if (keyInfoFlags === 0x0009 && isAck) {
        message = 3;
      } else if (keyInfoFlags === 0x000b && !isAck) {
        message = 4;
      }

      if (!message) {
        return null;
      }

      const keyLength = keyData.readUInt16BE(2);
      const replayCounter = keyData.subarray(4, 12);
      const keyNonce = keyData.subarray(12, 44);
      const keyIv = keyData.subarray(44, 60);
      const keyRsc = keyData.subarray(60, 68);
      const keyId = keyData.subarray(68, 76);
      const keyMic = hasKeyMic ? keyData.subarray(76, 92) : Buffer.alloc(0);
      const keyDataStart = hasKeyMic ? 92 : 76;
      const keyDataSection = keyData.subarray(
        keyDataStart,
        keyDataStart + keyLength
      );

      const clientMac = source === bssid ? destination : source;

      return {
        timestamp: Date.now() / 1000,
        type: 'EAPOL',
        subtype: this.getKeySubtype(keyInfo),
        bssid,
        source,
        destination,
        clientMac,
        rawLength,
        signal: -50,
        keyInfo,
        keyLength,
        replayCounter,
        keyNonce,
        keyIV: keyIv,
        keyRSC: keyRsc,
        keyID: keyId,
        keyMIC: keyMic,
        keyData: keyDataSection,
        message,
        isComplete: false,
        eapolVersion: version,
        eapolType,
      } as HandshakePacket;
    } catch (error) {
      console.error('Failed to parse EAPOL packet:', error);
      return null;
    }
  }

  static analyzeHandshake(packets: HandshakePacket[]): ParsedHandshake | null {
    if (!packets || packets.length < 4) {
      return null;
    }

    const validPackets = packets.filter(
      (packet) => packet.message !== undefined
    ) as HandshakePacket[];
    if (validPackets.length < 4) {
      return null;
    }

    const messageSet = new Set(validPackets.map((packet) => packet.message));
    if (![1, 2, 3, 4].every((msg) => messageSet.has(msg))) {
      return null;
    }

    const firstPacket = validPackets[0];
    const lastPacket = validPackets[validPackets.length - 1];
    const rsnInfo = firstPacket.keyData
      ? this.parseRsnInformation(firstPacket.keyData)
      : null;
    const apMac = firstPacket.bssid;
    const clientMac =
      firstPacket.clientMac ??
      (firstPacket.source === apMac
        ? firstPacket.destination
        : firstPacket.source);

    return {
      bssid: apMac,
      clientMac,
      timestamp: lastPacket.timestamp,
      packets: validPackets,
      isComplete: true,
      apMac,
      ssid: 'Unknown',
      securityType: rsnInfo?.akmSuite[0] ?? 'WPA2-PSK',
      channel: firstPacket.channel ?? 1,
      signal: firstPacket.signal,
      keyVersion: rsnInfo?.version ?? 1,
      groupCipher: rsnInfo?.groupCipher ?? 'CCMP',
      pairwiseCipher: rsnInfo?.pairwiseCipher ?? 'CCMP',
      authKeyManagement: rsnInfo?.akmSuite ?? ['PSK'],
      isCrackable: this.isCrackableHandshake(rsnInfo),
      crackComplexity: this.assessCrackComplexity(rsnInfo),
    } as ParsedHandshake;
  }

  private static formatMac(buffer: Buffer): string {
    return Array.from(buffer)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join(':');
  }

  private static getKeySubtype(
    keyInfo: number
  ): 'Key' | 'Pairwise' | 'Group' | 'RSN' {
    // eslint-disable-next-line no-bitwise
    const subtype = (keyInfo >> 2) & 0x0003;
    switch (subtype) {
      case 0:
        return 'Pairwise';
      case 1:
        return 'Group';
      case 2:
        return 'RSN';
      default:
        return 'Key';
    }
  }

  private static parseRsnInformation(keyData: Buffer): {
    version: number;
    groupCipher: string;
    pairwiseCipher: string;
    akmSuite: string[];
  } | null {
    if (!keyData || keyData.length < 4) {
      return null;
    }

    const rsnTag = Buffer.from([0x30]);
    const rsnIndex = keyData.indexOf(rsnTag);
    if (rsnIndex === -1 || rsnIndex + 2 >= keyData.length) {
      return null;
    }

    const rsnLength = keyData[rsnIndex + 1];
    const rsnData = keyData.subarray(rsnIndex + 2, rsnIndex + 2 + rsnLength);
    if (rsnData.length < 8) {
      return null;
    }

    const version = rsnData.readUInt16LE(0);
    const groupCipherSuite = this.cipherSuiteToString(rsnData.readUInt32BE(2));
    const pairwiseCountOffset = 6;
    if (rsnData.length < pairwiseCountOffset + 2) {
      return null;
    }

    const pairwiseCount = rsnData.readUInt16LE(pairwiseCountOffset);
    const pairwiseOffset = pairwiseCountOffset + 2;
    const pairwiseCipherSuite = this.cipherSuiteToString(
      rsnData.readUInt32BE(pairwiseOffset)
    );

    const akmCountOffset = pairwiseOffset + pairwiseCount * 4;
    if (rsnData.length < akmCountOffset + 2) {
      return {
        version,
        groupCipher: groupCipherSuite,
        pairwiseCipher: pairwiseCipherSuite,
        akmSuite: ['Unknown'],
      };
    }

    const akmCount = rsnData.readUInt16LE(akmCountOffset);
    const akmSuites: string[] = [];
    for (let index = 0; index < akmCount; index += 1) {
      const suiteOffset = akmCountOffset + 2 + index * 4;
      if (suiteOffset + 4 > rsnData.length) {
        break;
      }
      akmSuites.push(this.akmSuiteToString(rsnData.readUInt32BE(suiteOffset)));
    }

    return {
      version,
      groupCipher: groupCipherSuite,
      pairwiseCipher: pairwiseCipherSuite,
      akmSuite: akmSuites.length > 0 ? akmSuites : ['Unknown'],
    };
  }

  private static cipherSuiteToString(suite: number): string {
    switch (suite) {
      case 0x000fac00:
        return 'Use group cipher';
      case 0x000fac01:
        return 'WEP-40';
      case 0x000fac02:
        return 'TKIP';
      case 0x000fac04:
        return 'CCMP';
      case 0x000fac06:
        return 'GCMP';
      default:
        return 'Unknown';
    }
  }

  private static akmSuiteToString(akm: number): string {
    switch (akm) {
      case 0x000fac01:
        return '802.1X';
      case 0x000fac02:
        return 'PSK';
      case 0x000fac03:
        return 'FT-802.1X';
      case 0x000fac04:
        return 'FT-PSK';
      case 0x000fac08:
        return 'PSK-SHA256';
      case 0x000fac12:
        return 'SAE';
      default:
        return 'Unknown';
    }
  }

  private static isCrackableHandshake(
    rsn: ReturnType<typeof this.parseRsnInformation>
  ): boolean {
    if (!rsn) {
      return false;
    }

    return rsn.pairwiseCipher === 'TKIP' || rsn.pairwiseCipher === 'CCMP';
  }

  private static assessCrackComplexity(
    rsn: ReturnType<typeof this.parseRsnInformation>
  ): 'Easy' | 'Medium' | 'Hard' | 'Impossible' {
    if (!rsn || !this.isCrackableHandshake(rsn)) {
      return 'Impossible';
    }

    if (rsn.pairwiseCipher === 'TKIP') {
      return 'Easy';
    }

    if (rsn.akmSuite.includes('PSK') || rsn.akmSuite.includes('PSK-SHA256')) {
      return 'Medium';
    }

    return 'Hard';
  }
}

export default PacketParserService;
