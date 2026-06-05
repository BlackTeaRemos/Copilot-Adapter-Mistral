# Copilot Adapter - Mistral

<p align="center">
  <img src=".github/asset/icon.png" alt="Copilot Adapter - Mistral" width="128" height="128">
</p>

<p align="center">
  <strong>Copilot extension for seamless integration with Mistral AI models</strong>
</p>

<p align="center">
  <a href="https://mistral.ai">Mistral AI</a> •
  <a href="https://docs.mistral.ai/api">Mistral API Docs</a> •
  <a href="https://console.mistral.ai/">Get Mistral API Key</a>
</p>

<p align="center">
  <small>Based on <a href="https://github.com/selfagency/mistral-models-vscode">selfagency/mistral-models-vscode</a>, which was based on <a href="https://github.com/OEvortex/vscode-mistral-copilot-chat">OEvortex/vscode-mistral-copilot-chat</a> (now discontinued). Substantially rewritten.</small>
</p>

## Why?

The idea is great. Implementation lacked elements I wanted, so I polished and reworked the codebase into modular, thoroughly tested, and maintainable architecture. Big thanks for the idea and inspiration to selfagency and OEvortex.

## Need more?

Open an issue for any feature you want which i will evaluate on a case by case basis. I will try to keep the extension as simple as possible, and as feature-perfect to the Copilot Chat experience as possible, but i am open to suggestions.

## Features

- **All Mistral Models** - Dynamic Mistral model fetching
- **Model Picker** - Sensible UI for selecting Mistral models in Copilot Chat
- **Tool Calling** - Full function call support for the model through the Copilot API
- **Full Copilot Chat Compatibility** - Seamless integration with existing Copilot Chat conversations

## Requirements

- **VS Code** 1.109.0 or higher
- **GitHub Copilot Chat** extension installed
- A valid **Mistral AI API key**

## Installation

1. **Install from VS Code Marketplace** (or install the `.vsix` file)
2. **Open Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. **Run:** `Mistral: Manage API Key`
4. **Enter your API key** from [console.mistral.ai](https://console.mistral.ai/)

## Getting Your API Key

1. Go to [Mistral AI Console](https://console.mistral.ai/)
2. Sign up or log in with your account
3. Navigate to **API Keys** section
4. Click **Create new key**
5. Copy the key and paste it into VS Code when prompted

## Development

Development streamlined to work with following tools:
- Prettier
- ESLint
- Vitest
- Bun

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [bun](https://bun.sh/) (version pinned in `package.json`)
- [VS Code](https://code.visualstudio.com/) 1.109.0+

### Build

```bash
bun install
bun run compile        # type-check + lint + bundle
bun run watch          # parallel watch for type-check and bundle
```

### Testing

```bash
bun run test           # unit tests (Vitest)
bun run test:coverage  # unit tests with coverage
bun run test:extension # VS Code integration tests
```

### Debugging

Open the project in VS Code and press **F5** to launch the Extension Development Host with the extension loaded.

## Disclaimer

This extension is not affiliated with, endorsed by, or associated with Mistral AI or Microsoft. "Mistral" is a trademark of Mistral AI. "Copilot" is a trademark of Microsoft. All trademarks are property of their respective owners.

## License

MIT License - See [LICENSE](LICENSE) for details.

This extension bundles third-party open-source packages. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for their licenses and attributions.
