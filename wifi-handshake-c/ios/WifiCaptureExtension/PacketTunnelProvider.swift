import Foundation
import Network
import NetworkExtension
import os.log
import Darwin

final class PacketTunnelProvider: NEPacketTunnelProvider {
  private let logger = Logger(subsystem: "WifiCaptureExtension", category: "PacketTunnelProvider")
  private var udpProxy: UDPProxy?
  private var filterData: Data?
  private var stats = CaptureStats()

  override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
    guard
      let provider = protocolConfiguration as? NETunnelProviderProtocol,
      let configuration = provider.providerConfiguration,
      let portValue = configuration["udpPort"] as? Int,
      portValue > 0,
      portValue <= Int(UInt16.max),
      let port = NWEndpoint.Port(rawValue: UInt16(portValue))
    else {
      logger.error("Invalid UDP port in configuration")
      let error = NSError(
        domain: "WifiCaptureExtension",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid UDP port"]
      )
      completionHandler(error)
      return
    }

    let filter = (configuration["filter"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    filterData = filter.isEmpty ? nil : filter.data(using: .utf8)

    let settings = createTunnelSettings()
    setTunnelNetworkSettings(settings) { [weak self] error in
      guard let self else { return }
      if let error {
        self.logger.error("Failed to set tunnel settings: \(error.localizedDescription, privacy: .public)")
        completionHandler(error)
        return
      }

      self.startUdpConnection(port: port) { connectionError in
        if let connectionError {
          self.logger.error("Failed to start UDP connection: \(connectionError.localizedDescription, privacy: .public)")
          completionHandler(connectionError)
          return
        }

        self.stats = CaptureStats()
        self.readPackets()
        completionHandler(nil)
      }
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
    logger.log("Stopping tunnel with reason: \(describe(reason: reason), privacy: .public)")
    udpProxy?.stop()
    udpProxy = nil
    filterData = nil
    stats.logFinalMetrics(logger: logger)
    completionHandler()
  }

  private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
    let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    settings.mtu = 1500

    let ipv4Settings = NEIPv4Settings(addresses: ["192.168.150.1"], subnetMasks: ["255.255.255.0"])
    ipv4Settings.includedRoutes = [NEIPv4Route.default()]
    ipv4Settings.excludedRoutes = [
      NEIPv4Route(destinationAddress: "127.0.0.0", subnetMask: "255.0.0.0"),
      NEIPv4Route(destinationAddress: "192.168.150.1", subnetMask: "255.255.255.255"),
    ]
    settings.ipv4Settings = ipv4Settings

    let ipv6Settings = NEIPv6Settings(addresses: ["fd00:1:1::1"], networkPrefixLengths: [64])
    ipv6Settings.includedRoutes = [NEIPv6Route.default()]
    ipv6Settings.excludedRoutes = [
      NEIPv6Route(destinationAddress: "::1", networkPrefixLength: 128),
      NEIPv6Route(destinationAddress: "fe80::", networkPrefixLength: 10),
    ]
    settings.ipv6Settings = ipv6Settings

    return settings
  }

  private func startUdpConnection(port: NWEndpoint.Port, completion: @escaping (Error?) -> Void) {
    let proxy = UDPProxy()
    do {
      try proxy.start(host: "127.0.0.1", port: port.rawValue, queue: DispatchQueue.global(qos: .utility))
      udpProxy = proxy
      completion(nil)
    } catch {
      completion(error)
    }
  }

  private func readPackets() {
    packetFlow.readPackets { [weak self] packets, protocols in
      guard let self else { return }

      guard !packets.isEmpty else {
        self.readPackets()
        return
      }

      for (index, packet) in packets.enumerated() {
        let protocolNumber: NSNumber?
        if let protocols, index < protocols.count {
          protocolNumber = protocols[index]
        } else {
          protocolNumber = nil
        }
        self.handle(packet: packet, protocolNumber: protocolNumber)
      }

      self.readPackets()
    }
  }

  private func handle(packet: Data, protocolNumber: NSNumber?) {
    guard !packet.isEmpty else {
      stats.dropped += 1
      return
    }

    if let filterData, packet.range(of: filterData) == nil {
      stats.dropped += 1
      return
    }

    let parsed = PacketParser.parseIPPacket(packet)
    var headers = (parsed["headers"] as? [String: Any]) ?? [:]
    headers["length"] = packet.count
    headers["packetSize"] = packet.count
    if let protocolNumber {
      headers["protocolFamily"] = protocolFamilyString(for: protocolNumber.intValue)
    }
    let preview = parsed["preview"] as? String ?? PacketParser.hexPreview(for: packet)

    let message: [String: Any] = [
      "id": UUID().uuidString,
      "timestamp": Date().timeIntervalSince1970 * 1000,
      "payload": packet.base64EncodedString(),
      "headers": headers,
      "preview": preview,
    ]

    do {
      let payload = try JSONSerialization.data(withJSONObject: message, options: [])
      udpProxy?.send(data: payload) { [weak self] error in
        if let error {
          self?.logger.error("Failed to send packet: \(error.localizedDescription, privacy: .public)")
        }
      }
      stats.bytesCaptured += UInt64(packet.count)
      stats.packetsProcessed += 1
    } catch {
      logger.error("Failed to serialize packet: \(error.localizedDescription, privacy: .public)")
      stats.dropped += 1
    }
  }

  private func protocolFamilyString(for value: Int) -> String {
    switch value {
    case AF_INET:
      return "AF_INET"
    case AF_INET6:
      return "AF_INET6"
    default:
      return "AF_OTHER"
    }
  }

  private func describe(reason: NEProviderStopReason) -> String {
    switch reason {
    case .none:
      return "none"
    case .userInitiated:
      return "userInitiated"
    case .providerFailed:
      return "providerFailed"
    case .noNetworkAvailable:
      return "noNetworkAvailable"
    case .unrecoverableNetworkChange:
      return "unrecoverableNetworkChange"
    case .providerDisabled:
      return "providerDisabled"
    case .authenticationCanceled:
      return "authenticationCanceled"
    case .configurationFailed:
      return "configurationFailed"
    case .idleTimeout:
      return "idleTimeout"
    case .configurationDisabled:
      return "configurationDisabled"
    case .configurationRemoved:
      return "configurationRemoved"
    case .superceded:
      return "superceded"
    case .userLogout:
      return "userLogout"
    case .userSwitch:
      return "userSwitch"
    case .connectionFailed:
      return "connectionFailed"
    case .sleep:
      return "sleep"
    case .appUpdate:
      return "appUpdate"
    case .permissionRevoked:
      return "permissionRevoked"
    case .airplaneMode:
      return "airplaneMode"
    @unknown default:
      return "unknown_\(reason.rawValue)"
    }
  }
}

private struct CaptureStats {
  var bytesCaptured: UInt64 = 0
  var packetsProcessed: UInt64 = 0
  var dropped: UInt64 = 0

  mutating func reset() {
    bytesCaptured = 0
    packetsProcessed = 0
    dropped = 0
  }

  func logFinalMetrics(logger: Logger) {
    logger.log(
      "Capture summary packets=\(packetsProcessed, privacy: .public) bytes=\(bytesCaptured, privacy: .public) dropped=\(dropped, privacy: .public)"
    )
  }
}
