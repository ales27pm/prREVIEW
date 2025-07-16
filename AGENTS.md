# Repo Guidelines

This repository contains a Chrome extension that provides AI-powered pull request reviews.

## Development
- Use plain JavaScript for extension scripts.
- Place all extension code in the `extension/` directory.
- Format code with Prettier (`npx prettier --write .`).
- Run `npm test` before committing.

## Testing
- `npm test` currently just runs Prettier in check mode to ensure formatting.
- Future tests may be added under `test/`.
