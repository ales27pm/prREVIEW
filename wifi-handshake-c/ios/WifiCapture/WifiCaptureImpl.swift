import CoreWLAN
import Darwin
import Foundation
import Network
import NetworkExtension
import os.log
import React
#if canImport(UIKit)
  import UIKit
#endif

@objcMembers
final class WifiCaptureImpl: NSObject {
  static let shared = WifiCaptureImpl()

  private weak var eventEmitter: RCTEventEmitter?
  private let logger = Logger(subsystem: "WifiCapture", category: "Impl")
  private let queue: DispatchQueue
  private let queueKey = DispatchSpecificKey<Void>()

  private let maxRetries = 3
  private let baseRetryDelay: TimeInterval = 1.0
  private let tunnelTimeout: TimeInterval = 10.0

  private var tunnelManager: NETunnelProviderManager?
  private var currentSessionId: String?
  private var currentPort: UInt16 = 0
  private var udpListener: NWListener?
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private var stats = CaptureStats()
  private var filterString: String?
  private var filterData: Data?
  private var handshakeInterface: String?
  private var advancedScanEnabled = false
  private var scanCache: [String: CachedNetwork] = [:]
  private let scanCacheExpiration: TimeInterval = 300
  private var tetheredCaptureStart: Date?
  private var tetheredDeviceIdentifier: String?
  private let rviImporter = RVICaptureImporter()
  private lazy var cachedExtensionBundleIdentifier: String? = Self.locateExtensionBundleIdentifier()

  private override init() {
    queue = DispatchQueue(label: "WifiCapture.DeepCapture", qos: .utility)
    super.init()
    queue.setSpecific(key: queueKey, value: ())
  }

  func attachWithEmitter(_ emitter: RCTEventEmitter) {
    eventEmitter = emitter
  }

  // MARK: - Legacy API

  func scan(withResolve resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    queue.async { [weak self] in
      guard let self else { return }

      guard let interface = CWWiFiClient.shared().interface() else {
        self.logger.error("Scan failed: interface unavailable")
        let cached = self.buildScanPayload(includeCacheOnly: true)
        DispatchQueue.main.async {
          if self.advancedScanEnabled, !cached.isEmpty {
            resolve(cached)
          } else {
            reject("NO_INTERFACE", "Unable to access Wi-Fi interface", nil)
          }
        }
        return
      }

      guard interface.powerOn() else {
        self.logger.error("Scan failed: Wi-Fi interface is powered off")
        let cached = self.buildScanPayload(includeCacheOnly: true)
        DispatchQueue.main.async {
          if self.advancedScanEnabled, !cached.isEmpty {
            resolve(cached)
          } else {
            reject("INTERFACE_POWERED_OFF", "Wi-Fi interface is powered off", nil)
          }
        }
        return
      }

      do {
        let networks = try interface.scanForNetworks(withName: nil)
        let latest = self.cacheNetworks(from: networks)
        let payload = self.buildScanPayload(includeCacheOnly: false, latest: latest)
        DispatchQueue.main.async {
          resolve(payload)
        }
      } catch {
        self.logger.error(
          "Scan failed: \(error.localizedDescription, privacy: .public)"
        )
        let cached = self.buildScanPayload(includeCacheOnly: true)
        DispatchQueue.main.async {
          if self.advancedScanEnabled, !cached.isEmpty {
            resolve(cached)
          } else {
            reject("SCAN_ERROR", error.localizedDescription, error)
          }
        }
      }
    }
  }

  func start(withInterface interfaceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let interfaces = CWWiFiClient.shared().interfaces(),
          interfaces.contains(where: { $0.interfaceName == interfaceName }) else {
      reject("INTERFACE_NOT_FOUND", "Interface \(interfaceName) not available", nil)
      return
    }

    handshakeInterface = interfaceName
    resolve(true)
  }

  func stop(withResolve resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard handshakeInterface != nil else {
      resolve(true)
      return
    }

    performOnQueue(wait: true) {
      self.handshakeInterface = nil
      self.scanCache.removeAll()
      self.tetheredCaptureStart = nil
    }
    resolve(true)
  }

  func deauth(withBssid bssid: String, channel: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    reject("UNSUPPORTED", "802.11 frame injection is not supported by public APIs", nil)
  }

