# WiFi Handshake Capture

This repository contains the **WiFi Handshake Capture** React Native application. The app scans for nearby Wi-Fi networks and walks an operator through collecting handshake captures for offline analysis. All source code lives in the [`wifi-handshake-c/`](wifi-handshake-c/) directory.

## Project structure

```
wifi-handshake-c/
├── App.tsx                # Application entry point
├── src/                   # Reusable hooks, components and services
├── ios/                   # Native iOS workspace and configuration
├── metro.config.js        # Metro bundler configuration
└── tsconfig.json          # TypeScript compiler options
```

## Getting started

1. **Install dependencies**

   ```bash
   cd wifi-handshake-c
   npm install
   ```

2. **Run the Metro bundler**

   ```bash
   npm start
   ```

3. **Launch a native target**

   - iOS (simulator): `npm run ios`
   - Android (device/emulator): `npm run android`

4. **Run a local iOS build without signing**

   ```bash
   npm run ios:build
   ```

   The command builds the iOS workspace for the simulator, which is useful when Xcode signing assets are unavailable (for example on CI or when working without provisioning profiles).

## Quality checks

- Lint the codebase with `npm run lint`.
- Execute the Jest test suite with `npm test`. The command is configured to succeed even when no test files are present so CI pipelines remain green until tests are added.

## Licensing

Refer to the project owner for licensing terms.
