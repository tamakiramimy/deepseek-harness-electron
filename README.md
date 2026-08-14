# DeepSeek Harness Desktop

`DeepSeek Harness Desktop` 是给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 准备的 Electron 桌面工作台。

当前仓库是 Electron 外壳：负责窗口、安全隔离、工作区选择和本地进程管理。官方 DeepSeek Harness 位于独立的 `DeepSeek-Harness-Dist/` 目录中，用户可以自行构建、更新或整个替换该目录。

启动应用后，Electron Utility Host 从该目录启动官方 Harness Web UI；服务绑定随机 loopback 端口，并嵌入 Electron 窗口中央区域。Electron 项目本身不锁定 `@deepseek-ai/dsh` 的版本。

## 当前状态

| 能力 | 当前状态 |
| --- | --- |
| 官方 DeepSeek Harness Web UI | 由 Electron Utility Host 自动启动并嵌入中央区域 |
| Electron 桌面壳 | 可启动、选择并记住工作区、显示 Host 状态 |
| Electron 内嵌官方会话/Agent | 可在中央官方 Harness 面板中配置模型、创建会话和运行 Agent |
| Runtime | 从可替换的 `DeepSeek-Harness-Dist/` 加载，每次启动使用独立 `DSH_HOME` |

## 前置条件

- Node.js `>= 22.19.0`。官方 Harness 当前支持 Node `^22.19.0 || >=24`。
- Corepack 和 pnpm：官方 Harness 固定使用 pnpm 11；本项目使用 pnpm `11.15.1`。
- Git。
- 可选：DeepSeek API Key。没有 Key 也可以启动 Web UI，但不能发起模型请求。

检查环境：

```sh
node --version
corepack enable
pnpm --version
```

## 使用约定

除非另有说明，后续命令都在项目根目录执行。若当前位于 Git 工作区的任意子目录，可先运行：

```sh
cd "$(git rev-parse --show-toplevel)"
```

## 一次性安装

### 安装 Electron 桌面项目

```sh
cd "$(git rev-parse --show-toplevel)"
pnpm install
```

### 创建默认官方 Runtime Dist

首次运行前，创建可替换的 `DeepSeek-Harness-Dist/`：

```sh
pnpm harness:dist:install
pnpm harness:dist:validate
```

默认安装当前 npm registry 的官方 `@deepseek-ai/dsh`。生成后的目录结构如下：

```text
DeepSeek-Harness-Dist/
	runtime-manifest.json
	package.json
	package-lock.json
	node_modules/
		@deepseek-ai/dsh/lib/bin.js
		@deepseek-ai/dsh-web-frontend/dist/
		...官方 Host、插件和原生模块...
```

这个目录被 `.gitignore` 排除，不会被提交进 Electron 外壳仓库。参考模板位于 [DeepSeek-Harness-Dist.example](DeepSeek-Harness-Dist.example)。

如果公司网络或代理环境导致 Electron 二进制首次下载失败，设置常规代理变量后重新安装二进制：

```sh
export HTTP_PROXY=http://proxy.example:8080
export HTTPS_PROXY=http://proxy.example:8080
ELECTRON_GET_USE_PROXY=true pnpm exec install-electron --no
```

不要把代理地址、账号、密码或 API Key 写入本仓库的 Git 跟踪文件。

## 运行桌面应用

```sh
cd "$(git rev-parse --show-toplevel)"
pnpm dev
```

这会执行以下步骤：

1. 启动 Electron/Vite 开发环境。
2. 创建独立的 Utility Host。
3. 由 Utility Host 使用 Electron 自带 Node runtime 启动官方 `dsh web`。
4. 通过 HTTP 就绪探测确认官方 Harness 已启动。
5. 将官方 Web UI 嵌入 Electron 工作台中央区域。

Harness 使用系统 `userData/harness` 目录作为自身的 `DSH_HOME`。它始终绑定随机 `127.0.0.1` 端口，不会暴露到局域网；窗口顶部状态栏会显示当前 loopback URL。

## 更新或替换官方 Runtime

Electron 只要求 Runtime Dist 根目录内有 `runtime-manifest.json`，且其中的 `entry` 指向同目录内的官方 CLI。默认 manifest：

```json
{
	"format": 1,
	"entry": "node_modules/@deepseek-ai/dsh/lib/bin.js"
}
```

### 使用其他 npm 版本

编辑 `DeepSeek-Harness-Dist/package.json` 中的 `@deepseek-ai/dsh` 版本，然后在该目录执行 npm install：

```sh
cd DeepSeek-Harness-Dist
npm install --omit=dev
cd ..
pnpm harness:dist:validate
```

也可以在创建目录前指定版本：

```sh
DEEPSEEK_HARNESS_VERSION=latest pnpm harness:dist:install
```

### 使用你自己从官方源码构建的 Runtime

可将整个 `DeepSeek-Harness-Dist/` 替换为自己构建的完整 Harness runtime。它不能只含 `apps/web/dist` 静态页面，还必须保留与 CLI 配套的 `node_modules`、Host 插件、动态 client bundles 与原生模块。

如果 CLI 位于源码构建的 `apps/cli/lib/bin.js`，将 manifest 改为：

```json
{
	"format": 1,
	"entry": "apps/cli/lib/bin.js"
}
```

然后运行：

