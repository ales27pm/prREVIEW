#import "PacketParser.h"

#include <algorithm>
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

@end
