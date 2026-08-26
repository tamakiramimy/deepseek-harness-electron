# DeepSeek Harness Desktop

[English](README.en.md) | 中文

`DeepSeek Harness Desktop` 是给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 准备的 Electron 桌面工作台。将官方 Harness Web UI 嵌入原生桌面窗口，开箱即用。

## 快速开始

从 [Releases](https://github.com/tamakiramimy/deepseek-harness-electron/releases) 下载两个文件：

1. **Shell 安装包** — 根据你的设备选择：

| 设备 | 安装包 |
| --- | --- |
| macOS Apple Silicon | `DeepSeek.Harness.Desktop-<version>-darwin-arm64.dmg` |
| macOS Intel | `DeepSeek.Harness.Desktop-<version>-darwin-x64.dmg` |
| Windows ARM | `DeepSeek.Harness.Desktop-<version>-win32-arm64.exe` |
| Windows x64 | `DeepSeek.Harness.Desktop-<version>-win32-x64.exe` |

2. **Runtime Bundle** — 所有平台共用：

   `DeepSeek-Harness-Dist-<version>.zip`

将 Runtime Bundle 解压后，把 `DeepSeek-Harness-Dist` 文件夹放到应用文件旁边，启动应用即可：

```text
应用所在目录/
├── DeepSeek Harness Desktop.app   (或 .exe)
└── DeepSeek-Harness-Dist/
```

![目录结构](docs/images/directory-structure.png)

> Shell 会自动选择当前设备所需的 Runtime，无需额外设置。

### 配置全局 `dsh` 命令

Runtime Bundle 本身包含 `dsh` CLI。先安装 Node.js 22 或更高版本，再将与你平台匹配的 Runtime 中的 `node_modules/.bin` 加入 `PATH`。以下示例假设 Runtime Bundle 已解压到 `~/Applications/DeepSeek-Harness-Dist`。

macOS（Apple Silicon；Intel 设备把 `darwin-arm64` 改成 `darwin-x64`）：

```sh
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/Applications/DeepSeek-Harness-Dist/darwin-arm64/node_modules/.bin/dsh" "$HOME/.local/bin/dsh"
ln -sfn "$HOME/Applications/DeepSeek-Harness-Dist/darwin-arm64/node_modules/.bin/pnpm" "$HOME/.local/bin/pnpm"
grep -q 'HOME/.local/bin' "$HOME/.zshrc" || printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
source "$HOME/.zshrc"
dsh --version
pnpm --version
```

Windows PowerShell（x64；ARM 设备把 `win32-x64` 改成 `win32-arm64`）：

```powershell
$Bin = "$HOME\Applications\DeepSeek-Harness-Dist\win32-x64\node_modules\.bin"
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($UserPath -split ';') -notcontains $Bin) {
  [Environment]::SetEnvironmentVariable('Path', "$Bin;$UserPath", 'User')
}
# 重新打开 PowerShell 后验证
dsh --version
```

为默认 CLI profile（`~/.dsh`）安装插件市场：

```sh
dsh plugin --profile web add dshmarket
```

桌面应用使用自己的 `$DSH_HOME`。要把插件安装到桌面应用的 `web` profile，请执行：

```sh
DSH_HOME="$HOME/Library/Application Support/deepseek-harness-electron/harness" \
  dsh plugin --profile web add dshmarket
```

Windows PowerShell：

```powershell
$env:DSH_HOME = "$env:APPDATA\deepseek-harness-electron\harness"
dsh plugin --profile web add dshmarket
```

本版本首次启动桌面应用时也会自动安装 `dshmarket`。验证默认 CLI profile 的安装结果：

```sh
dsh --profile web --dump-config | grep dshmarket
```

## 主要特性

### 内置代理配置

支持在桌面工作台内直接配置 HTTP / HTTPS 代理，无需修改系统设置或环境变量。配置后会自动重启 Harness 运行时使其生效。

![代理配置](docs/images/proxy-settings.png)

### 内置插件市场

首次启动时会自动把社区插件市场 `dshmarket` 装入 `web` profile，之后可直接在 Web UI 内浏览和安装插件。

Runtime Dist 自带 pnpm，桌面端会在 `$DSH_HOME/.desktop-bin/` 写入 shim 并加进 Harness 子进程的 PATH。因此终端用户机器上无需安装 Node 或 pnpm —— `dsh plugin` 按裸名调用包管理器，缺失时会以退出码 127 失败。

市场安装需要访问 npm registry。若首次启动时网络不通，会跳过并在 `profiles/web/.market-seed-failed` 记录原因，Harness 照常启动；24 小时后下次启动重试。企业网络下建议先在右上角 **Proxy** 配好代理。

![插件市场](docs/images/plugin-market.png)

### 多模态视觉模型支持

支持 `deepseek-v4-flash-vision-exp` 等视觉模型，可直接在对话中上传图片进行分析。

第三方 OpenAI Responses / Chat Completions / Anthropic provider 的模型能力可在 **模型 > 自定义设置 > 模型能力** 中逐模型配置。选择“文本 + 图片”会写入 `input: [text, image]`；选择思考等级会写入该模型的 `reasoningEfforts`，模型选择器随后会显示对应档位。

手工编辑 `settings.yaml` 时请注意：第三方 `llm-pi-ai` provider 使用模型级 `input` 和 `reasoningEfforts`，图片请求预算使用 provider 级 `requestImagePixelBudget` 与 `requestImageMaxBytes`。`inputModalities`、`imagePixelBudget`、`imageMaxBytes` 是 DeepSeek 官方适配器字段，放入第三方模型不会声明其视觉能力。

参考 JSON（也可按相同结构写入 YAML；请将示例地址、模型和环境变量改为你的实际值）：

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

`api` 可使用 Runtime 支持的 `openai-responses`、`openai-completions` 或 `anthropic-messages`。`reasoningEfforts` 的值会原样传给对应 adapter；只配置上游实际支持的等级。OpenAI 兼容服务通常需要以 `/v1` 结尾的 `baseURL`，具体以服务商文档为准。API Key 应放在 `$DSH_HOME/.credentials.yaml` 或环境变量中，不要直接写入 README 或提交到 Git。

![第三方模型的视觉与思考等级](docs/images/third-party-model-capabilities.png)

![视觉模型选择](docs/images/vision-model.png)

![多模态对话](docs/images/vision-chat.png)

### 当前版本

| 组件 | 版本 |
| --- | --- |
| 桌面外壳 | v0.1.6 |
| DeepSeek Harness Runtime | `@deepseek-ai/dsh` v0.1.1-rc.2 |

## 更新日志

**v0.1.6**

- Runtime 内置 pnpm，首次启动自动安装 `dshmarket` 插件市场，并支持失败后延迟重试
- 第三方 `llm-pi-ai` 模型支持在设置界面配置视觉输入与思考等级
- Runtime 构建阶段自动修补并校验模型能力字段，重复执行保持幂等
- 补充 Release Runtime 的全局 `dsh`、插件安装及第三方模型 JSON 配置说明

**v0.1.5**

- 新增 Electron 桌面代理配置功能（HTTP / HTTPS / NO_PROXY），配置后自动重启 Harness
- 支持最新 `deepseek-v4-flash-vision-exp` 多模态视觉模型
- 升级内置 DeepSeek Harness Runtime 至 `@deepseek-ai/dsh` v0.1.1-rc.2
- 修复启动时额外弹出浏览器窗口的问题（增加 `--no-open` 参数）
- GitHub Actions 标签发布固定使用 `@deepseek-ai/dsh` v0.1.1-rc.2，并在 Runtime manifest 记录实际安装版本

## 本地开发

### 前置条件

- Node.js `>= 22.19.0`
- Corepack 和 pnpm（本项目使用 pnpm `11.15.1`）

```sh
node --version  # >= 22.19.0
corepack enable
pnpm --version
```

### 安装与运行

```sh
# 安装依赖
pnpm install

# 创建本地 Runtime Dist
pnpm harness:dist:install
pnpm harness:dist:validate

# 启动开发模式
pnpm dev
```

### 类型检查与构建

```sh
pnpm typecheck
pnpm build
pnpm test
```

### 打包

```sh
# macOS Apple Silicon
pnpm package:mac:arm64

# macOS Apple Silicon（带代理 — 适用于企业网络环境）
pnpm package:mac:arm64:proxy

# macOS Apple Silicon（带代理 + 自动软链 Runtime）
pnpm package:mac:arm64:proxy:runtime

# 其他平台
pnpm package:mac:x64
pnpm package:win:arm64
pnpm package:win:x64
```

## CI / Release

GitHub Actions 工作流 [package.yml](.github/workflows/package.yml) 自动构建四个平台的 Shell 安装包和 Runtime Bundle。

- **手动触发**：在 Actions 页面选择 `Package Desktop Release`，可选指定 `harness_version`（默认 `0.1.1-rc.2`）
- **自动触发**：推送 `v*` 标签时自动构建并发布 Release

Runtime 构建时从 npm registry 拉取 `@deepseek-ai/dsh`，无需依赖 deepseek-harness 源码仓库。

## 常见问题

### 官方 Web UI 能打开但不能发送消息

在 **Settings → Models** 中检查是否已保存有效 API Key、provider 和模型。

### 提示找不到 Runtime Dist

确保 `DeepSeek-Harness-Dist` 文件夹与 `.app` 放在同一目录下，且包含 `runtime-manifest.json`。

### 网络请求失败

点右上角 **Proxy** 按钮，填入 HTTP/HTTPS 代理地址（如 `http://127.0.0.1:7890`），点击 **Save & apply** 即可。

## 安全边界

- Renderer 启用 `contextIsolation` 和 `sandbox`，没有 Node integration
- Preload 仅暴露版本化、受限的桌面 API
- Official Harness 仅监听随机 `127.0.0.1` loopback 端口
- Runtime manifest 不允许 CLI entry 逃逸出 `DeepSeek-Harness-Dist/` 根目录
