#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PacketParser : NSObject
+ (NSDictionary<NSString *, id> *)parse:(NSData *)data;
+ (NSDictionary<NSString *, id> *)parseIPPacket:(NSData *)data;
+ (NSString *)hexPreviewForData:(NSData *)data;
@end

NS_ASSUME_NONNULL_END
