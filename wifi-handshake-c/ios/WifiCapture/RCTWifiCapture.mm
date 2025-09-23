#import "RCTWifiCapture.h"

#import <React/RCTBridge.h>
#import <React/RCTBridge+Private.h>
#import <React/RCTConvert.h>

#import "WiFiHandshakeCapture-Swift.h"

#ifdef RCT_NEW_ARCH_ENABLED
#import "WifiCaptureSpec.h"
#endif

@implementation RCTWifiCapture {
  WifiCaptureImpl *_impl;
}

RCT_EXPORT_MODULE(WifiCapture)

- (instancetype)init {
  if ((self = [super init])) {
    _impl = [WifiCaptureImpl shared];
    [_impl attachWithEmitter:self];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"onDeepPacket" ];
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWifiCaptureSpecJSI>(params);
}
#endif

#pragma mark - Legacy surface

RCT_EXPORT_METHOD(scan:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl scanWithResolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(start:(NSString *)interfaceName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl startWithInterface:interfaceName resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl stopWithResolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(deauth:(NSString *)bssid
                  channel:(nonnull NSNumber *)channel
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl deauthWithBssid:bssid channel:channel resolve:resolve reject:reject];
}

#pragma mark - Deep capture

RCT_EXPORT_METHOD(startDeepCapture:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSNumber *portValue = options[@"udpPort"];
  NSString *filter = options[@"filter"];
  [_impl startDeepCaptureWithPort:portValue filter:filter resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stopDeepCapture:(NSString *)sessionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl stopDeepCaptureWithSession:sessionId resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getCaptureStats:(NSString *)sessionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl statsForSession:sessionId resolve:resolve reject:reject];
}

@end