  // MARK: - Deep capture

  func startDeepCapture(withPort portNumber: NSNumber?, filter: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard currentSessionId == nil else {
      reject("SESSION_ACTIVE", "Deep capture already running", nil)
      return
    }

    guard let value = portNumber?.intValue, value > 0, value <= Int(UInt16.max) else {
      reject("INVALID_PORT", "A valid UDP port is required", nil)
      return
    }

    let port = UInt16(value)

    let normalizedFilter = filter?.isEmpty == true ? nil : filter
    loadTunnelManager { [weak self] result in
      guard let self else { return }

      switch result {
      case .failure(let error):
        self.logger.error("Failed to load tunnel manager: \(error.localizedDescription, privacy: .public)")
        self.handleStartFailure(code: "TUNNEL_LOAD", message: error.localizedDescription, error: error, manager: nil, reject: reject)
      case .success(let manager):
        self.startTunnelWithRetry(
          manager: manager,
          port: port,
          filter: normalizedFilter,
          attempt: 1,
          resolve: resolve,
          reject: reject
        )
      }
    }
  }

  private func startTunnelWithRetry(
    manager: NETunnelProviderManager,
    port: UInt16,
    filter: String?,
    attempt: Int,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard attempt <= maxRetries else {
      cleanupTunnel(manager: manager)
      resetState()
      let error = NSError(
        domain: "WifiCapture",
        code: -3,
        userInfo: [NSLocalizedDescriptionKey: "Failed to start tunnel after \(maxRetries) attempts"]
      )
      DispatchQueue.main.async {
        reject("TUNNEL_MAX_RETRIES", error.localizedDescription, error)
      }
      return
    }

    performOnQueue(wait: true) {
      self.filterString = filter
      self.filterData = filter?.data(using: .utf8)
    }

    configure(manager: manager, port: port, filter: filter)

    manager.saveToPreferences { [weak self] saveError in
      guard let self else { return }

      if let saveError {
        self.logger.error("Saving tunnel configuration failed: \(saveError.localizedDescription, privacy: .public)")
        self.handleStartFailure(
          code: "TUNNEL_SAVE",
          message: saveError.localizedDescription,
          error: saveError,
          manager: manager,
          reject: reject
        )
        return
      }

      do {
        try manager.connection.startVPNTunnel()
      } catch {
        self.logger.error("Starting VPN tunnel failed: \(error.localizedDescription, privacy: .public)")
        self.handleStartFailure(
          code: "TUNNEL_START",
          message: error.localizedDescription,
          error: error,
          manager: manager,
          reject: reject
        )
        return
      }

      let connection = manager.connection
      var finished = false
      var token: NSObjectProtocol?

      func clearObserver() {
        if let tokenValue = token {
          NotificationCenter.default.removeObserver(tokenValue)
          token = nil
        }
      }

      func succeed() {
        guard !finished else { return }
        finished = true
        clearObserver()

        let sessionId = UUID().uuidString
        self.performOnQueue(wait: true) {
          self.tunnelManager = manager
          self.currentPort = port
          self.currentSessionId = sessionId
          self.stats = CaptureStats()
          self.filterString = filter
          self.filterData = filter?.data(using: .utf8)
        }

        do {
          try self.startUdpListener(port: port)
          DispatchQueue.main.async {
            resolve(["sessionId": sessionId])
          }
        } catch {
          self.logger.error("UDP listener failed: \(error.localizedDescription, privacy: .public)")
          if let nwError = error as? NWError, case .posix(let posixError) = nwError, posixError == .EADDRINUSE {
            self.handleStartFailure(
              code: "PORT_BOUND",
              message: "UDP port \(port) is already in use",
              error: error,
              manager: manager,
              reject: reject
            )
          } else {
            self.handleStartFailure(
              code: "UDP_LISTENER",
              message: error.localizedDescription,
              error: error,
              manager: manager,
              reject: reject
            )
          }
        }
      }

      func failAndRetry(_ reason: String) {
        guard !finished else { return }
        finished = true
        clearObserver()
        self.cleanupTunnel(manager: manager)
        self.resetState()

        if attempt >= self.maxRetries {
          let error = NSError(
            domain: "WifiCapture",
            code: -3,
            userInfo: [
              NSLocalizedDescriptionKey: "Failed to start tunnel after \(self.maxRetries) attempts (\(reason))",
            ]
          )
          self.logger.error("Tunnel start failed: \(reason, privacy: .public)")
          DispatchQueue.main.async {
            reject("TUNNEL_MAX_RETRIES", error.localizedDescription, error)
          }
          return
        }

        let retryDelay = self.baseRetryDelay * pow(2.0, Double(attempt - 1))
        self.logger.warning(
          "Tunnel start failed (\(reason, privacy: .public)), retrying (\(attempt, privacy: .public)/\(self.maxRetries, privacy: .public)) after \(retryDelay, privacy: .public)s"
        )
        let deadline = DispatchTime.now() + .milliseconds(Int(retryDelay * 1000))
        DispatchQueue.main.asyncAfter(deadline: deadline) {
          self.startTunnelWithRetry(
            manager: manager,
            port: port,
            filter: filter,
            attempt: attempt + 1,
            resolve: resolve,
            reject: reject
          )
        }
      }

      token = NotificationCenter.default.addObserver(
        forName: .NEVPNStatusDidChange,
        object: connection,
        queue: .main
      ) { _ in
        switch connection.status {
        case .connected:
          succeed()
        case .invalid, .disconnected:
          failAndRetry("status=\(String(describing: connection.status))")
        default:
          break
        }
      }

      switch connection.status {
      case .connected:
        succeed()
      case .invalid, .disconnected:
        failAndRetry("status=\(String(describing: connection.status))")
      default:
        break
      }

      let timeoutDeadline = DispatchTime.now() + .milliseconds(Int(self.tunnelTimeout * 1000))
      DispatchQueue.main.asyncAfter(deadline: timeoutDeadline) {
        if !finished {
          failAndRetry("timeout \(self.tunnelTimeout)s")
        }
      }
    }
  }

