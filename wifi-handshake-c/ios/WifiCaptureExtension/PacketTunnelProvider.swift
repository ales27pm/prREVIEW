import Foundation
import Network
import NetworkExtension
import os.log

final class PacketTunnelProvider: NEPacketTunnelProvider {
  private var udpProxy: UDPProxy?
  private var stats = CaptureStats()
  private let logger = Logger(subsystem: "WifiCaptureExtension", category: "PacketTunnel")

  override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
    guard
      let configuration = protocolConfiguration.providerConfiguration,
      let port = configuration["udpPort"] as? Int
    else {
      completionHandler(NSError(domain: "WifiCaptureExtension", code: -1, userInfo: [NSLocalizedDescriptionKey: "Missing UDP port"]))
      return
    }

    let filter = configuration["filter"] as? String ?? ""

    do {
      udpProxy = try UDPProxy(port: port)
    } catch {
      completionHandler(error)
      return
    }

    let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    networkSettings.ipv4Settings = NEIPv4Settings(addresses: ["192.168.200.1"], subnetMasks: ["255.255.255.0"])
    networkSettings.ipv4Settings?.includedRoutes = [NEIPv4Route.default()]
    networkSettings.mtu = 1500

    setTunnelNetworkSettings(networkSettings) { [weak self] error in
      guard let self else { return }
      if let error {
        completionHandler(error)
        return
      }

      self.stats = CaptureStats()
      self.readPackets(filter: filter)
      completionHandler(nil)
    }
  }

  private func readPackets(filter: String) {
    packetFlow.readPacketObjects { [weak self] packetObjects in
      guard let self else { return }
      guard !packetObjects.isEmpty else {
        self.readPackets(filter: filter)
        return
      }

      let filterData = filter.isEmpty ? nil : Data(filter.utf8)

      for packet in packetObjects {
        let data = packet.data
        if data.isEmpty {
          self.stats.dropped += 1
          continue
        }

        if let filterData, data.range(of: filterData) == nil {
          self.stats.dropped += 1
          continue
        }

        let parsed = PacketParser.parse(data)
        var headers = parsed["headers"] as? [String: Any] ?? [:]
        headers["length"] = data.count
        let preview = parsed["preview"] as? String ?? ""

        let message: [String: Any] = [
          "id": UUID().uuidString,
          "timestamp": Date().timeIntervalSince1970 * 1000,
          "payload": data.base64EncodedString(),
          "headers": headers,
          "preview": preview,
        ]

        do {
          let payload = try JSONSerialization.data(withJSONObject: message, options: [])
          udpProxy?.forward(data: payload)
          stats.bytesCaptured += UInt64(data.count)
          stats.packetsProcessed += 1
        } catch {
          logger.error("Failed to serialize packet: \(error.localizedDescription, privacy: .public)")
          stats.dropped += 1
        }
      }

      self.readPackets(filter: filter)
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
    udpProxy?.stop()
    udpProxy = nil
    completionHandler()
  }
}

private struct CaptureStats {
  var bytesCaptured: UInt64 = 0
  var packetsProcessed: UInt64 = 0
  var dropped: UInt64 = 0
}
