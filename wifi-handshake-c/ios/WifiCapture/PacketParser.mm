#import "PacketParser.h"

#include <algorithm>
#include <arpa/inet.h>
#include <iomanip>
#include <sstream>
#include <vector>

#pragma pack(push, 1)
struct RadiotapHeader {
  uint8_t version;
  uint8_t pad;
  uint16_t length;
  uint32_t presentFlags;
};

struct IEEE80211Header {
  uint16_t frameControl;
  uint16_t durationId;
  uint8_t address1[6];
  uint8_t address2[6];
  uint8_t address3[6];
  uint16_t sequenceControl;
};
#pragma pack(pop)

static NSString *TypeString(uint8_t type, uint8_t subtype) {
  switch (type) {
    case 0:
      return [NSString stringWithFormat:@"Management subtype %u", subtype];
    case 1:
      return [NSString stringWithFormat:@"Control subtype %u", subtype];
    case 2:
      return [NSString stringWithFormat:@"Data subtype %u", subtype];
    default:
      return [NSString stringWithFormat:@"Reserved subtype %u", subtype];
  }
}

static NSString *FrameCategoryString(uint8_t type) {
  switch (type) {
    case 0:
      return @"Management";
    case 1:
      return @"Control";
    case 2:
      return @"Data";
    default:
      return @"Reserved";
  }
}

static NSString *HexString(const uint8_t *data, size_t length) {
  if (length == 0 || data == nullptr) {
    return @"";
  }

  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (size_t index = 0; index < length; index++) {
    stream << std::setw(2) << static_cast<int>(data[index]);
  }
  return [NSString stringWithUTF8String:stream.str().c_str()];
}

static size_t AlignOffset(size_t offset, size_t alignment) {
  if (alignment == 0) {
    return offset;
  }
  const size_t remainder = offset % alignment;
  if (remainder == 0) {
    return offset;
  }
  return offset + (alignment - remainder);
}

struct FieldLayout {
  size_t length;
  size_t alignment;
};

static FieldLayout FieldLayoutForBit(size_t bitIndex) {
  switch (bitIndex) {
    case 0:
      return {8, 8};
    case 1:
      return {1, 1};
    case 2:
      return {1, 1};
    case 3:
      return {4, 2};
    case 4:
      return {2, 2};
    case 5:
      return {1, 1};
    case 6:
      return {1, 1};
    case 7:
      return {2, 2};
    case 8:
      return {2, 2};
    case 9:
      return {2, 2};
    case 10:
      return {1, 1};
    case 11:
      return {1, 1};
    case 12:
      return {1, 1};
    case 13:
      return {1, 1};
    case 14:
      return {2, 2};
    case 15:
      return {2, 2};
    case 16:
      return {1, 1};
    case 17:
      return {1, 1};
    case 18:
      return {8, 8};
    case 19:
      return {3, 1};
    case 20:
      return {8, 8};
    case 21:
      return {2, 2};
    case 22:
      return {2, 2};
    case 23:
      return {4, 4};
    case 24:
      return {1, 1};
    case 25:
      return {1, 1};
    case 26:
      return {1, 1};
    case 27:
      return {1, 1};
    case 28:
      return {8, 8};
    case 29:
      return {8, 8};
    case 30:
      return {8, 8};
    default:
      return {0, 1};
  }
}

static NSInteger ChannelForFrequency(uint16_t frequency) {
  if (frequency == 0) {
    return 0;
  }

  if (frequency == 2484) {
    return 14;
  }

  if (frequency >= 2412 && frequency <= 2472) {
    return (frequency - 2407) / 5;
  }

  if (frequency >= 5000 && frequency <= 5895) {
    return (frequency - 5000) / 5;
  }

  if (frequency >= 5925 && frequency <= 7125) {
    if (frequency < 5955) {
      return 0;
    }
    return static_cast<NSInteger>((frequency - 5955) / 5 + 1);
  }

  return 0;
}

static NSInteger DetermineEapolMessage(uint16_t keyInfo) {
  const uint16_t infoMask = keyInfo & 0x000f;
  const bool ack = (keyInfo & 0x0010) != 0;

  if (infoMask == 0x0008 && ack) {
    return 1;
  }
  if (infoMask == 0x0009 && !ack) {
    return 2;
  }
  if (infoMask == 0x0009 && ack) {
    return 3;
  }
  if (infoMask == 0x000b && !ack) {
    return 4;
  }
  return 0;
}