  func stopDeepCapture(withSession sessionId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let currentSessionId, currentSessionId == sessionId else {
      DispatchQueue.main.async {
        resolve(nil)
      }
      return
    }

    stopUdpListener()

    if let manager = tunnelManager {
      manager.connection.stopVPNTunnel()
      cleanupTunnel(manager: manager)
    }

    resetState()
    DispatchQueue.main.async {
      resolve(nil)
    }
  }

  func stats(forSession sessionId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let currentSessionId, currentSessionId == sessionId else {
      reject("INVALID_SESSION", "No active session for id", nil)
      return
    }

    queue.async {
      let snapshot = self.stats
      DispatchQueue.main.async {
        resolve([
          "bytesCaptured": snapshot.bytesCaptured,
          "packetsProcessed": snapshot.packetsProcessed,
          "dropped": snapshot.dropped,
        ])
      }
    }
  }

  func setAdvancedScanMode(
    withEnabled enabled: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    performOnQueue(wait: true) {
      self.advancedScanEnabled = enabled
      if !enabled {
        self.scanCache.removeAll()
      }
    }

    DispatchQueue.main.async {
      resolve(nil)
    }
  }

  func cachedScanResults(
    withResolve resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let payload = self.buildScanPayload(includeCacheOnly: true)
      DispatchQueue.main.async {
        resolve(payload)
      }
    }
  }

  func importTetheredCapture(
    withFilePath filePath: String,
    options: [String: Any]?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }

      let fileURL = URL(fileURLWithPath: filePath)
      let overrideFilter = (options?["filter"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      let effectiveFilter = overrideFilter?.isEmpty == false
        ? overrideFilter?.data(using: .utf8)
        : self.filterData

      guard FileManager.default.fileExists(atPath: fileURL.path) else {
        DispatchQueue.main.async {
          reject("FILE_NOT_FOUND", "No file located at path", nil)
        }
        return
      }

      let startTime = Date()
      let startedAccess = fileURL.startAccessingSecurityScopedResource()

      self.rviImporter.importFile(
        at: fileURL,
        filter: effectiveFilter
      ) { [weak self] packet in
        self?.publishPacket(
          id: packet.id,
          timestamp: packet.timestamp,
          payloadData: packet.payload,
          headers: packet.headers,
          preview: packet.preview,
          filterOverride: effectiveFilter
        )
      } completion: { result in
        if startedAccess {
          fileURL.stopAccessingSecurityScopedResource()
        }

        switch result {
        case .success(let summary):
          let duration = Date().timeIntervalSince(startTime)
          DispatchQueue.main.async {
            resolve([
              "packets": summary.packets,
              "duration": duration,
              "dropped": summary.dropped,
            ])
          }
        case .failure(let error):
          self.logger.error(
            "RVI import failed: \(error.localizedDescription, privacy: .public)"
          )
          DispatchQueue.main.async {
            reject("RVI_IMPORT_FAILED", error.localizedDescription, error)
          }
        }
      }
    }
  }

  func startTetheredCapture(
    withDeviceIdentifier deviceIdentifier: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let resolvedIdentifier = Self.resolveDeviceIdentifier(from: deviceIdentifier)

    guard let identifier = resolvedIdentifier else {
      logger.error("rvictl start failed: missing device identifier")
      DispatchQueue.main.async {
        reject("RVI_IDENTIFIER", "A tethered device identifier is required", nil)
      }
      return
    }

    performOnQueue(wait: true) {
      self.tetheredCaptureStart = Date()
      self.tetheredDeviceIdentifier = identifier
    }

    rviImporter.start(deviceIdentifier: identifier) { [weak self] result in
      switch result {
      case .success(let interfaceName):
        self?.logger.log("rvictl attached to \(interfaceName, privacy: .public)")
        DispatchQueue.main.async {
          resolve(["interface": interfaceName])
        }
      case .failure(let error):
        self?.logger.error(
          "rvictl start failed: \(error.localizedDescription, privacy: .public)"
        )
        DispatchQueue.main.async {
          reject("RVI_START_FAILED", error.localizedDescription, error)
        }
      }
    }
  }

  func stopTetheredCapture(
    withDeviceIdentifier deviceIdentifier: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let resolvedIdentifier: String?
    if let deviceIdentifier, !deviceIdentifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      resolvedIdentifier = deviceIdentifier
    } else {
      resolvedIdentifier = tetheredDeviceIdentifier
    }

    rviImporter.stop(deviceIdentifier: resolvedIdentifier) { [weak self] result in
      switch result {
      case .success:
        self?.logger.log("rvictl detached")
        self?.performOnQueue(wait: true) {
          self?.tetheredDeviceIdentifier = nil
          self?.tetheredCaptureStart = nil
        }
        DispatchQueue.main.async {
          resolve(nil)
        }
      case .failure(let error):
        self?.logger.error(
          "rvictl stop failed: \(error.localizedDescription, privacy: .public)"
        )
        DispatchQueue.main.async {
          reject("RVI_STOP_FAILED", error.localizedDescription, error)
        }
      }
    }
  }

  // MARK: - Tunnel helpers

  private func loadTunnelManager(completion: @escaping (Result<NETunnelProviderManager, Error>) -> Void) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error {
        completion(.failure(error))
        return
      }

      if let existing = managers?.first {
        completion(.success(existing))
        return
      }

      completion(.success(NETunnelProviderManager()))
    }
  }

  private func configure(manager: NETunnelProviderManager, port: UInt16, filter: String?) {
    let protocolConfiguration = NETunnelProviderProtocol()
    protocolConfiguration.providerBundleIdentifier = cachedExtensionBundleIdentifier ?? "com.wifihandshakecapture.WiFiHandshakeCapture.WifiCaptureExtension"
    protocolConfiguration.serverAddress = "127.0.0.1"
    protocolConfiguration.providerConfiguration = [
      "udpPort": Int(port),
      "filter": filter ?? "",
    ]

    manager.protocolConfiguration = protocolConfiguration
    manager.isEnabled = true
    manager.localizedDescription = "Wifi Deep Capture"
  }

  private func cleanupTunnel(manager: NETunnelProviderManager) {
    manager.connection.stopVPNTunnel()
    manager.removeFromPreferences { error in
      if let error {
        self.logger.error("Removing tunnel preferences failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  private func resetState() {
    performOnQueue(wait: true) {
      self.tunnelManager = nil
      self.currentPort = 0
      self.currentSessionId = nil
      self.filterString = nil
      self.filterData = nil
      self.stats = CaptureStats()
      self.tetheredCaptureStart = nil
      self.tetheredDeviceIdentifier = nil
    }
  }

  private static func locateExtensionBundleIdentifier() -> String? {
    guard let appBundleIdentifier = Bundle.main.bundleIdentifier else {
      return nil
    }
    return "\(appBundleIdentifier).WifiCaptureExtension"
  }

  private func startUdpListener(port: UInt16) throws {
    stopUdpListener()

    guard let nwPort = NWEndpoint.Port(rawValue: port) else {
      throw NSError(domain: "WifiCapture", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid port"])
    }

    let params = NWParameters.udp
    params.allowLocalEndpointReuse = false

    let listener = try NWListener(using: params, on: nwPort)
    listener.stateUpdateHandler = { [weak self] state in
      if case let .failed(error) = state {
        self?.logger.error("UDP listener failed: \(error.localizedDescription, privacy: .public)")
      }
    }

    listener.newConnectionHandler = { [weak self] connection in
      guard let self else { return }
      let identifier = ObjectIdentifier(connection)
      self.connections[identifier] = connection
      connection.stateUpdateHandler = { [weak self, weak connection] state in
        guard let self, let connection else { return }
        let identifier = ObjectIdentifier(connection)
        switch state {
        case .ready:
          self.receive(on: connection)
        case .failed(let error):
          self.logger.error("UDP connection failed: \(error.localizedDescription, privacy: .public)")
          self.connections.removeValue(forKey: identifier)
        case .cancelled:
          self.connections.removeValue(forKey: identifier)
        default:
          break
        }
      }
      connection.start(queue: self.queue)
    }

    listener.start(queue: queue)
    udpListener = listener
  }

  private func stopUdpListener() {
    let cleanup: () -> Void = {
      self.connections.values.forEach { $0.cancel() }
      self.connections.removeAll()
      self.udpListener?.cancel()
      self.udpListener = nil
    }

    performOnQueue(wait: true, cleanup)
  }

  private func receive(on connection: NWConnection) {
    connection.receiveMessage { [weak self, weak connection] data, _, _, error in
      guard let self, let connection else { return }

      if let error {
        self.logger.error("UDP receive error: \(error.localizedDescription, privacy: .public)")
        self.queue.async {
          self.stats.dropped += 1
        }
        return
      }

      if let data {
        self.processIncoming(data: data)
      }

      self.receive(on: connection)
    }
  }

  private func processIncoming(data: Data) {
    guard !data.isEmpty else {
      performOnQueue(wait: false) {
        self.stats.dropped += 1
      }
      return
    }

    do {
      if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
         let payloadString = json["payload"] as? String,
         let payloadData = Data(base64Encoded: payloadString) {
        let packetId = (json["id"] as? String) ?? UUID().uuidString
        let timestamp = (json["timestamp"] as? Double) ?? (Date().timeIntervalSince1970 * 1000)
        let headers = json["headers"] as? [String: Any] ?? [:]
        let preview = json["preview"] as? String ?? createHexPreview(from: payloadData)

        publishPacket(
          id: packetId,
          timestamp: timestamp,
          payloadData: payloadData,
          headers: headers,
          preview: preview
        )
        return
      }

      let preview = createHexPreview(from: data)
      publishPacket(
        id: UUID().uuidString,
        timestamp: Date().timeIntervalSince1970 * 1000,
        payloadData: data,
        headers: ["type": "Raw"],
        preview: preview
      )
    } catch {
      logger.error("Failed to decode UDP payload: \(error.localizedDescription, privacy: .public)")
      performOnQueue(wait: false) {
        self.stats.dropped += 1
      }
    }
  }

  private func cacheNetworks(from networks: Set<CWNetwork>) -> [CachedNetwork] {
    var updatedCache = scanCache
    let now = Date()
    var latest: [CachedNetwork] = []

    for network in networks {
      guard let bssid = network.bssid else { continue }

      let frequency = network.wlanChannel.frequency
      let securityList = securityDescriptions(for: network)
      let cached = CachedNetwork(
        ssid: network.ssid ?? "",
        bssid: bssid,
        signal: network.rssiValue,
        channel: network.wlanChannel.channelNumber,
        frequency: frequency,
        security: securityList.isEmpty ? ["Unknown"] : securityList,
        capabilities: securityList.joined(separator: ", "),
        noise: extractNoise(from: network),
        lastSeen: now,
        channelWidth: channelWidthValue(for: network.wlanChannel),
        phyMode: phyModeString(for: network),
        band: bandDescription(for: frequency)
      )

      updatedCache[bssid] = cached
      latest.append(cached)
    }

    if advancedScanEnabled {
      let threshold = now.addingTimeInterval(-scanCacheExpiration)
      updatedCache = updatedCache.filter { $0.value.lastSeen >= threshold }
    } else {
      updatedCache = Dictionary(uniqueKeysWithValues: latest.map { ($0.bssid, $0) })
    }

    scanCache = updatedCache

    if advancedScanEnabled {
      return Array(updatedCache.values)
    }

    return latest
  }

  private func buildScanPayload(
    includeCacheOnly: Bool,
    latest: [CachedNetwork]? = nil
  ) -> [[String: Any]] {
    let now = Date()
    let sourceNetworks: [CachedNetwork]

    if includeCacheOnly {
      sourceNetworks = Array(scanCache.values)
    } else if advancedScanEnabled {
      sourceNetworks = Array(scanCache.values)
    } else {
      sourceNetworks = latest ?? []
    }

    let sorted = sourceNetworks.sorted { lhs, rhs in
      if lhs.signal == rhs.signal {
        return lhs.lastSeen > rhs.lastSeen
      }
      return lhs.signal > rhs.signal
    }

    return sorted.map { network in
      var dictionary = networkDictionary(for: network)
      dictionary["lastSeen"] = network.lastSeen.timeIntervalSince1970 * 1000
      dictionary["isCached"] = now.timeIntervalSince(network.lastSeen) > 1
      return dictionary
    }
  }

  private func networkDictionary(for network: CachedNetwork) -> [String: Any] {
    var payload: [String: Any] = [
      "ssid": network.ssid,
      "bssid": network.bssid,
      "signal": network.signal,
      "channel": network.channel,
      "frequency": network.frequency,
      "capabilities": network.capabilities,
      "band": network.band,
    ]

    if network.security.count == 1, let value = network.security.first {
      payload["security"] = value
    } else {
      payload["security"] = network.security
    }

    if let noise = network.noise {
      payload["noise"] = noise
    }

    if let width = network.channelWidth {
      payload["channelWidth"] = width
    }

    if let phy = network.phyMode {
      payload["phyMode"] = phy
    }

    return payload
  }

  private func securityDescriptions(for network: CWNetwork) -> [String] {
    var values: [String] = []

    if let supported = network.value(forKey: "supportedSecurity") as? [NSNumber] {
      values.append(contentsOf: supported.map { securityString(for: $0.intValue) })
    } else if let supportedSet = network.value(forKey: "supportedSecurity") as? NSSet,
              let items = supportedSet.allObjects as? [NSNumber] {
      values.append(contentsOf: items.map { securityString(for: $0.intValue) })
    }

    if values.isEmpty,
       let securityValue = network.value(forKey: "security") as? NSNumber {
      values.append(securityString(for: securityValue.intValue))
    }

    return Array(Set(values)).sorted()
  }

  private func securityString(for rawValue: Int) -> String {
    switch rawValue {
    case 0:
      return "Open"
    case 1:
      return "WEP"
    case 2:
      return "WPA"
    case 3:
      return "WPA Mixed"
    case 4:
      return "WPA2"
    case 5:
      return "Personal"
    case 6:
      return "Dynamic WEP"
    case 7:
      return "WPA Enterprise"
    case 8:
      return "WPA Enterprise Mixed"
    case 9:
      return "WPA2 Enterprise"
    case 10:
      return "Enterprise"
    case 11:
      return "WPA3"
    case 12:
      return "WPA3 Enterprise"
    case 13:
      return "WPA3 Transition"
    default:
      return "Unknown"
    }
  }

  private func channelWidthValue(for channel: CWChannel) -> Int? {
    if let widthNumber = channel.value(forKey: "channelWidth") as? NSNumber {
      switch widthNumber.intValue {
      case 0:
        return 20
      case 1:
        return 40
      case 2:
        return 80
      case 3:
        return 160
      case 4:
        return 80
      default:
        return nil
      }
    }
    return nil
  }

  private func phyModeString(for network: CWNetwork) -> String? {
    guard let phyValue = network.value(forKey: "phyMode") as? NSNumber else {
      return nil
    }

    switch phyValue.intValue {
    case 0:
      return "802.11a"
    case 1:
      return "802.11b"
    case 2:
      return "802.11g"
    case 3:
      return "802.11n"
    case 4:
      return "802.11ac"
    case 5:
      return "802.11ax"
    default:
      return nil
    }
  }

  private func bandDescription(for frequency: Int) -> String {
    switch frequency {
    case 2400 ... 2500:
      return "2.4GHz"
    case 4900 ... 5899:
      return "5GHz"
    case 5925 ... 7125:
      return "6GHz"
    default:
      return "Unknown"
    }
  }

  private func extractNoise(from network: CWNetwork) -> Int? {
    if let noiseValue = network.value(forKey: "noiseMeasurement") as? NSNumber {
      return noiseValue.intValue
    }
    return nil
  }

  private func publishPacket(
    id: String,
    timestamp: Double,
    payloadData: Data,
    headers: [String: Any],
    preview: String,
    filterOverride: Data? = nil
  ) {
    if shouldDrop(data: payloadData, filterOverride: filterOverride) {
      performOnQueue(wait: false) {
        self.stats.dropped += 1
      }
      return
    }

    performOnQueue(wait: false) {
      self.stats.bytesCaptured += UInt64(payloadData.count)
      self.stats.packetsProcessed += 1
    }

    let message: [String: Any] = [
      "id": id,
      "timestamp": timestamp,
      "payload": payloadData.base64EncodedString(),
      "headers": headers,
      "preview": preview.isEmpty ? createHexPreview(from: payloadData) : preview,
    ]

    DispatchQueue.main.async { [weak self] in
      self?.eventEmitter?.sendEvent(withName: "onDeepPacket", body: message)
    }
  }

  private func shouldDrop(data: Data, filterOverride: Data?) -> Bool {
    guard let filter = filterOverride ?? filterData else {
      return false
    }
    return data.range(of: filter) == nil
  }

  private static func resolveDeviceIdentifier(from rawIdentifier: String) -> String? {
    let trimmed = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty, trimmed.lowercased() != "auto" {
      return trimmed
    }

    #if targetEnvironment(simulator)
      if let simulatorId = ProcessInfo.processInfo.environment["SIMULATOR_UDID"],
         !simulatorId.isEmpty {
        return simulatorId
      }
    #endif

    if let environmentIdentifier = ProcessInfo.processInfo.environment["WIFICAPTURE_DEVICE_ID"],
       !environmentIdentifier.isEmpty {
      return environmentIdentifier
    }

    #if canImport(UIKit)
      if let vendorId = UIDevice.current.identifierForVendor?.uuidString,
         !vendorId.isEmpty {
        return vendorId
      }
    #endif

    return trimmed.isEmpty ? nil : trimmed
  }
}

extension WifiCaptureImpl {
  private func performOnQueue(wait: Bool, _ block: @escaping () -> Void) {
    if DispatchQueue.getSpecific(key: queueKey) != nil {
      block()
    } else if wait {
      let group = DispatchGroup()
      group.enter()
      queue.async {
        block()
        group.leave()
      }
      group.wait()
    } else {
      queue.async(execute: block)
    }
  }

  private func handleStartFailure(
    code: String,
    message: String,
    error: Error,
    manager: NETunnelProviderManager?,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if let manager {
      cleanupTunnel(manager: manager)
    }

    resetState()

    DispatchQueue.main.async {
      reject(code, message, error)
    }
  }
}

private func createHexPreview(from data: Data) -> String {
  guard !data.isEmpty else { return "" }
  let maxBytes = min(64, data.count)
  let slice = data.prefix(maxBytes)
  let hex = slice.map { String(format: "%02x", $0) }.joined(separator: " ")
  if data.count > maxBytes {
    return "\(hex) …"
  }
  return hex
}

private struct CachedNetwork {
  let ssid: String
  let bssid: String
  let signal: Int
  let channel: Int
  let frequency: Int
  let security: [String]
  let capabilities: String
  let noise: Int?
  let lastSeen: Date
  let channelWidth: Int?
  let phyMode: String?
  let band: String
}

private struct CaptureStats {
  var bytesCaptured: UInt64 = 0
  var packetsProcessed: UInt64 = 0
  var dropped: UInt64 = 0
}
