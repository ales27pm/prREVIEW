# Repository Guidelines for WiFi Handshake Capture

This repository hosts the **WiFi Handshake Capture** React Native application, designed for advanced WiFi network diagnostics and packet analysis for legitimate security research purposes on iOS 19+ and Android. The following guidelines ensure production-ready code, compliance with Apple’s NetworkExtension framework, and support for ad-hoc sideloading, adhering to the principles of least privilege and public API usage.

## Development
- **Code Location**: All application code resides in the `wifi-handshake-c/` directory.
- **Production-Ready**: Deliver complete, functional code with no placeholders or incomplete flows. Implement robust error handling and logging (e.g., `os.log` for Swift, `console` for JavaScript) to ensure stability.
- **Type Safety**: Use TypeScript-friendly React Native patterns, ensuring strong typing for components, TurboModules, and data structures (e.g., `src/types/WiFiSniffer.ts`).
- **Public APIs and Tools**: Use only public APIs (e.g., CoreWLAN, NetworkExtension for iOS; WifiManager, VpnService for Android) and Apple-supported tools like rvictl for tethered packet analysis. Avoid unsupported low-level methods (e.g., direct routing table modifications) to ensure compatibility and security, per Apple’s NetworkExtension framework guidelines.
- **NetworkExtension Compliance**: Implement NetworkExtension providers (e.g., NEPacketTunnelProvider for IP capture) as separate processes, configuring entitlements (`com.apple.developer.networking.networkextension`) and virtual interfaces correctly. Use `includedRoutes` and `excludedRoutes` to prevent traffic loops.
- **Cross-Platform**: Support stock iOS 19+ (via app extensions) and Android (no-root/rooted), using `Platform.OS` checks for platform-specific logic.
- **Sideloading**: Optimize for ad-hoc deployment via Xcode (`ios/WiFiHandshakeCapture.xcworkspace`) or AltStore, ensuring proper code signing and entitlements.
- **Research Focus**: Frame all functionality as legitimate security research, focusing on WiFi scanning, IP packet analysis, and tethered 802.11 frame analysis (e.g., EAPOL frames via rvictl PCAP import).

## Formatting
- Format code with Prettier: `npx prettier --write <files>` or `npx prettier --write .`.
- Ensure ESLint compliance: `npm run lint` in `wifi-handshake-c/`.
- Follow `.prettierrc` and `.eslintrc.js` for consistent style.

## Testing
- Run tests from `wifi-handshake-c/` using `npm test` before committing. Update Jest tests in `specs/__tests__/WifiCaptureSpec.test.ts` for scanning, IP analysis, and tethered capture.
- Verify on iOS 19 simulator/device (e.g., iPhone 16 Pro) and Android emulator.
- Test key features: WiFi scanning (SSIDs, RSSI, security types), IP packet analysis (protocol, IP/port), tethered 802.11 capture (EAPOL frames), and PCAP export.
- Log errors using `os.log` (Swift) and `console` (JavaScript) for debugging, referencing `NEProviderStopReason` for NetworkExtension issues.

## Dependency Management
- Update deprecated packages in `package.json` (e.g., `metro-react-native-babel-preset` to `@react-native/babel-preset@latest`, `eslint` to latest, `react-native-vector-icons` per migration guide: https://github.com/oblador/react-native-vector-icons/blob/master/MIGRATION.md).
- Resolve npm vulnerabilities: Run `npm audit fix --force` and verify with `npm audit`.
- Update npm to 11.6.0: `npm install -g npm@11.6.0`.
- Update `ios/Podfile` for dependencies like `libpcap` (`pod 'libpcap', :git => 'https://github.com/libpcap/libpcap.git'`) and run `npx pod-install`.

## Build and Sideloading
- Build iOS using Xcode (`ios/WiFiHandshakeCapture.xcworkspace`) with a valid signing certificate.
- Export IPA for AltStore: `xcodebuild -archivePath build/WiFiHandshakeCapture.xcarchive archive`.
- Configure entitlements in `ios/WiFiHandshakeCapture/WifiCapture.entitlements` with `com.apple.developer.networking.wifi-info` and `com.apple.developer.networking.networkextension` (array values: `packet-tunnel-provider`).
- For Android, build with `npx react-native run-android` or generate APK via Gradle.

## Notes
- Adhere to NetworkExtension’s multi-process model, using NEPacketTunnelProvider for IP capture and rvictl for tethered 802.11 analysis to ensure stock iOS compatibility.
- Detect jailbreak (`/var/jb`) for logging but rely on public APIs and rvictl for core functionality.
- Reference Network Analyzer or Apple’s WWDC sessions (e.g., NetworkExtension framework) for public API optimization.
- Ensure production-ready code with comprehensive error handling, documentation, and compliance with Apple’s security and privacy guidelines.
