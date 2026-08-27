# DeepSeek Harness Desktop

English | [中文](README.md)

`DeepSeek Harness Desktop` is an Electron desktop workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It embeds the official Harness Web UI into a native desktop window, ready to use out of the box.

## Quick Start

Download one file matching your device from [Releases](https://github.com/tamakiramimy/deepseek-harness-electron/releases). Each artifact includes its architecture-specific Runtime; no separate `DeepSeek-Harness-Dist` download or copy is required.

| Device | Installer / portable app |
| --- | --- |
| macOS Apple Silicon | `DeepSeek Harness Desktop-<version>-mac-arm64.dmg` |
| macOS Intel | `DeepSeek Harness Desktop-<version>-mac-x64.dmg` |
| Windows ARM64 | `...-win-arm64-setup.exe` or `...-win-arm64-portable.exe` |
| Windows x64 | `...-win-x64-setup.exe` or `...-win-x64-portable.exe` |

Windows `setup.exe` uses an assisted installer and lets you select the installation directory. `portable.exe` is a single-file, no-install executable that self-extracts when launched. On first start, the app verifies the Runtime SHA-256 and extracts it into user data for reuse.

## Key Features

### Built-in Proxy Configuration

Configure HTTP / HTTPS proxy directly from the desktop workbench — no system settings or environment variables to change. The Harness runtime restarts automatically when you save.

![Proxy settings](docs/images/proxy-settings.png)

### Built-in Plugin Market

The community plugin market `dshmarket` is optional. App startup does not depend on it; use **Install** in the shell's **Plugin market** settings when needed, or **Retry** after a failure.

The Runtime Dist bundles pnpm, and the desktop shell writes shims into `$DSH_HOME/.desktop-bin/` and puts them on the Harness child's PATH. End users therefore need neither Node nor pnpm installed — `dsh plugin` reaches its package manager by bare name and fails with exit code 127 when none is found.

Installing the market needs the npm registry. A failure does not interrupt Harness startup. On a corporate network, configure **Proxy** and retry.

![Plugin market](docs/images/plugin-market.png)

### Multimodal Vision Model Support

Supports `deepseek-v4-flash-vision-exp` and other vision models. Upload images directly in conversations for analysis.

Configure each model of a third-party OpenAI Responses, Chat Completions, or Anthropic provider under **Models > Customized settings > Model capabilities**. Selecting Text + images writes `input: [text, image]`; selecting reasoning levels writes the model's `reasoningEfforts`, which makes those levels available in the model picker.

When editing `settings.yaml` directly, third-party `llm-pi-ai` providers use model-level `input` and `reasoningEfforts`, plus provider-level `requestImagePixelBudget` and `requestImageMaxBytes`. The fields `inputModalities`, `imagePixelBudget`, and `imageMaxBytes` belong to the official DeepSeek adapter and do not declare vision support on a third-party model.

Reference JSON (the same structure can be written as YAML; replace the sample URL, model, and environment variable with your own values):

```json
{
  "llm-pi-ai": {
    "providers": {
      "example": {
        "displayName": "Example API",
        "apiKeyEnv": "EXAMPLE_API_KEY",
        "api": "openai-responses",
        "baseURL": "https://api.example.com/v1",
        "requestImagePixelBudget": 640000,
        "requestImageMaxBytes": 1048576,
        "models": [
          {
            "id": "example-vision-model",
            "name": "Example Vision Model",
            "contextWindow": 1000000,
            "input": ["text", "image"],
            "reasoningEfforts": {
              "off": null,
              "low": "low",
              "medium": "medium",
              "high": "high",
              "xhigh": "xhigh"
            }
          }
        ]
      }
    }
  }
}
```

`api` may be any Runtime-supported adapter, including `openai-responses`, `openai-completions`, or `anthropic-messages`. Values in `reasoningEfforts` are passed through to that adapter, so list only levels supported by the upstream API. OpenAI-compatible services commonly require a `/v1` suffix in `baseURL`; follow your provider's documentation. Store API keys in `$DSH_HOME/.credentials.yaml` or environment variables, never in README or Git.

![Third-party vision and reasoning levels](docs/images/third-party-model-capabilities.png)

![Vision model selection](docs/images/vision-model.png)

![Multimodal chat](docs/images/vision-chat.png)

### Current Versions

| Component | Version |
| --- | --- |
| Desktop Shell | v0.1.7 |
| DeepSeek Harness Runtime | `@deepseek-ai/dsh` v0.1.1-rc.2 |

## Changelog

**v0.1.7**

- Bundled a matching Runtime in every artifact with verified first-start extraction and reuse
- Added assisted installers and Portable single EXEs for both Windows x64 and ARM64
- Made `dshmarket` an explicit optional install that cannot block Harness startup
- Bundled pnpm and pinned every desktop `dsh` invocation to the managed Runtime
- Fixed premature IPC disconnection in the Windows physical-drive directory picker
- Applied proxy settings to Electron, Node, npm/pnpm, and common Git environment variables

**v0.1.6**

- Bundled pnpm in the Runtime, seeded the `dshmarket` plugin market on first start, and added delayed retry after failures
- Added vision input and reasoning-level settings for third-party `llm-pi-ai` models
- Added an idempotent Runtime build patch and validation for model capability fields
- Documented global `dsh`, plugin installation, and third-party model JSON configuration for Release artifacts

**v0.1.5**

- Added Electron proxy configuration (HTTP / HTTPS / NO_PROXY) with automatic Harness restart on save
- Support for `deepseek-v4-flash-vision-exp` multimodal vision model
- Upgraded DeepSeek Harness Runtime to `@deepseek-ai/dsh` v0.1.1-rc.2
- Fixed extra browser window being opened on startup (added `--no-open` flag)
- GitHub Actions tag releases now pin `@deepseek-ai/dsh` to v0.1.1-rc.2 and record the installed version in the Runtime manifest

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

### Type-check

```sh
pnpm typecheck
pnpm test
```

Release builds (Runtime installation, archiving, and electron-builder) run only on native GitHub Actions runners, not on developer machines.

## CI / Release

The [package.yml](.github/workflows/package.yml) GitHub Actions workflow builds, prunes, and verifies a Runtime on each of four native runners, then embeds that single-architecture archive into its matching desktop artifact. It produces two macOS DMGs plus assisted NSIS and Portable executables for each Windows architecture.

- **Manual trigger**: select `Package Desktop Release` from the Actions tab; optionally specify `harness_version` (defaults to `0.1.1-rc.2`)
- **Auto trigger**: pushing a `v*` tag automatically builds and publishes a Release

The Runtime is built from the npm registry (`@deepseek-ai/dsh`), independent of the deepseek-harness source repository.

## Troubleshooting

### The Web UI starts but model requests fail

Check **Settings → Models** for a valid API key, provider, and model.

### Runtime verification or extraction fails

Download the release artifact matching your system architecture again. Runtime target, manifest, and SHA-256 verification prevent manual replacement.

### Network requests fail

Click the **Proxy** button in the top-right corner, enter your HTTP/HTTPS proxy address (e.g. `http://127.0.0.1:7890`), and click **Save & apply**.

## Security Boundaries

- Renderer uses `contextIsolation` and `sandbox`; Node integration is disabled
- Preload exposes only a versioned, restricted desktop API
- Official Harness listens only on a random `127.0.0.1` loopback port
- Runtime packages are verified by SHA-256, target architecture, and CLI entry boundaries