static NSString *ProtocolString(uint8_t protocol) {
  switch (protocol) {
    case 1:
      return @"ICMP";
    case 2:
      return @"IGMP";
    case 6:
      return @"TCP";
    case 17:
      return @"UDP";
    case 41:
      return @"IPv6";
    case 47:
      return @"GRE";
    case 58:
      return @"ICMPv6";
    default:
      return [NSString stringWithFormat:@"Protocol %u", protocol];
  }
}

static NSString *MacString(const uint8_t *mac) {
  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (int index = 0; index < 6; index++) {
    stream << std::setw(2) << static_cast<int>(mac[index]);
    if (index < 5) {
      stream << ":";
    }
  }
  return [NSString stringWithUTF8String:stream.str().c_str()];
}

static NSString *HexPreview(const uint8_t *data, size_t length) {
  if (length == 0) {
    return @"";
  }
  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  const size_t maxBytes = std::min(static_cast<size_t>(64), length);
  for (size_t index = 0; index < maxBytes; index++) {
    stream << std::setw(2) << static_cast<int>(data[index]);
    if (index + 1 < maxBytes) {
      stream << ' ';
    }
  }
  if (length > maxBytes) {
    stream << " …";
  }
  return [NSString stringWithUTF8String:stream.str().c_str()];
}

static NSDictionary<NSString *, id> *ParseIPv4Packet(const uint8_t *bytes, size_t length) {
  if (length < 20) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint8_t version = bytes[0] >> 4;
  if (version != 4) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint8_t ihl = bytes[0] & 0x0F;
  const size_t headerLength = static_cast<size_t>(ihl) * 4;
  if (headerLength < 20 || headerLength > length) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint16_t totalLength = static_cast<uint16_t>(bytes[2]) << 8 | bytes[3];
  const uint8_t protocol = bytes[9];

  char srcBuffer[INET_ADDRSTRLEN];
  char dstBuffer[INET_ADDRSTRLEN];
  inet_ntop(AF_INET, bytes + 12, srcBuffer, sizeof(srcBuffer));
  inet_ntop(AF_INET, bytes + 16, dstBuffer, sizeof(dstBuffer));

  NSMutableDictionary *headers = [NSMutableDictionary dictionary];
  headers[@"type"] = @"IPv4";
  headers[@"protocol"] = ProtocolString(protocol);
  headers[@"srcIP"] = [NSString stringWithUTF8String:srcBuffer];
  headers[@"dstIP"] = [NSString stringWithUTF8String:dstBuffer];
  headers[@"ttl"] = @(bytes[8]);
  headers[@"length"] = @(length);
  headers[@"payloadLength"] = @(totalLength > headerLength ? totalLength - headerLength : 0);

  if ((protocol == 6 || protocol == 17) && length >= headerLength + 4) {
    const uint16_t srcPort = static_cast<uint16_t>(bytes[headerLength]) << 8 | bytes[headerLength + 1];
    const uint16_t dstPort = static_cast<uint16_t>(bytes[headerLength + 2]) << 8 | bytes[headerLength + 3];
    headers[@"srcPort"] = @(srcPort);
    headers[@"dstPort"] = @(dstPort);
  }

  NSString *preview = @"";
  if (length > headerLength) {
    preview = HexPreview(bytes + headerLength, length - headerLength);
  }

  return @{ @"headers": headers, @"preview": preview };
}

