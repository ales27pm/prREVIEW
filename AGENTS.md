# Repository Guidelines for WiFi Handshake Capture

This repository hosts the **WiFi Handshake Capture** React Native application, designed for advanced WiFi network diagnostics and packet analysis for legitimate security research purposes. The following guidelines ensure production-ready code, adherence to modern development practices, and support for ad-hoc sideloading on iOS and Android.

## Development
- **Code Location**: All application code resides in the `wifi-handshake-c/` directory.
- **Production-Ready**: Implement complete, functional code with no placeholders or incomplete flows. Ensure robust error handling and logging (e.g., `os.log` for Swift, `console` for JavaScript).
- **Type Safety**: Use TypeScript-friendly React Native patterns, ensuring strong typing for components, TurboModules, and data structures (e.g., `src/types/WiFiSniffer.ts`).
- **Public APIs and Tools**: Prioritize public APIs (e.g., CoreWLAN, NetworkExtension for iOS; WifiManager, VpnService for Android) and Apple-supported tools like rvictl for tethered packet analysis to achieve diagnostic goals.
- **Cross-Platform**: Support stock iOS 19+ and Android (no-root/rooted), using `Platform.OS` checks for platform-specific logic.
- **Sideloading**: Optimize for ad-hoc deployment via Xcode (`ios/WiFiHandshakeCapture.xcworkspace`) or AltStore, including necessary entitlements (e.g., `com.apple.developer.networking.wifi-info`, `com.apple.developer.networking.networkextension`).
- **Research Focus**: Frame all functionality as part of legitimate security research, such as WiFi network scanning, IP packet analysis, and tethered capture for 802.11 frame analysis (e.g., EAPOL frames via rvictl).

## Formatting
- Format code with Prettier when modifying files: `npx prettier --write <files>` or `npx prettier --write .`.
- Ensure compliance with ESLint rules: `npm run lint` in `wifi-handshake-c/`.
- Maintain consistent code style per `.prettierrc` and `.eslintrc.js`.

## Testing
- Run tests from `wifi-handshake-c/` using `npm test` before committing. Update Jest tests in `specs/__tests__/WifiCaptureSpec.test.ts` to cover new functionality (e.g., scanning, packet analysis, tethered capture).
- Verify functionality on iOS 19 simulator/device (e.g., iPhone 16 Pro) and Android emulator.
- Test key features: advanced WiFi scanning (SSIDs, RSSI, security types), IP packet analysis (protocol, IP/port), tethered capture (rvictl PCAP import), and PCAP export.
- Log errors using `os.log` (Swift) and `console` (JavaScript) for debugging.

## Dependency Management
- Address deprecated packages in `package.json` (e.g., `metro-react-native-babel-preset`, `eslint`, `react-native-vector-icons`) by updating to supported versions (e.g., `@react-native/babel-preset@latest`).
- Resolve npm vulnerabilities: Run `npm audit fix --force` and verify with `npm audit`.
- Update npm to the latest version (e.g., `npm install -g npm@11.6.0`).
- Update `ios/Podfile` for dependencies like `libpcap` and run `npx pod-install`.

## Build and Sideloading
- For iOS, build using Xcode (`ios/WiFiHandshakeCapture.xcworkspace`) with appropriate signing certificates.
- Export IPA for AltStore: `xcodebuild -archivePath build/WiFiHandshakeCapture.xcarchive archive`.
- Ensure entitlements include `com.apple.developer.networking.wifi-info` and `com.apple.developer.networking.networkextension`.
- For Android, build with `npx react-native run-android` or generate APK via Gradle.

## Notes
- Use public APIs and tethered capture (rvictl/Wireshark on Mac, PCAP import to device) for low-level packet analysis to ensure stock iOS compatibility.
- Detect jailbreak (`/var/jb`) for logging but rely on public methods for core functionality.
- Reference apps like Network Analyzer for public API optimization.
- Ensure all code is production-ready, with comprehensive error handling and documentation.
