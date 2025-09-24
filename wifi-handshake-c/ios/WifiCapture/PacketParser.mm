#import "PacketParser.h"

#include <algorithm>
#include <arpa/inet.h>
#include <iomanip>
#include <sstream>

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
  headers[@"type"] = TypeString(type, subtype);
  headers[@"duration"] = @(CFSwapInt16LittleToHost(header->durationId));
  headers[@"addr1"] = MacString(header->address1);
  headers[@"addr2"] = MacString(header->address2);
  headers[@"addr3"] = MacString(header->address3);
  headers[@"sequenceControl"] = @(CFSwapInt16LittleToHost(header->sequenceControl));

  size_t payloadOffset = frameOffset + sizeof(IEEE80211Header);
  if (toDS && fromDS) {
    if (remainingLength >= sizeof(IEEE80211Header) + 6) {
      const uint8_t *addr4 = bytes + frameOffset + sizeof(IEEE80211Header);
      headers[@"addr4"] = MacString(addr4);
      payloadOffset += 6;
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
