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
   When entered via the options page, credentials are saved only to Chrome's
   local storage and will not sync across browsers.

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

### Advanced Model Fine-tuning

The `training/peft_train.py` script demonstrates how to fine-tune an open-source model using LoRA and the curated feedback dataset.

**Prerequisites:**

```bash
pip install transformers datasets peft torch
```

**Data Format:**

The dataset should be a JSON array of records with `prompt`, `completion`, and `adopted` fields. Example:

```json
[
  {
    "prompt": "Review this code: function add(a, b) { return a + b; }",
    "completion": "This function looks good. Consider adding type annotations.",
    "adopted": true
  }
]
```

**Usage:**

```bash
python training/peft_train.py data/feedback.json codellama/CodeLlama-7b-hf adapters/
```