static NSDictionary<NSString *, id> *ParseIPv6Packet(const uint8_t *bytes, size_t length) {
  if (length < 40) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint8_t version = bytes[0] >> 4;
  if (version != 6) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint8_t trafficClass = ((bytes[0] & 0x0F) << 4) | (bytes[1] >> 4);
  const uint32_t flowLabel = ((bytes[1] & 0x0F) << 16) | (bytes[2] << 8) | bytes[3];
  const uint16_t payloadLength = static_cast<uint16_t>(bytes[4]) << 8 | bytes[5];
  const uint8_t nextHeader = bytes[6];

  char srcBuffer[INET6_ADDRSTRLEN];
  char dstBuffer[INET6_ADDRSTRLEN];
  inet_ntop(AF_INET6, bytes + 8, srcBuffer, sizeof(srcBuffer));
  inet_ntop(AF_INET6, bytes + 24, dstBuffer, sizeof(dstBuffer));

  NSMutableDictionary *headers = [NSMutableDictionary dictionary];
  headers[@"type"] = @"IPv6";
  headers[@"protocol"] = ProtocolString(nextHeader);
  headers[@"srcIP"] = [NSString stringWithUTF8String:srcBuffer];
  headers[@"dstIP"] = [NSString stringWithUTF8String:dstBuffer];
  headers[@"hopLimit"] = @(bytes[7]);
  headers[@"trafficClass"] = @(trafficClass);
  headers[@"flowLabel"] = @(flowLabel);
  headers[@"payloadLength"] = @(payloadLength);
  headers[@"length"] = @(length);

  const size_t headerLength = 40;
  if ((nextHeader == 6 || nextHeader == 17) && length >= headerLength + 4) {
    const uint16_t srcPort = static_cast<uint16_t>(bytes[headerLength]) << 8 | bytes[headerLength + 1];
    const uint16_t dstPort = static_cast<uint16_t>(bytes[headerLength + 2]) << 8 | bytes[headerLength + 3];
    headers[@"srcPort"] = @(srcPort);
    headers[@"dstPort"] = @(dstPort);
  }

  NSString *preview = @"";
  if (length > headerLength) {
    preview = HexPreview(bytes + headerLength, length - headerLength);
  }

  return @{ @"headers": headers, @"preview": preview };
}

@implementation PacketParser

