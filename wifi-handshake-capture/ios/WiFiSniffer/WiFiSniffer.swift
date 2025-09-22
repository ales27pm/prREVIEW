import CoreLocation
import Foundation
import Network
import NetworkExtension
import React
import Security
import SystemConfiguration.CaptiveNetwork

@objc(WiFiSniffer)
class WiFiSniffer: RCTEventEmitter, CLLocationManagerDelegate {
  private struct ActiveNetwork {
    let ssid: String
    let bssid: String
    let channel: Int
    let security: String
    let signal: Int
  }

  private let locationManager = CLLocationManager()
  private let captureQueue = DispatchQueue(label: "com.wifihandshake.capture", qos: .utility)
  private var pathMonitor: NWPathMonitor?
  private var handshakeTimer: DispatchSourceTimer?
  private var isObserving = false
  private var activeNetwork: ActiveNetwork?
  private var replayCounter: UInt64 = 1

  override init() {
    super.init()
    locationManager.delegate = self
  }

  override class func requiresMainQueueSetup() -> Bool {
    false
  }

  override func supportedEvents() -> [String]! {
    ["networkStatus", "packetCaptured", "locationPermission"]
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
  func scanNetworks(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    requestLocationIfNeeded()

    let status = currentAuthorizationStatus()
    guard status == .authorizedWhenInUse || status == .authorizedAlways else {
      reject("PERMISSION_ERROR", "Location permission required for WiFi scanning", nil)
      return
    }

    if #available(iOS 14.0, *) {
      NEHotspotNetwork.fetchCurrent { [weak self] network in
        guard let self = self else { return }

        var results: [[String: Any]] = []
        if let network = network {
          let context = self.serializeHotspotNetwork(network)
          self.activeNetwork = context
          results.append(self.exportDictionary(from: context))
        } else if let fallback = self.associatedNetworkFromCaptiveNetwork() {
          self.activeNetwork = fallback
          results.append(self.exportDictionary(from: fallback))
        }

        resolve(results)
      }
      return
    }

    if let fallback = associatedNetworkFromCaptiveNetwork() {
      activeNetwork = fallback
      resolve([exportDictionary(from: fallback)])
    } else {
      resolve([])
    }
  }

  private func exportDictionary(from network: ActiveNetwork) -> [String: Any] {
    [
      "ssid": network.ssid,
      "bssid": network.bssid,
      "channel": network.channel,
      "security": network.security,
      "signal": network.signal,
    ]
  }

  private func parseNetworkDictionary(_ network: NSDictionary?) -> ActiveNetwork? {
    guard let dictionary = network as? [String: Any] else { return nil }
    guard
      let ssid = dictionary["ssid"] as? String,
      let bssid = dictionary["bssid"] as? String
    else {
      return nil
    }

    let channel = dictionary["channel"] as? Int ?? 0
    let security = dictionary["security"] as? String ?? "Unknown"
    let signal = dictionary["signal"] as? Int ?? -127

    return ActiveNetwork(
      ssid: ssid,
      bssid: bssid.uppercased(),
      channel: channel,
      security: security,
      signal: normalizeSignal(signal)
    )
  }

  private func associatedNetworkFromCaptiveNetwork() -> ActiveNetwork? {
    guard let interfaces = CNCopySupportedInterfaces() as? [String] else { return nil }

    for interface in interfaces {
      guard
        let info = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any],
        let ssid = info[kCNNetworkInfoKeySSID as String] as? String,
        let bssid = info[kCNNetworkInfoKeyBSSID as String] as? String
      else {
        continue
      }

      let channel = info["CHANNEL"] as? Int ?? 0
      let security = info["SecurityType"] as? String ?? "Unknown"
      let signal = info["RSSI"] as? Int ?? -127

      return ActiveNetwork(
        ssid: ssid,
        bssid: bssid.uppercased(),
        channel: channel,
        security: security,
        signal: normalizeSignal(signal)
      )
    }

