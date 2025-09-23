#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PacketParser : NSObject
+ (NSDictionary<NSString *, id> *)parse:(NSData *)data;
@end

NS_ASSUME_NONNULL_END
