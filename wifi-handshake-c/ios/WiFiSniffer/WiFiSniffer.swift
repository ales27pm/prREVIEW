import CoreLocation
import Foundation
import Network
import NetworkExtension
import React
import SystemConfiguration.CaptiveNetwork

@objc(WiFiSniffer)
class WiFiSniffer: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let captureQueue = DispatchQueue(label: "com.wifihandshake.capture", qos: .utility)
  private var pathMonitor: NWPathMonitor?
  private var isObserving = false
  private var currentChannel: Int = 1
  private var capturedPacketCount: Int = 0
  private var captureStartTimestamp: TimeInterval?

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

    fetchCurrentNetworks { networks in
      if networks.isEmpty {
        resolve(self.simulatedNetworks())
      } else {
        resolve(networks)
      }
    }
  }

  @objc(startCapture:channel:resolver:rejecter:)
  func startCapture(
    _ interfaceName: String,
    channel: NSNumber,
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

    currentChannel = max(1, channel.intValue)
    capturedPacketCount = 0
    captureStartTimestamp = Date().timeIntervalSince1970

    emitOnMain(
      "networkStatus",
      body: [
        "available": true,
        "interfaceType": "WiFi",
        "isExpensive": false,
      ]
    )

    scheduleSimulatedPackets()
    resolve(true)
  }

  private func scheduleSimulatedPackets() {
    let frames: [(message: Int, data: String, fromAp: Bool)] = [
      (
        1,
        "CAAAOhEiM0RVZqq7zN3u/6q7zN3u/xAAqqoDAAAAiI4CAwBkABgAAAAAAAAAAAABISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEAAAAAAAAAAAA" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAUAQAAD6wEAQAAD6wEAQAAD6wCAAAAAA==",
        true
      ),
      (
        2,
        "CAAAOqq7zN3u/xEiM0RVZqq7zN3u/xAAqqoDAAAAiI4CAwB0AQkAEAAAAAAAAAACIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIAAAAAA" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKurq6urq6urq6urq6urq6swFAEAAA+sBAEAAA+sBAEAAA+sAgAAAAA=",
        false
      ),
      (
        3,
        "CAAAOhEiM0RVZqq7zN3u/6q7zN3u/xAAqqoDAAAAiI4CAwB0ARkAEAAAAAAAAAADIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMAAAAAAAAAAAA" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKurq6urq6urq6urq6urq6swFAEAAA+sBAEAAA+sBAEAAA+sAgAAAAA=",
        true
      ),
      (
        4,
        "CAAAOqq7zN3u/xEiM0RVZqq7zN3u/xAAqqoDAAAAiI4CAwB0AQsAEAAAAAAAAAAEJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQAAAAAAAAAAAA" +
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKurq6urq6urq6urq6urq6swFAEAAA+sBAEAAA+sBAEAAA+sAgAAAAA=",
        false
      ),
    ]

    let bssid = "AA:BB:CC:DD:EE:FF"
    let clientMac = "11:22:33:44:55:66"
    let ssid = "Simulated Lab"
    let start = Date().timeIntervalSince1970
    var handshakePackets: [[String: Any]] = []

    for (index, frame) in frames.enumerated() {
      captureQueue.asyncAfter(deadline: .now() + .milliseconds(index * 600)) { [weak self] in
        guard let self = self, self.isObserving else { return }
        let timestamp = start + Double(index) * 0.6
        let rawData = Data(base64Encoded: frame.data) ?? Data()
        let signal = frame.fromAp ? -52 : -55
        let packet: [String: Any] = [
          "timestamp": timestamp,
          "type": "EAPOL",
          "bssid": bssid,
          "source": frame.fromAp ? bssid : clientMac,
          "destination": frame.fromAp ? clientMac : bssid,
          "clientMac": clientMac,
          "data": frame.data,
          "signal": signal,
          "channel": self.currentChannel,
          "rawLength": rawData.count,
          "message": frame.message,
        ]

        handshakePackets.append(packet)
        self.capturedPacketCount += 1
        self.emitOnMain("packetCaptured", body: packet)

        if index == frames.count - 1 {
          self.emitSimulatedHandshake(
            packets: handshakePackets,
            ssid: ssid,
            bssid: bssid,
            clientMac: clientMac,
            averageSignal: -53,
            timestamp: timestamp
          )
        }
      }
    }
  }

  private func emitSimulatedHandshake(
    packets: [[String: Any]],
    ssid: String,
    bssid: String,
    clientMac: String,
    averageSignal: Int,
    timestamp: Double
  ) {
    guard isObserving else { return }

    let handshake: [String: Any] = [
      "bssid": bssid,
      "clientMac": clientMac,
      "timestamp": timestamp,
      "packets": packets,
      "isComplete": true,
      "apMac": bssid,
      "ssid": ssid,
      "securityType": "WPA2-PSK",
      "channel": currentChannel,
      "signal": averageSignal,
      "keyVersion": 2,
      "groupCipher": "CCMP",
      "pairwiseCipher": "CCMP",
      "authKeyManagement": ["PSK"],
      "isCrackable": true,
      "crackComplexity": "Medium",
    ]

    emitOnMain("handshakeComplete", body: handshake)
  }
  @objc(stopCapture:rejecter:)
  func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    pathMonitor?.cancel()
    pathMonitor = nil
    captureStartTimestamp = nil
    resolve(true)
  }

  @objc(getInterfaceStats:rejecter:)
  func getInterfaceStats(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let captureStartedAt: Any = captureStartTimestamp.map { $0 } ?? NSNull()

    let stats: [String: Any] = [
      "interfaceName": "en0",
      "channel": currentChannel,
      "frequency": frequency(for: currentChannel),
      "capturedPackets": capturedPacketCount,
      "droppedPackets": 0,
      "lastUpdated": Date().timeIntervalSince1970,
      "captureStartedAt": captureStartedAt,
    ]

    resolve(stats)
  }

  @objc(setChannel:resolver:rejecter:)
  func setChannel(
    _ channel: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    currentChannel = max(1, channel.intValue)
    resolve(true)
  }

  @objc(sendDeauth:clientMac:count:resolver:rejecter:)
  func sendDeauth(
    _ bssid: String,
    clientMac: String,
    count: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    captureQueue.async { [weak self] in
      guard let self = self, self.isObserving else {
        DispatchQueue.main.async {
          resolve(false)
        }
        return
      }

      let transmissions = max(1, count.intValue)
        for attempt in 0..<transmissions {
          let delay = DispatchTimeInterval.milliseconds(attempt * 120)
          self.captureQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, self.isObserving else { return }
            let payload: [String: Any] = [
              "timestamp": Date().timeIntervalSince1970,
              "type": "DEAUTH",
              "bssid": bssid,
              "clientMac": clientMac,
              "count": transmissions,
              "sequence": attempt + 1,
            ]
            self.capturedPacketCount += 1
            self.emitOnMain("packetCaptured", body: payload)
          }
        }

      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(transmissions * 120 + 50)) {
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

extension WiFiSniffer {
  private func fetchCurrentNetworks(completion: @escaping ([[String: Any]]) -> Void) {
    var results = networksFromCaptive()

    guard #available(iOS 14.0, *) else {
      completion(results)
      return
    }

    NEHotspotNetwork.fetchCurrent { network in
      if let network = network {
        var entry: [String: Any] = [
          "bssid": network.bssid,
          "ssid": network.ssid,
          "signal": self.signalStrengthToDbm(network.signalStrength),
          "channel": network.channelNumber,
          "security": network.isSecure ? "Secured" : "Open",
          "frequency": self.frequency(for: network.channelNumber),
          "capabilities": network.isSecure ? "802.11 security enabled" : "802.11 open",
        ]

        if let autoJoin = network.didAutoJoin { entry["autoJoin"] = autoJoin }
        if let cachedIndex = results.firstIndex(where: { ($0["bssid"] as? String) == network.bssid }) {
          results[cachedIndex] = entry
        } else {
          results.append(entry)
        }
      }

      completion(results)
    }
  }

  private func networksFromCaptive() -> [[String: Any]] {
    guard let interfaces = CNCopySupportedInterfaces() as? [String] else {
      return []
    }

    return interfaces.compactMap { interfaceName -> [String: Any]? in
      guard
        let info = CNCopyCurrentNetworkInfo(interfaceName as CFString) as NSDictionary?,
        let ssid = info[kCNNetworkInfoKeySSID as String] as? String,
        let bssid = info[kCNNetworkInfoKeyBSSID as String] as? String
      else {
        return nil
      }

      return [
        "bssid": bssid,
        "ssid": ssid,
        "signal": -62,
        "channel": 0,
        "security": "Unknown",
        "frequency": 0,
        "capabilities": "802.11",
      ]
    }
  }

  private func simulatedNetworks() -> [[String: Any]] {
    return [
      [
        "bssid": "AA:BB:CC:DD:EE:FF",
        "ssid": "Simulated Lab",
        "signal": -55,
        "channel": 1,
        "security": "WPA2",
        "frequency": 2412,
        "capabilities": "WPA2-PSK CCMP",
      ],
      [
        "bssid": "11:22:33:44:55:66",
        "ssid": "Simulated Field",
        "signal": -67,
        "channel": 44,
        "security": "WPA3",
        "frequency": 5220,
        "capabilities": "WPA3-SAE GCMP",
      ],
    ]
  }

  private func signalStrengthToDbm(_ strength: Double) -> Int {
    let clamped = max(0.0, min(1.0, strength))
    return Int(round(clamped * 50.0)) - 100
  }

  private func frequency(for channel: Int) -> Int {
    if channel == 0 {
      return 0
    }

    if channel <= 14 {
      return 2407 + channel * 5
    }

    return 5000 + channel * 5
  }
}