+ (NSDictionary<NSString *, id> *)parse:(NSData *)data {
  if (data.length < sizeof(RadiotapHeader)) {
    return @{ "headers": @{}, "preview": @"" };
  }

  const uint8_t *bytes = static_cast<const uint8_t *>(data.bytes);
  const RadiotapHeader *radiotap = reinterpret_cast<const RadiotapHeader *>(bytes);

  if (radiotap->version != 0) {
    return @{ "headers": @{}, "preview": @"" };
  }

  const uint16_t radiotapLength = CFSwapInt16LittleToHost(radiotap->length);
  if (radiotapLength > data.length) {
    return @{ "headers": @{}, "preview": @"" };
  }

  std::vector<uint32_t> presentWords;
  presentWords.reserve(4);
  uint32_t presentWord = CFSwapInt32LittleToHost(radiotap->presentFlags);
  presentWords.push_back(presentWord);

  size_t offset = sizeof(RadiotapHeader);
  while ((presentWord & 0x80000000) != 0 && offset + sizeof(uint32_t) <= radiotapLength) {
    presentWord = CFSwapInt32LittleToHost(
      *reinterpret_cast<const uint32_t *>(bytes + offset)
    );
    presentWords.push_back(presentWord);
    offset += sizeof(uint32_t);
  }

  size_t fieldOffset = offset;
  uint16_t channelFrequency = 0;
  uint16_t channelFlags = 0;
  int8_t signalStrength = 0;
  int8_t noiseLevel = 0;
  bool hasSignal = false;
  bool hasNoise = false;
  uint64_t presentMask = 0;
  bool gotChannel = false;
  bool gotSignal = false;
  bool gotNoise = false;

  for (size_t wordIndex = 0; wordIndex < presentWords.size(); wordIndex++) {
    const uint32_t wordValue = presentWords[wordIndex];
    if (wordIndex < 2) {
      presentMask |= static_cast<uint64_t>(wordValue) << (wordIndex * 32);
    }

    for (size_t bitIndex = 0; bitIndex < 32; bitIndex++) {
      if ((wordValue & (1u << bitIndex)) == 0) {
        continue;
      }

      const size_t globalBitIndex = wordIndex * 32 + bitIndex;
      const FieldLayout layout = FieldLayoutForBit(globalBitIndex);
      if (layout.length == 0) {
        continue;
      }

      fieldOffset = AlignOffset(fieldOffset, layout.alignment);
      if (fieldOffset + layout.length > radiotapLength) {
        fieldOffset = radiotapLength;
        continue;
      }

      const uint8_t *fieldPointer = bytes + fieldOffset;

      switch (globalBitIndex) {
        case 3: {
          channelFrequency = CFSwapInt16LittleToHost(
            *reinterpret_cast<const uint16_t *>(fieldPointer)
          );
          channelFlags = CFSwapInt16LittleToHost(
            *reinterpret_cast<const uint16_t *>(fieldPointer + 2)
          );
          gotChannel = true;
          break;
        }
        case 5: {
          signalStrength = static_cast<int8_t>(fieldPointer[0]);
          hasSignal = true;
          gotSignal = true;
          break;
        }
        case 6: {
          noiseLevel = static_cast<int8_t>(fieldPointer[0]);
          hasNoise = true;
          gotNoise = true;
          break;
        }
        default:
          break;
      }

      fieldOffset += layout.length;
      if (gotChannel && gotSignal && gotNoise) {
        break;
      }
    }
    if (gotChannel && gotSignal && gotNoise) {
      break;
    }
  }

  const size_t frameOffset = radiotapLength;
  const size_t remainingLength = data.length - frameOffset;

  if (remainingLength < sizeof(IEEE80211Header)) {
    return @{ "headers": @{}, "preview": @"" };
  }

  const IEEE80211Header *header = reinterpret_cast<const IEEE80211Header *>(bytes + frameOffset);
  const uint16_t frameControl = CFSwapInt16LittleToHost(header->frameControl);

  const uint8_t type = (frameControl >> 2) & 0x3;
  const uint8_t subtype = (frameControl >> 4) & 0xF;
  const bool toDS = (frameControl & (1 << 8)) != 0;
  const bool fromDS = (frameControl & (1 << 9)) != 0;

  NSMutableDictionary *headers = [NSMutableDictionary dictionary];
  headers[@"frameType"] = FrameCategoryString(type);
  headers[@"frameSubtype"] = @(subtype);
  headers[@"type"] = TypeString(type, subtype);
  headers[@"duration"] = @(CFSwapInt16LittleToHost(header->durationId));
  headers[@"addr1"] = MacString(header->address1);
  headers[@"addr2"] = MacString(header->address2);
  headers[@"addr3"] = MacString(header->address3);
  headers[@"sequenceControl"] = @(CFSwapInt16LittleToHost(header->sequenceControl));
  headers[@"frameControl"] = @(frameControl);
  headers[@"packetSize"] = @(data.length);

  if (channelFrequency > 0) {
    headers[@"frequency"] = @(channelFrequency);
    const NSInteger channelNumber = ChannelForFrequency(channelFrequency);
    if (channelNumber > 0) {
      headers[@"channel"] = @(channelNumber);
    }
    headers[@"channelFlags"] = @(channelFlags);
  }

  if (hasSignal) {
    headers[@"signal"] = @(signalStrength);
  }

  if (hasNoise) {
    headers[@"noise"] = @(noiseLevel);
  }

  if (presentMask != 0) {
    headers[@"radiotapPresentFlags"] = @(static_cast<unsigned long long>(presentMask));
  }

  size_t payloadOffset = frameOffset + sizeof(IEEE80211Header);
  if (toDS && fromDS) {
    if (remainingLength >= sizeof(IEEE80211Header) + 6) {
      const uint8_t *addr4 = bytes + frameOffset + sizeof(IEEE80211Header);
      headers[@"addr4"] = MacString(addr4);
      payloadOffset += 6;
    }
  }

  const size_t llcLength = 8;
  if (type == 2 && payloadOffset + llcLength <= data.length) {
    const uint8_t *llc = bytes + payloadOffset;
    const bool hasSnap =
      llc[0] == 0xaa &&
      llc[1] == 0xaa &&
      llc[2] == 0x03 &&
      llc[3] == 0x00 &&
      llc[4] == 0x00 &&
      llc[5] == 0x00 &&
      llc[6] == 0x88 &&
      llc[7] == 0x8e;

    if (hasSnap) {
      const size_t eapolOffset = payloadOffset + llcLength;
      if (eapolOffset + 4 <= data.length) {
        const uint8_t version = bytes[eapolOffset];
        const uint8_t eapolType = bytes[eapolOffset + 1];
        const uint16_t eapolLength =
          static_cast<uint16_t>(bytes[eapolOffset + 2]) << 8 |
          static_cast<uint16_t>(bytes[eapolOffset + 3]);

        if (eapolType == 0x03 && eapolOffset + 4 + eapolLength <= data.length) {
          headers[@"type"] = @"EAPOL";
          headers[@"isEapol"] = @YES;
          headers[@"eapolVersion"] = @(version);
          headers[@"eapolLength"] = @(eapolLength);

          const size_t descriptorOffset = eapolOffset + 4;
          if (eapolLength >= 95 && descriptorOffset + 95 <= eapolOffset + 4 + eapolLength) {
            const uint8_t descriptorType = bytes[descriptorOffset];
            const uint16_t keyInfo =
              static_cast<uint16_t>(bytes[descriptorOffset + 1]) << 8 |
              static_cast<uint16_t>(bytes[descriptorOffset + 2]);
            const uint16_t keyLength =
              static_cast<uint16_t>(bytes[descriptorOffset + 3]) << 8 |
              static_cast<uint16_t>(bytes[descriptorOffset + 4]);
            const uint16_t keyDataLength =
              static_cast<uint16_t>(bytes[descriptorOffset + 93]) << 8 |
              static_cast<uint16_t>(bytes[descriptorOffset + 94]);

            headers[@"descriptorType"] = @(descriptorType);
            headers[@"keyInfo"] = @(keyInfo);
            headers[@"keyLength"] = @(keyLength);
            headers[@"keyDataLength"] = @(keyDataLength);
            headers[@"keyMicPresent"] = @((keyInfo & 0x0100) != 0);
            headers[@"keyEncrypted"] = @((keyInfo & 0x0400) != 0);
            headers[@"keyAck"] = @((keyInfo & 0x0010) != 0);
            headers[@"keyDescriptorVersion"] = @((keyInfo >> 12) & 0x0003);

            const NSInteger messageNumber = DetermineEapolMessage(keyInfo);
            if (messageNumber > 0) {
              headers[@"eapolMessage"] = @(messageNumber);
            }

            const size_t replayOffset = descriptorOffset + 5;
            const size_t nonceOffset = descriptorOffset + 13;
            const size_t ivOffset = descriptorOffset + 45;
            const size_t rscOffset = descriptorOffset + 61;
            const size_t idOffset = descriptorOffset + 69;
            const size_t micOffset = descriptorOffset + 77;
            const size_t keyDataOffset = descriptorOffset + 95;

            headers[@"replayCounter"] = HexString(bytes + replayOffset, 8);
            headers[@"keyNonce"] = HexString(bytes + nonceOffset, 32);
            headers[@"keyIV"] = HexString(bytes + ivOffset, 16);
            headers[@"keyRSC"] = HexString(bytes + rscOffset, 8);
            headers[@"keyID"] = HexString(bytes + idOffset, 8);

            if ((keyInfo & 0x0100) != 0) {
              headers[@"keyMIC"] = HexString(bytes + micOffset, 16);
            }

            if (keyDataLength > 0 && keyDataOffset + keyDataLength <= eapolOffset + 4 + eapolLength) {
              headers[@"keyData"] = HexString(bytes + keyDataOffset, keyDataLength);
            }
          }
        }
      }
    }
  }

  NSString *preview = @"";
  if (payloadOffset < data.length) {
    preview = HexPreview(bytes + payloadOffset, data.length - payloadOffset);
  }

  return @{ @"headers": headers, @"preview": preview };
}

+ (NSDictionary<NSString *, id> *)parseIPPacket:(NSData *)data {
  if (data.length == 0) {
    return @{ @"headers": @{}, @"preview": @"" };
  }

  const uint8_t *bytes = static_cast<const uint8_t *>(data.bytes);
  const uint8_t version = bytes[0] >> 4;

  if (version == 4) {
    return ParseIPv4Packet(bytes, data.length);
  }

  if (version == 6) {
    return ParseIPv6Packet(bytes, data.length);
  }

  return @{ @"headers": @{}, @"preview": HexPreview(bytes, data.length) };
}

+ (NSString *)hexPreviewForData:(NSData *)data {
  if (data.length == 0) {
    return @"";
  }

  const uint8_t *bytes = static_cast<const uint8_t *>(data.bytes);
  return HexPreview(bytes, data.length);
}

@end
