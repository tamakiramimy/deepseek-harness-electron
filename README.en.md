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

### Configure a global `dsh` command

The Runtime Bundle includes the `dsh` CLI. Install Node.js 22 or newer, then add the matching Runtime's `node_modules/.bin` directory to `PATH`. These examples assume the bundle is extracted to `~/Applications/DeepSeek-Harness-Dist`.

macOS (Apple Silicon; use `darwin-x64` instead on Intel):

```sh
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/Applications/DeepSeek-Harness-Dist/darwin-arm64/node_modules/.bin/dsh" "$HOME/.local/bin/dsh"
ln -sfn "$HOME/Applications/DeepSeek-Harness-Dist/darwin-arm64/node_modules/.bin/pnpm" "$HOME/.local/bin/pnpm"
grep -q 'HOME/.local/bin' "$HOME/.zshrc" || printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
source "$HOME/.zshrc"
dsh --version
pnpm --version
```

Windows PowerShell (x64; use `win32-arm64` on ARM):

```powershell
$Bin = "$HOME\Applications\DeepSeek-Harness-Dist\win32-x64\node_modules\.bin"
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($UserPath -split ';') -notcontains $Bin) {
  [Environment]::SetEnvironmentVariable('Path', "$Bin;$UserPath", 'User')
}
# Reopen PowerShell, then verify
dsh --version
```

Install the plugin market into the default CLI profile (`~/.dsh`):

```sh
dsh plugin --profile web add dshmarket
```

The desktop app has its own `$DSH_HOME`. Install a plugin into the desktop app's `web` profile with:

```sh
DSH_HOME="$HOME/Library/Application Support/deepseek-harness-electron/harness" \
  dsh plugin --profile web add dshmarket
```

Windows PowerShell:

```powershell
$env:DSH_HOME = "$env:APPDATA\deepseek-harness-electron\harness"
dsh plugin --profile web add dshmarket
```

This release also installs `dshmarket` automatically on the desktop app's first start. Verify the default CLI profile with:

```sh
dsh --profile web --dump-config | grep dshmarket
```

## Key Features

### Built-in Proxy Configuration

Configure HTTP / HTTPS proxy directly from the desktop workbench — no system settings or environment variables to change. The Harness runtime restarts automatically when you save.

![Proxy settings](docs/images/proxy-settings.png)

### Built-in Plugin Market

The community plugin market `dshmarket` is seeded into the `web` profile on first start, so plugins can be browsed and installed from the Web UI right away.

The Runtime Dist bundles pnpm, and the desktop shell writes shims into `$DSH_HOME/.desktop-bin/` and puts them on the Harness child's PATH. End users therefore need neither Node nor pnpm installed — `dsh plugin` reaches its package manager by bare name and fails with exit code 127 when none is found.

Seeding the market needs the npm registry. When the network is unreachable on first start, it is skipped with the reason recorded in `profiles/web/.market-seed-failed`, the Harness starts as usual, and the next start after 24 hours retries. On a corporate network, configure **Proxy** first.

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
| Desktop Shell | v0.1.6 |
| DeepSeek Harness Runtime | `@deepseek-ai/dsh` v0.1.1-rc.2 |

## Changelog

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
