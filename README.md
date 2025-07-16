# PR Review Extension

This project hosts a Chrome extension that uses AI to review GitHub pull requests.
All extension code lives in the `extension/` folder.

To develop:
1. Install dependencies with `npm install`.
2. Run `npm run format` to format code.
3. Run `npm run lint` (or `npm test`) before committing to ensure formatting passes.
4. Load the extension in Chrome by navigating to `chrome://extensions`, enabling *Developer Mode*, and choosing **Load unpacked** to select the `extension/` folder.
5. Open the extension settings to save your GitHub and OpenAI tokens.
