import CoreWLAN
import Foundation
import Network
import NetworkExtension
import os.log
import React

@objcMembers
final class WifiCaptureImpl: NSObject {
  static let shared = WifiCaptureImpl()

  private weak var eventEmitter: RCTEventEmitter?
  private let logger = Logger(subsystem: "WifiCapture", category: "Impl")
  private let queue = DispatchQueue(label: "WifiCapture.DeepCapture", qos: .utility)

  private var tunnelManager: NETunnelProviderManager?
  private var currentSessionId: String?
  private var currentPort: UInt16 = 0
  private var udpListener: NWListener?
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private var stats = CaptureStats()
  private var filterString: String?
  private var filterData: Data?
  private var handshakeInterface: String?

  private override init() {
    super.init()
  }

  func attachWithEmitter(_ emitter: RCTEventEmitter) {
    eventEmitter = emitter
  }

  // MARK: - Legacy API

  func scan(withResolve resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let interface = CWWiFiClient.shared().interface() else {
      reject("NO_INTERFACE", "Unable to access Wi-Fi interface", nil)
      return
    }

    do {
      let networks = try interface.scanForNetworks(withName: nil)
      let payload = networks.map { network -> [String: Any] in
        var details: [String: Any] = [
          "ssid": network.ssid ?? "",
          "bssid": network.bssid ?? "",
          "signal": network.rssiValue,
          "channel": network.wlanChannel.channelNumber,
          "frequency": network.wlanChannel.frequency,
        ]

        #if compiler(>=5.7)
          details["security"] = network.security.description
        #else
          details["security"] = "Unknown"
        #endif

        return details
      }
      resolve(payload)
    } catch {
      logger.error("Scan failed: \(error.localizedDescription, privacy: .public)")
      reject("SCAN_ERROR", error.localizedDescription, error)
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

    handshakeInterface = nil
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

    guard let value = portNumber?.intValue, value > 0, value <= UInt16.max else {
      reject("INVALID_PORT", "A valid UDP port is required", nil)
      return
    }

    let port = UInt16(value)
    filterString = filter?.isEmpty == true ? nil : filter
    filterData = filterString?.data(using: .utf8)

    loadTunnelManager { [weak self] result in
      guard let self else { return }

      switch result {
      case .failure(let error):
        reject("TUNNEL_LOAD", error.localizedDescription, error)
      case .success(let manager):
        self.configure(manager: manager, port: port, filter: self.filterString)
        manager.saveToPreferences { saveError in
          if let saveError {
            reject("TUNNEL_SAVE", saveError.localizedDescription, saveError)
            return
          }

          do {
            try manager.connection.startVPNTunnel()
          } catch {
            reject("TUNNEL_START", error.localizedDescription, error)
            return
          }

          let sessionId = UUID().uuidString
          self.tunnelManager = manager
          self.currentPort = port
          self.currentSessionId = sessionId
          self.stats = CaptureStats()

          do {
            try self.startUdpListener(port: port)
          } catch {
            reject("UDP_LISTENER", error.localizedDescription, error)
            return
          }

          resolve(["sessionId": sessionId])
        }
      }
    }
  }

  func stopDeepCapture(withSession sessionId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let currentSessionId, currentSessionId == sessionId else {
      resolve(nil)
      return
    }

    stopUdpListener()

    if let manager = tunnelManager {
      manager.connection.stopVPNTunnel()
      manager.removeFromPreferences { error in
        if let error {
          self.logger.error("Tunnel remove failed: \(error.localizedDescription, privacy: .public)")
        }
      }
    }

    tunnelManager = nil
    currentPort = 0
    self.currentSessionId = nil
    stats = CaptureStats()
    resolve(nil)
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
    protocolConfiguration.providerBundleIdentifier = "com.yourapp.WifiCaptureExtension"
    protocolConfiguration.serverAddress = "127.0.0.1"
    protocolConfiguration.providerConfiguration = [
      "udpPort": Int(port),
      "filter": filter ?? "",
    ]

    manager.protocolConfiguration = protocolConfiguration
    manager.isEnabled = true
    manager.localizedDescription = "Wifi Deep Capture"
  }

  private func startUdpListener(port: UInt16) throws {
    stopUdpListener()

    guard let nwPort = NWEndpoint.Port(rawValue: port) else {
      throw NSError(domain: "WifiCapture", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid port"])
    }

    let params = NWParameters.udp
    params.allowLocalEndpointReuse = true

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
        if case .ready = state {
          self.receive(on: connection)
        } else if case .failed = state || state == .cancelled {
          self.connections.removeValue(forKey: identifier)
        }
      }
      connection.start(queue: self.queue)
    }

    listener.start(queue: queue)
    udpListener = listener
  }

  private func stopUdpListener() {
    connections.values.forEach { $0.cancel() }
    connections.removeAll()
    udpListener?.cancel()
    udpListener = nil
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
      queue.async {
        self.stats.dropped += 1
      }
      return
    }

    do {
      if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
         let payload = json["payload"] as? String,
         let payloadData = Data(base64Encoded: payload) {
        let packetId = (json["id"] as? String) ?? UUID().uuidString
        let timestamp = (json["timestamp"] as? Double) ?? (Date().timeIntervalSince1970 * 1000)
        let headers = json["headers"] as? [String: Any] ?? [:]
        let preview = json["preview"] as? String ?? ""

        if let filter = filterData, payloadData.range(of: filter) == nil {
          queue.async {
            self.stats.dropped += 1
          }
          return
        }

        queue.async {
          self.stats.bytesCaptured += UInt64(payloadData.count)
          self.stats.packetsProcessed += 1
        }

        let body: [String: Any] = [
          "id": packetId,
          "timestamp": timestamp,
          "payload": payload,
          "headers": headers,
          "preview": preview,
        ]

        DispatchQueue.main.async { [weak self] in
          self?.eventEmitter?.sendEvent(withName: "onDeepPacket", body: body)
        }
        return
      }

      // Fallback: treat payload as raw frame data
      let payload = data.base64EncodedString()
      if let filter = filterData, data.range(of: filter) == nil {
        queue.async {
          self.stats.dropped += 1
        }
        return
      }

      queue.async {
        self.stats.bytesCaptured += UInt64(data.count)
        self.stats.packetsProcessed += 1
      }

      let preview = createHexPreview(from: data)
      let headers: [String: Any] = ["type": "Raw"]
      let body: [String: Any] = [
        "id": UUID().uuidString,
        "timestamp": Date().timeIntervalSince1970 * 1000,
        "payload": payload,
        "headers": headers,
        "preview": preview,
      ]

      DispatchQueue.main.async { [weak self] in
        self?.eventEmitter?.sendEvent(withName: "onDeepPacket", body: body)
      }
    } catch {
      logger.error("Failed to decode UDP payload: \(error.localizedDescription, privacy: .public)")
      queue.async {
        self.stats.dropped += 1
      }
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

private struct CaptureStats {
  var bytesCaptured: UInt64 = 0
  var packetsProcessed: UInt64 = 0
  var dropped: UInt64 = 0
}
