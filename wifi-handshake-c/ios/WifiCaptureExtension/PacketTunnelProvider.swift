import Foundation
import Network
import NetworkExtension
import os.log

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
    udpProxy?.stop()
    udpProxy = nil
    filterData = nil
    super.stopTunnel(with: reason, completionHandler: completionHandler)
  }

  private func createTunnelSettings() -> NEPacketTunnelNetworkSettings {
    let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    settings.mtu = 1500

    let ipv4Settings = NEIPv4Settings(addresses: ["192.168.150.1"], subnetMasks: ["255.255.255.0"])
    ipv4Settings.includedRoutes = [NEIPv4Route.default()]
    settings.ipv4Settings = ipv4Settings

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
    packetFlow.readPackets { [weak self] packets, _ in
      guard let self else { return }

      guard !packets.isEmpty else {
        self.readPackets()
        return
      }

      for packet in packets {
        self.handle(packet: packet)
      }

      self.readPackets()
    }
  }

  private func handle(packet: Data) {
    guard !packet.isEmpty else {
      stats.dropped += 1
      return
    }

    if let filterData, packet.range(of: filterData) == nil {
      stats.dropped += 1
      return
    }

    let parsed = PacketParser.parse(packet)
    var headers = (parsed["headers"] as? [String: Any]) ?? [:]
    headers["length"] = packet.count
    let preview = parsed["preview"] as? String ?? ""

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
}

private struct CaptureStats {
  var bytesCaptured: UInt64 = 0
  var packetsProcessed: UInt64 = 0
  var dropped: UInt64 = 0
}
