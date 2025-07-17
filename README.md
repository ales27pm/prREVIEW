# PR Review Extension

This project hosts a Chrome extension that uses AI to review GitHub pull requests.
All extension code lives in the `extension/` folder.

## Getting Started

1. **Clone the repository** and install dependencies:

   ```bash
   git clone https://github.com/your-org/pr-review-extension.git
   cd pr-review-extension
   npm install
   ```

2. **Configure API keys.** Copy `.env.example` to `.env` and add your GitHub and
   OpenAI credentials. Copy `extension/settings.example.json` to
   `extension/settings.local.json` for non-secret settings. The extension reads
   tokens from environment variables so they are never stored in source control.

3. **Format and test.** Use Prettier to format your code and run the test
   suite before committing:

   ```bash
   npm run format
   npm test
   ```

4. **Load the extension** in Chrome: navigate to `chrome://extensions`,
   enable Developer Mode and load the `extension/` folder as an unpacked
   extension.

### Troubleshooting

- Ensure you are using a recent LTS version of Node (18+).
- If `npm install` fails, delete `node_modules` and try again.
- When the extension cannot find API keys, verify that
  `.env` contains valid credentials or re-enter them via the options page.
- Tests failing due to missing modules can often be fixed by running
  `npm install`.