```sh
pnpm harness:dist:validate
```

### 覆盖 Runtime 位置

使用环境变量指定任意绝对路径的 Runtime Dist：

```sh
DEEPSEEK_HARNESS_DIST="<runtime-dist-directory>" pnpm dev
```

发行版优先查找该环境变量，其次查找用户数据目录下的 `DeepSeek-Harness-Dist/`，最后使用安装包内置的 `Resources/DeepSeek-Harness-Dist/`。因此用户可在不修改应用包的情况下替换 runtime。

## 配置模型与工作区

应用启动后按以下顺序操作：

1. 打开 **Settings -> Models**。
2. 选择 DeepSeek 或添加兼容 OpenAI 的 provider。
3. 输入 API Key 并保存。官方 UI 对已保存的密钥只显示脱敏信息。
4. 点击 **Choose workspace**，选择需要让 Agent 读取或编辑的项目目录。
5. 创建会话并发送任务，例如：`概览这个仓库并说明主要模块。`

官方 Harness 也支持在启动前通过环境变量提供 Key：

```sh
export DEEPSEEK_API_KEY="<your-api-key>"
pnpm dev
```

`DEEPSEEK_BASE_URL` 是可选变量，可用于兼容 OpenAI 的私有网关或自定义端点。优先使用 Web UI 的 Models 页面管理密钥；不要将真实 Key 提交到 `.env`、README、终端录屏或 Git 历史。

桌面窗口中可：

- 在中央官方 Harness 页面中选择工作区、创建会话、选择模型和处理审批；
- 在顶部状态栏查看 Utility Host 与官方 Harness 的运行状态；
- 通过关闭桌面窗口停止 Utility Host 与官方 Harness 子进程。

停止服务时，在开发终端按 `Ctrl+C`。退出应用时 Utility Host 会停止其官方 Harness 子进程。

## 验证与打包

在 Electron 项目目录运行：

```sh
pnpm typecheck
pnpm build
pnpm test
```

生成安装包前必须先有可验证的 `DeepSeek-Harness-Dist/`：

```sh
pnpm package:mac
pnpm package:win
pnpm package:linux
```

electron-builder 会将 `DeepSeek-Harness-Dist/` 原样复制到安装包的 `Resources/DeepSeek-Harness-Dist/`。跨平台发布应在对应平台的 CI 或构建机上完成签名与打包；不要把本机 macOS 构建产物当作 Windows 或 Linux 的发布验证。

## 原生多平台构建

工作流 [package.yml](.github/workflows/package.yml) 在原生 macOS arm64、Windows x64 和 Linux x64 runner 上分别执行以下步骤：

1. 安装 Electron 外壳依赖。
2. 在该平台创建 `DeepSeek-Harness-Dist`，因此原生模块与目标平台匹配。
3. 启动官方 Harness Web UI 进行 loopback smoke test。
4. 生成对应安装包和 `SHA256SUMS.txt`。
5. 上传安装包、blockmap 和校验清单为 workflow artifact。

从 GitHub Actions 的 **Package Desktop Installers** 工作流手动触发构建。可选的 `harness_version` 输入用于选择官方 npm 版本或 tag；留空时使用 `latest`。

## 常见问题

### `Electron uninstall` 或 Electron 二进制缺失

Electron 下载器没有取得运行时二进制。执行：

```sh
cd "$(git rev-parse --show-toplevel)"
ELECTRON_GET_USE_PROXY=true pnpm exec install-electron --no
pnpm dev
```

如果网络需要代理，同时设置 `HTTP_PROXY` 和 `HTTPS_PROXY`，见前面的安装步骤。

### 官方 Web UI 能打开但不能发送消息

在 **Settings -> Models** 中检查是否已保存有效 API Key、provider、模型和可访问的 Base URL。无 Key 时服务器仍可启动，但模型请求会被拒绝。

### 提示找不到或无法启动 Runtime Dist

先验证当前目录：

```sh
pnpm harness:dist:validate
```

如果目录不存在，重新创建：

```sh
pnpm harness:dist:install
```

检查 `runtime-manifest.json` 的 `entry` 必须是目录内相对路径，且指向实际存在的官方 CLI 文件。

### 窗口只有深色空白背景

这通常表示 preload 未成功加载。当前版本要求 preload 以 CommonJS 形式构建：

```sh
pnpm build
test -f out/preload/index.cjs
pnpm dev
```

如果开发终端出现 `Unable to load preload script`，不要通过关闭 `sandbox` 绕过；先确认 `out/preload/index.cjs` 存在。

## 安全边界

- Renderer 启用 `contextIsolation` 和 `sandbox`，没有 Node integration。
- Preload 仅暴露版本化、受限的桌面 API，不提供通用文件系统或子进程接口。
- 工作区由 Main process 选择并在持久化前 canonicalize。
- Desktop Host 通过结构化 IPC 上报就绪状态，不解析 CLI 输出。
- Official Harness 仅监听随机 `127.0.0.1` loopback 端口；iframe 页面不获得 Electron 或 Node API。
- Runtime manifest 不允许 CLI entry 逃逸出 `DeepSeek-Harness-Dist/` 根目录。
- 官方 Harness 的 Agent 具备读取、编辑文件和运行命令的能力。仅选择信任的工作区，并仔细处理每次审批提示。
