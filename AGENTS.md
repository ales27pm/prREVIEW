# Repo Guidelines

This repository contains a Chrome extension that provides AI-powered pull request reviews.

## Development
- Use plain JavaScript for extension scripts.
- Place all extension code in the `extension/` directory.
- Format code with Prettier (`npx prettier --write .`).
- Run `npm test` before committing.

## Testing
- `npm test` runs a two-stage process. First, it runs Prettier in check mode to ensure all code is correctly formatted. If that passes, it executes the Jest test suite.
- Future tests may be added under `test/`.
