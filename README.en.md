# DeepSeek Harness Desktop

English | [中文](README.md)

`DeepSeek Harness Desktop` is an Electron desktop workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It embeds the official Harness Web UI into a native desktop window, ready to use out of the box.

## Quick Start

Download two files from [Releases](https://github.com/tamakiramimy/deepseek-harness-electron/releases):

1. **Shell installer** — choose one for your device:

| Device | Installer |
| --- | --- |
| macOS Apple Silicon | `DeepSeek.Harness.Desktop-<version>-darwin-arm64.dmg` |
| macOS Intel | `DeepSeek.Harness.Desktop-<version>-darwin-x64.dmg` |
| Windows ARM | `DeepSeek.Harness.Desktop-<version>-win32-arm64.exe` |
| Windows x64 | `DeepSeek.Harness.Desktop-<version>-win32-x64.exe` |

2. **Runtime Bundle** — shared across all platforms:

   `DeepSeek-Harness-Dist-<version>.zip`

Extract the Runtime Bundle and place the `DeepSeek-Harness-Dist` folder beside the application file, then launch:

```text
Application directory/
├── DeepSeek Harness Desktop.app   (or .exe)
└── DeepSeek-Harness-Dist/
```

![Directory structure](docs/images/directory-structure.png)

> The Shell selects the matching Runtime for your device automatically. No further setup is needed.

## Key Features

### Built-in Proxy Configuration

Configure HTTP / HTTPS proxy directly from the desktop workbench — no system settings or environment variables to change. The Harness runtime restarts automatically when you save.

![Proxy settings](docs/images/proxy-settings.png)

### Multimodal Vision Model Support

Supports `deepseek-v4-flash-vision-exp` and other vision models. Upload images directly in conversations for analysis.

![Vision model selection](docs/images/vision-model.png)

![Multimodal chat](docs/images/vision-chat.png)

### Current Versions

| Component | Version |
| --- | --- |
| Desktop Shell | v0.1.4 |
| DeepSeek Harness Runtime | `@deepseek-ai/dsh` v0.1.1-rc.2 |

## Changelog

**v0.1.4**

- Added Electron proxy configuration (HTTP / HTTPS / NO_PROXY) with automatic Harness restart on save
- Support for `deepseek-v4-flash-vision-exp` multimodal vision model
- Upgraded DeepSeek Harness Runtime to `@deepseek-ai/dsh` v0.1.1-rc.2
- Fixed extra browser window being opened on startup (added `--no-open` flag)

## Local Development

### Prerequisites

- Node.js `>= 22.19.0`
- Corepack and pnpm (this project uses pnpm `11.15.1`)

```sh
node --version  # >= 22.19.0
corepack enable
pnpm --version
```

### Setup & Run

```sh
# Install dependencies
pnpm install

# Create local Runtime Dist
pnpm harness:dist:install
pnpm harness:dist:validate

# Start development mode
pnpm dev
```

### Type-check & Build

```sh
pnpm typecheck
pnpm build
pnpm test
```

### Package

```sh
# macOS Apple Silicon
pnpm package:mac:arm64

# macOS Apple Silicon (with proxy — for corporate networks)
pnpm package:mac:arm64:proxy

# macOS Apple Silicon (with proxy + auto symlink Runtime)
pnpm package:mac:arm64:proxy:runtime

# Other platforms
pnpm package:mac:x64
pnpm package:win:arm64
pnpm package:win:x64
```

## CI / Release

The [package.yml](.github/workflows/package.yml) GitHub Actions workflow builds Shell installers and a Runtime Bundle for all four platforms.

- **Manual trigger**: select `Package Desktop Release` from the Actions tab; optionally specify `harness_version` (defaults to `0.1.1-rc.2`)
- **Auto trigger**: pushing a `v*` tag automatically builds and publishes a Release

The Runtime is built from the npm registry (`@deepseek-ai/dsh`), independent of the deepseek-harness source repository.

## Troubleshooting

### The Web UI starts but model requests fail

Check **Settings → Models** for a valid API key, provider, and model.

### Runtime Dist not found

Make sure the `DeepSeek-Harness-Dist` folder is in the same directory as the `.app` (or `.exe`) and contains `runtime-manifest.json`.

### Network requests fail

Click the **Proxy** button in the top-right corner, enter your HTTP/HTTPS proxy address (e.g. `http://127.0.0.1:7890`), and click **Save & apply**.

## Security Boundaries

- Renderer uses `contextIsolation` and `sandbox`; Node integration is disabled
- Preload exposes only a versioned, restricted desktop API
- Official Harness listens only on a random `127.0.0.1` loopback port
- Runtime manifest entry cannot escape the `DeepSeek-Harness-Dist/` root