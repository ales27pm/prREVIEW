import Foundation
import Network
import os.log

final class UDPProxy {
  private let logger = Logger(subsystem: "WifiCaptureExtension", category: "UDPProxy")
  private var connection: NWConnection?

  func start(host: String, port: UInt16, queue: DispatchQueue) throws {
    guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
      throw NSError(
        domain: "UDPProxy",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid port"]
      )
    }

    let connection = NWConnection(to: .hostPort(host: .init(host), port: endpointPort), using: .udp)
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        self?.logger.info("UDP proxy connection ready")
      case .failed(let error):
        self?.logger.error("UDP proxy failed: \(error.localizedDescription, privacy: .public)")
      default:
        break
      }
    }

    connection.start(queue: queue)
    self.connection = connection
  }

  func send(data: Data, completion: @escaping (Error?) -> Void) {
    guard let connection else {
      let error = NSError(
        domain: "UDPProxy",
        code: -2,
        userInfo: [NSLocalizedDescriptionKey: "No active connection"]
      )
      logger.error("Attempted to send without active connection")
      completion(error)
      return
    }

    connection.send(content: data, completion: .contentProcessed { error in
      completion(error)
    })
  }

  func stop() {
    connection?.cancel()
    connection = nil
  }
}
