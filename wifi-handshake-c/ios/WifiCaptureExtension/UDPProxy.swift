import Network
import os.log

final class UDPProxy {
  private let connection: NWConnection
  private let logger = Logger(subsystem: "WifiCaptureExtension", category: "UDPProxy")
  private let queue = DispatchQueue(label: "WifiCaptureExtension.UDP", qos: .utility)

  init(port: Int) throws {
    guard let endpointPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
      throw NSError(domain: "WifiCaptureExtension", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid UDP port"])
    }

    connection = NWConnection(host: .ipv4(.loopback), port: endpointPort, using: .udp)
    connection.stateUpdateHandler = { [weak self] state in
      if case let .failed(error) = state {
        self?.logger.error("UDP connection failed: \(error.localizedDescription, privacy: .public)")
      }
    }
    connection.start(queue: queue)
  }

  func forward(data: Data) {
    connection.send(content: data, completion: .contentProcessed { [weak self] error in
      if let error {
        self?.logger.error("UDP send error: \(error.localizedDescription, privacy: .public)")
      }
    })
  }

  func stop() {
    connection.cancel()
  }
}
