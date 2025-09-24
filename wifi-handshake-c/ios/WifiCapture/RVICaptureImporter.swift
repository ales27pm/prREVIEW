import Foundation
import os.log

#if canImport(pcap)
  import pcap
#endif

final class RVICaptureImporter {
  struct Packet {
    let id: String
    let timestamp: Double
    let payload: Data
    let headers: [String: Any]
    let preview: String
  }

  struct Summary {
    let packets: Int
    let dropped: Int
  }

  private let logger = Logger(subsystem: "WifiCapture", category: "RVIImporter")
  private let queue = DispatchQueue(label: "WifiCapture.RVIImporter", qos: .userInitiated)

  func importFile(
    at url: URL,
    filter: Data?,
    handler: @escaping (Packet) -> Void,
    completion: @escaping (Result<Summary, Error>) -> Void
  ) {
    queue.async { [logger] in
      #if canImport(pcap)
        var errorBuffer = [Int8](repeating: 0, count: Int(PCAP_ERRBUF_SIZE))
        let path = (url.path as NSString).utf8String
        guard let path else {
          completion(
            .failure(
              NSError(
                domain: "WifiCapture",
                code: -41,
                userInfo: [NSLocalizedDescriptionKey: "Unable to access file path"]
              )
            )
          )
          return
        }

        guard let handle = pcap_open_offline(path, &errorBuffer) else {
          let message = String(cString: &errorBuffer)
          completion(
            .failure(
              NSError(
                domain: "WifiCapture",
                code: -42,
                userInfo: [NSLocalizedDescriptionKey: message]
              )
            )
          )
          return
        }

        defer {
          pcap_close(handle)
        }

        let linkType = pcap_datalink(handle)
        let shouldUseIPParser = Self.shouldParseAsIP(linkType: linkType)

        var headerPointer: UnsafeMutablePointer<pcap_pkthdr>?
        var dataPointer: UnsafePointer<UInt8>?
        var processed = 0
        var dropped = 0

        while true {
          let status = pcap_next_ex(handle, &headerPointer, &dataPointer)
          if status == 1 {
            guard let headerPointer, let dataPointer else { continue }
            let header = headerPointer.pointee
            let captureLength = Int(header.caplen)
            let payload = Data(bytes: dataPointer, count: captureLength)

            if let filter, payload.range(of: filter) == nil {
              dropped += 1
              continue
            }

            let seconds = Double(header.ts.tv_sec)
            let microseconds = Double(header.ts.tv_usec)
            let timestamp = seconds * 1000.0 + microseconds / 1000.0

            let parsed: [String: Any]
            if shouldUseIPParser {
              parsed = PacketParser.parseIPPacket(payload)
            } else {
              parsed = PacketParser.parse(payload)
            }
            let headers = (parsed["headers"] as? [String: Any]) ?? [:]
            let preview = (parsed["preview"] as? String) ?? Self.hexPreview(for: payload)

            handler(
              Packet(
                id: UUID().uuidString,
                timestamp: timestamp,
                payload: payload,
                headers: headers,
                preview: preview
              )
            )

            processed += 1
          } else if status == 0 {
            continue
          } else if status == -2 {
            break
          } else {
            if let errorPointer = pcap_geterr(handle) {
              let message = String(cString: errorPointer)
              logger.error("pcap_next_ex failed: \(message, privacy: .public)")
              completion(
                .failure(
                  NSError(
                    domain: "WifiCapture",
                    code: -43,
                    userInfo: [NSLocalizedDescriptionKey: message]
                  )
                )
              )
              return
            }
            break
          }
        }

        completion(.success(Summary(packets: processed, dropped: dropped)))
      #else
        completion(
          .failure(
            NSError(
              domain: "WifiCapture",
              code: -44,
              userInfo: [
                NSLocalizedDescriptionKey: "libpcap is not available on this platform",
              ]
            )
          )
        )
      #endif
    }
  }

  func start(
    deviceIdentifier: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    #if targetEnvironment(macCatalyst)
      queue.async {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/rvictl")
        process.arguments = ["-s", deviceIdentifier]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
          try process.run()
        } catch {
          completion(.failure(error))
          return
        }

        process.waitUntilExit()
        let outputData = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: outputData, encoding: .utf8) ?? ""

        guard process.terminationStatus == 0 else {
          let message = output.isEmpty ? "rvictl failed" : output
          completion(
            .failure(
              NSError(
                domain: "WifiCapture",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: message]
              )
            )
          )
          return
        }

        let interface = Self.parseInterfaceName(from: output) ?? "rvi0"
        completion(.success(interface))
      }
    #else
      completion(
        .failure(
          NSError(
            domain: "WifiCapture",
            code: -45,
            userInfo: [
              NSLocalizedDescriptionKey:
                "rvictl is only available when running the app via Mac Catalyst",
            ]
          )
        )
      )
    #endif
  }

  func stop(
    deviceIdentifier: String?,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    #if targetEnvironment(macCatalyst)
      guard let deviceIdentifier else {
        completion(.success(()))
        return
      }

      queue.async {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/rvictl")
        process.arguments = ["-x", deviceIdentifier]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
          try process.run()
        } catch {
          completion(.failure(error))
          return
        }

        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
          let outputData = pipe.fileHandleForReading.readDataToEndOfFile()
          let message = String(data: outputData, encoding: .utf8) ?? "rvictl failed"
          completion(
            .failure(
              NSError(
                domain: "WifiCapture",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: message]
              )
            )
          )
          return
        }

        completion(.success(()))
      }
    #else
      completion(.success(()))
    #endif
  }

  private static func parseInterfaceName(from output: String) -> String? {
    let components = output
      .split(separator: "\n")
      .first(where: { $0.contains("Starting device") || $0.contains("Interface") })
      ?.split(separator: " ") ?? []

    guard let index = components.last else {
      return nil
    }

    let trimmed = index.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private static func hexPreview(for data: Data) -> String {
    guard !data.isEmpty else { return "" }
    let maxBytes = min(data.count, 64)
    return data.prefix(maxBytes).map { String(format: "%02x", $0) }.joined(separator: " ")
  }

#if canImport(pcap)
  private static func shouldParseAsIP(linkType: Int32) -> Bool {
    guard let namePointer = pcap_datalink_val_to_name(linkType) else {
      return false
    }

    let name = String(cString: namePointer).uppercased()
    switch name {
    case "RAW", "IP", "IPV4", "IPV6":
      return true
    default:
      return false
    }
  }
#endif
}
