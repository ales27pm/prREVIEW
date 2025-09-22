import CoreLocation
import Foundation
import Network
import React

@objc(WiFiSniffer)
class WiFiSniffer: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let captureQueue = DispatchQueue(label: "com.wifihandshake.capture", qos: .utility)
  private var pathMonitor: NWPathMonitor?
  private var isObserving = false

  override init() {
    super.init()
    locationManager.delegate = self
  }

  override class func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    ["networkStatus", "packetCaptured", "locationPermission", "handshakeComplete"]
  }

  private func emitOnMain(_ name: String, body: Any?) {
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent(withName: name, body: body)
    }
  }

  private func currentAuthorizationStatus() -> CLAuthorizationStatus {
    if #available(iOS 14.0, *) {
      return locationManager.authorizationStatus
    } else {
      return CLLocationManager.authorizationStatus()
    }
  }

  private func requestLocationIfNeeded() {
    if currentAuthorizationStatus() == .notDetermined {
      DispatchQueue.main.async {
        self.locationManager.requestWhenInUseAuthorization()
      }
    }
  }

  @objc(scanNetworks:rejecter:)
  func scanNetworks(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    requestLocationIfNeeded()

    let status = currentAuthorizationStatus()
    guard status == .authorizedWhenInUse || status == .authorizedAlways else {
      reject("PERMISSION_ERROR", "Location permission required for WiFi scanning", nil)
      return
    }

    let simulatedNetworks: [[String: Any]] = [
      [
        "bssid": "AA:BB:CC:DD:EE:FF",
        "ssid": "Office WiFi",
        "signal": -55,
        "channel": 1,
        "security": "WPA2",
      ],
      [
        "bssid": "11:22:33:44:55:66",
        "ssid": "Lab",
        "signal": -68,
        "channel": 6,
        "security": "WPA3",
      ],
    ]

    resolve(simulatedNetworks)
  }

  @objc(startCapture:resolver:rejecter:)
  func startCapture(
    _ interfaceName: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    pathMonitor?.cancel()
    let monitor = NWPathMonitor(requiredInterfaceType: .wifi)
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self = self, self.isObserving else { return }
      let info: [String: Any] = [
        "available": path.status == .satisfied,
        "interfaceType": path.usesInterfaceType(.wifi) ? "WiFi" : "Other",
        "isExpensive": path.isExpensive,
      ]
      self.emitOnMain("networkStatus", body: info)
    }
    monitor.start(queue: captureQueue)
    pathMonitor = monitor

    scheduleSimulatedPackets()
    resolve("Capture started")
  }

  private func scheduleSimulatedPackets() {
    let packets: [[String: Any]] = [
      [
        "timestamp": Date().timeIntervalSince1970,
        "type": "EAPOL",
        "bssid": "AA:BB:CC:DD:EE:FF",
        "clientMac": "11:22:33:44:55:66",
        "data": "base64packet1",
        "message": 1,
      ],
      [
        "timestamp": Date().timeIntervalSince1970 + 0.1,
        "type": "EAPOL",
        "bssid": "AA:BB:CC:DD:EE:FF",
        "clientMac": "11:22:33:44:55:66",
        "data": "base64packet2",
        "message": 2,
      ],
      [
        "timestamp": Date().timeIntervalSince1970 + 0.2,
        "type": "EAPOL",
        "bssid": "AA:BB:CC:DD:EE:FF",
        "clientMac": "11:22:33:44:55:66",
        "data": "base64packet3",
        "message": 3,
      ],
      [
        "timestamp": Date().timeIntervalSince1970 + 0.3,
        "type": "EAPOL",
        "bssid": "AA:BB:CC:DD:EE:FF",
        "clientMac": "11:22:33:44:55:66",
        "data": "base64packet4",
        "message": 4,
      ],
    ]

    for (index, packet) in packets.enumerated() {
      captureQueue.asyncAfter(deadline: .now() + .seconds(index)) { [weak self] in
        guard let self = self, self.isObserving else { return }
        self.emitOnMain("packetCaptured", body: packet)
      }
    }
  }

  @objc(stopCapture:rejecter:)
  func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    pathMonitor?.cancel()
    pathMonitor = nil
    resolve("Capture stopped")
  }

  @objc(sendDeauth:clientMac:count:resolver:rejecter:)
  func sendDeauth(
    _ bssid: String,
    clientMac: String,
    count: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    captureQueue.asyncAfter(deadline: .now() + 0.2) { [weak self] in
      guard let self = self, self.isObserving else {
        DispatchQueue.main.async {
          resolve(false)
        }
        return
      }

      let packet: [String: Any] = [
        "timestamp": Date().timeIntervalSince1970,
        "type": "DEAUTH",
        "bssid": bssid,
        "clientMac": clientMac,
        "data": "deauth-base64-packet",
        "count": count.intValue,
      ]
      self.emitOnMain("packetCaptured", body: packet)
      DispatchQueue.main.async {
        resolve(true)
      }
    }
  }

  override func startObserving() {
    isObserving = true
  }

  override func stopObserving() {
    isObserving = false
  }

  private func permissionStatusString(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .authorizedAlways, .authorizedWhenInUse:
      return "granted"
    case .denied, .restricted:
      return "denied"
    default:
      return "unknown"
    }
  }

  func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    guard isObserving else { return }
    emitOnMain("locationPermission", body: ["status": permissionStatusString(status)])
  }

  @available(iOS 14.0, *)
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard isObserving else { return }
    emitOnMain(
      "locationPermission",
      body: ["status": permissionStatusString(manager.authorizationStatus)]
    )
  }
}