    return nil
  }

  @available(iOS 14.0, *)
  private func serializeHotspotNetwork(_ network: NEHotspotNetwork) -> ActiveNetwork {
    let security = securityDescription(for: network.securityType)
    let signalValue = Int((network.signalStrength * 60.0) - 90.0)
    let bssid = (network.bssid ?? "00:00:00:00:00:00").uppercased()

    return ActiveNetwork(
      ssid: network.ssid,
      bssid: bssid,
      channel: network.channelNumber,
      security: security,
      signal: normalizeSignal(signalValue)
    )
  }

  @available(iOS 14.0, *)
  private func securityDescription(for type: NEHotspotNetwork.SecurityType) -> String {
    switch type {
    case .open:
      return "Open"
    case .wep:
      return "WEP"
    case .wpaPersonal:
      return "WPA"
    case .wpa2Personal:
      return "WPA2"
    case .wpa3Personal:
      return "WPA3"
    case .wpaEnterprise:
      return "WPA Enterprise"
    case .wpa2Enterprise:
      return "WPA2 Enterprise"
    case .unknown:
      fallthrough
    @unknown default:
      return "Unknown"
    }
  }

  private func normalizeSignal(_ value: Int) -> Int {
    if value == Int.min {
      return -127
    }
    return max(-127, min(value, -20))
  }

  @objc(startCapture:network:resolver:rejecter:)
  func startCapture(
    _ interfaceName: String,
    network: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if let parsed = parseNetworkDictionary(network) {
      activeNetwork = parsed
    } else if activeNetwork == nil {
      activeNetwork = associatedNetworkFromCaptiveNetwork()
    }

    replayCounter = 1

    pathMonitor?.cancel()
    let monitor = NWPathMonitor(requiredInterfaceType: .wifi)
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self = self, self.isObserving else { return }
      let info: [String: Any] = [
        "available": path.status == .satisfied,
        "interfaceType": path.usesInterfaceType(.wifi) ? "WiFi" : "Other",
        "isExpensive": path.isExpensive,
        "timestamp": Date().timeIntervalSince1970,
      ]
      self.sendEvent(withName: "networkStatus", body: info)
    }
    monitor.start(queue: captureQueue)
    pathMonitor = monitor

    scheduleSimulatedPackets()
    resolve("Capture started")
  }

  private func scheduleSimulatedPackets() {
    handshakeTimer?.cancel()
    handshakeTimer = nil

    guard activeNetwork != nil else {
      return
    }

    emitHandshakeSequence()

    let timer = DispatchSource.makeTimerSource(queue: captureQueue)
    timer.schedule(deadline: .now() + 5, repeating: 5)
    timer.setEventHandler { [weak self] in
      self?.emitHandshakeSequence()
    }
    timer.resume()
    handshakeTimer = timer
  }

  private func emitHandshakeSequence() {
    guard isObserving, let network = activeNetwork else { return }

    let client = randomClientMac()
    let baseTimestamp = Date().timeIntervalSince1970
    let messages = [1, 2, 3, 4]

    for (index, message) in messages.enumerated() {
      let delay = Double(index) * 0.2
      captureQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self = self, self.isObserving else { return }
        let (frame, counter) = self.buildHandshakeFrame(message: message, bssid: network.bssid, client: client)
        let payload: [String: Any] = [
          "timestamp": baseTimestamp + delay,
          "type": "EAPOL",
          "bssid": network.bssid,
          "clientMac": client,
          "data": self.base64(from: frame),
          "message": message,
          "ssid": network.ssid,
          "channel": network.channel,
          "signal": network.signal,
          "security": network.security,
          "replayCounter": Int(counter),
        ]
        self.sendEvent(withName: "packetCaptured", body: payload)
      }
    }

    captureQueue.asyncAfter(deadline: .now() + 1.0) { [weak self] in
      guard let self = self, self.isObserving, let network = self.activeNetwork else { return }
      let beacon = self.buildBeaconFrame(for: network)
      let payload: [String: Any] = [
        "timestamp": baseTimestamp + 1.0,
        "type": "BEACON",
        "bssid": network.bssid,
        "clientMac": network.bssid,
        "data": self.base64(from: beacon),
        "ssid": network.ssid,
        "channel": network.channel,
        "signal": network.signal,
        "security": network.security,
      ]
      self.sendEvent(withName: "packetCaptured", body: payload)
    }
  }

  private func nextReplayCounter() -> UInt64 {
    let value = replayCounter
    replayCounter &+= 1
    return value
  }

  private func buildHandshakeFrame(message: Int, bssid: String, client: String) -> (Data, UInt64) {
    let counter = nextReplayCounter()
    var frame = Data()

    let clientBytes = macBytes(from: client)
    let bssidBytes = macBytes(from: bssid)

    frame.append(contentsOf: [0x88, 0x02])
    frame.append(contentsOf: [0x00, 0x00])
    frame.append(contentsOf: clientBytes)
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: [0x10, 0x00])
    frame.append(contentsOf: [0xaa, 0xaa, 0x03, 0x00, 0x00, 0x00])
    frame.append(contentsOf: [0x88, 0x8e])
    frame.append(contentsOf: eapolPayload(for: message, replayCounter: counter))

    return (frame, counter)
  }

  private func eapolPayload(for message: Int, replayCounter: UInt64) -> [UInt8] {
    var payload = [UInt8](repeating: 0, count: 4)
    payload[0] = 0x02
    payload[1] = 0x03

    var keyFrame: [UInt8] = []
    keyFrame.append(0x02)
    keyFrame.append(contentsOf: bigEndianBytes(keyInformation(for: message)))
    keyFrame.append(contentsOf: bigEndianBytes(UInt16(16)))
    keyFrame.append(contentsOf: bigEndianBytes(replayCounter))
    keyFrame.append(contentsOf: randomBytes(count: 32))
    keyFrame.append(contentsOf: randomBytes(count: 16))
    keyFrame.append(contentsOf: [UInt8](repeating: 0, count: 8))
    keyFrame.append(contentsOf: [UInt8](repeating: 0, count: 8))

    if message == 1 {
      keyFrame.append(contentsOf: [UInt8](repeating: 0, count: 16))
    } else {
      keyFrame.append(contentsOf: randomBytes(count: 16))
    }

    let keyData: [UInt8]
    if message == 3 {
      keyData = rsnInformationElement()
    } else {
      keyData = []
    }

    keyFrame.append(contentsOf: bigEndianBytes(UInt16(keyData.count)))
    keyFrame.append(contentsOf: keyData)

    let length = UInt16(keyFrame.count)
    payload[2] = UInt8((length >> 8) & 0xff)
    payload[3] = UInt8(length & 0xff)

    payload.append(contentsOf: keyFrame)
    return payload
  }

  private func keyInformation(for message: Int) -> UInt16 {
    switch message {
    case 1:
      return 0x008a
    case 2:
      return 0x010a
    case 3:
      return 0x13ca
    case 4:
      return 0x030a
    default:
      return 0x010a
    }
  }

  private func rsnInformationElement() -> [UInt8] {
    [
      0x30, 0x14,
      0x01, 0x00,
      0x00, 0x0f, 0xac, 0x04,
      0x01, 0x00,
      0x00, 0x0f, 0xac, 0x04,
      0x01, 0x00,
      0x00, 0x0f, 0xac, 0x02,
      0x00, 0x00,
    ]
  }

  private func buildBeaconFrame(for network: ActiveNetwork) -> Data {
    var frame = Data()
    let bssidBytes = macBytes(from: network.bssid)
    let timestamp = randomBytes(count: 8)
    let ssidData = network.ssid.data(using: .utf8) ?? Data()
    let ssidLength = UInt8(min(ssidData.count, 32))
    let rates: [UInt8] = [0x82, 0x84, 0x8b, 0x96, 0x12, 0x24, 0x48, 0x6c]

    frame.append(contentsOf: [0x80, 0x00])
    frame.append(contentsOf: [0x00, 0x00])
    frame.append(contentsOf: [UInt8](repeating: 0xff, count: 6))
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: [0x00, 0x00])
    frame.append(contentsOf: timestamp)
    frame.append(contentsOf: [0x64, 0x00])
    frame.append(contentsOf: [0x31, 0x04])

    frame.append(0x00)
    frame.append(ssidLength)
    frame.append(contentsOf: ssidData.prefix(32))

    frame.append(0x01)
    frame.append(UInt8(rates.count))
    frame.append(contentsOf: rates)

    frame.append(0x03)
    frame.append(0x01)
    frame.append(clampChannel(network.channel))

    frame.append(contentsOf: rsnInformationElement())

    return frame
  }

  private func buildDeauthFrame(bssid: String, client: String, reason: UInt16) -> Data {
    var frame = Data()
    let clientBytes = macBytes(from: client)
    let bssidBytes = macBytes(from: bssid)

    frame.append(contentsOf: [0xc0, 0x00])
    frame.append(contentsOf: [0x00, 0x00])
    frame.append(contentsOf: clientBytes)
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: bssidBytes)
    frame.append(contentsOf: [0x10, 0x00])
    frame.append(contentsOf: littleEndianBytes(reason))

    return frame
  }

  private func macBytes(from address: String) -> [UInt8] {
    let parts = address.split(separator: ":")
    guard parts.count == 6 else {
      return [UInt8](repeating: 0, count: 6)
    }

    return parts.map { part in
      UInt8(part, radix: 16) ?? 0
    }
  }

  private func randomClientMac() -> String {
    let bytes = randomBytes(count: 6)
    return bytes.map { String(format: "%02X", $0) }.joined(separator: ":")
  }

  private func randomBytes(count: Int) -> [UInt8] {
    var data = [UInt8](repeating: 0, count: count)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &data)
    if status != errSecSuccess {
      for index in 0..<count {
        data[index] = UInt8.random(in: 0...255)
      }
    }
    return data
  }

  private func base64(from data: Data) -> String {
    data.base64EncodedString()
  }

  private func clampChannel(_ channel: Int) -> UInt8 {
    if channel <= 0 {
      return 0
    }
    return UInt8(max(1, min(channel, 165)))
  }

  private func bigEndianBytes<T: FixedWidthInteger>(_ value: T) -> [UInt8] {
    var mutableValue = value.bigEndian
    return withUnsafeBytes(of: &mutableValue) { Array($0) }
  }

  private func littleEndianBytes<T: FixedWidthInteger>(_ value: T) -> [UInt8] {
    var mutableValue = value.littleEndian
    return withUnsafeBytes(of: &mutableValue) { Array($0) }
  }

  @objc(stopCapture:rejecter:)
  func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    pathMonitor?.cancel()
    pathMonitor = nil
    handshakeTimer?.cancel()
    handshakeTimer = nil
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
    guard isObserving else {
      resolve(false)
      return
    }

    let iterations = max(1, count.intValue)
    let targetBssid = (bssid.isEmpty ? activeNetwork?.bssid ?? "FF:FF:FF:FF:FF:FF" : bssid).uppercased()
    let targetClient = (clientMac.isEmpty ? randomClientMac() : clientMac).uppercased()

    for index in 0..<iterations {
      let delay = Double(index) * 0.05
      captureQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self = self, self.isObserving else { return }
        let frame = self.buildDeauthFrame(bssid: targetBssid, client: targetClient, reason: 7)
        let payload: [String: Any] = [
          "timestamp": Date().timeIntervalSince1970 + delay,
          "type": "DEAUTH",
          "bssid": targetBssid,
          "clientMac": targetClient,
          "data": self.base64(from: frame),
          "reasonCode": 7,
          "count": iterations,
          "ssid": self.activeNetwork?.ssid ?? "",
          "channel": self.activeNetwork?.channel ?? 0,
          "signal": self.activeNetwork?.signal ?? -127,
          "security": self.activeNetwork?.security ?? "Unknown",
        ]
        self.sendEvent(withName: "packetCaptured", body: payload)
      }
    }

    resolve(true)
  }

  override func startObserving() {
    isObserving = true
  }

  override func stopObserving() {
    isObserving = false
    handshakeTimer?.cancel()
    handshakeTimer = nil
  }

  func locationManager(
    _ manager: CLLocationManager,
    didChangeAuthorization status: CLAuthorizationStatus
  ) {
    guard isObserving else { return }

    let statusString: String
    switch status {
    case .authorizedAlways, .authorizedWhenInUse:
      statusString = "granted"
    case .denied, .restricted:
      statusString = "denied"
    default:
      statusString = "unknown"
    }

    sendEvent(withName: "locationPermission", body: ["status": statusString])
  }
}
