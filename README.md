# DeepSeek Harness Desktop

`DeepSeek Harness Desktop` 是给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 准备的 Electron 桌面工作台。

当前仓库已经提供安全的 Electron 壳、原生工作区选择、桌面状态持久化和独立的 Utility Host 启动协议。
官方 Harness Web UI 已可在相邻的官方源码仓库中单独运行；Electron 到官方 Harness 的 IPC transport 尚在下一实现阶段，因此两者当前需要分别启动。

## 当前状态

| 能力 | 当前状态 |
| --- | --- |
| 官方 DeepSeek Harness Web UI | 可独立启动、配置模型和运行 Agent |
| Electron 桌面壳 | 可启动、选择并记住工作区、显示 Host 状态 |
| Electron 内嵌官方会话/Agent | 尚未接入；请先通过官方 Web UI 使用 Harness |
| Electron IPC transport | 已有 Utility Host 启动骨架，官方 RPC adapter 待接入 |

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

下面假设两个仓库位于同一级目录：

```text
/Volumes/MAC-DATA/Github/
	deepseek-harness/          # 官方 DeepSeek Harness 源码
	deepseek-harness-electron/ # 本项目
```

如果路径不同，先设置官方 Harness 源码目录：

```sh
export HARNESS_DIR=/path/to/deepseek-harness
```

当前机器上的对应路径是：

```sh
export HARNESS_DIR=/Volumes/MAC-DATA/Github/deepseek-harness
```

## 一次性安装

### 1. 安装官方 DeepSeek Harness

如果尚未有官方源码：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
export HARNESS_DIR="$PWD/deepseek-harness"
```

安装官方 Harness 的 workspace 依赖：

```sh
cd "$HARNESS_DIR"
pnpm install
```

### 2. 构建官方 Harness

首次启动、切换分支或更新官方源码后运行：

```sh
cd "$HARNESS_DIR"
pnpm run build
```

该命令会构建 Host、Client 插件和官方 Web 前端。构建成功后才能从源码启动 `dsh web`。

### 3. 安装 Electron 桌面项目

```sh
cd /Volumes/MAC-DATA/Github/deepseek-harness-electron
pnpm install
```

如果公司网络或代理环境导致 Electron 二进制首次下载失败，设置常规代理变量后重新安装二进制：

```sh
export HTTP_PROXY=http://proxy.example:8080
export HTTPS_PROXY=http://proxy.example:8080
ELECTRON_GET_USE_PROXY=true pnpm exec install-electron --no
```

不要把代理地址、账号、密码或 API Key 写入本仓库的 Git 跟踪文件。

## 启动官方 Harness Web UI

在第一个终端启动官方 Web UI：

```sh
cd "$HARNESS_DIR"
pnpm dsh web
```

正常启动后，终端会输出类似地址：

```text
http://127.0.0.1:3080
```

浏览器打开该地址即可进入官方 Harness Web UI。

默认端口 `3080` 被占用时，改用其他端口：

```sh
cd "$HARNESS_DIR"
pnpm dsh web --port 3081
```

也可以不使用源码，直接运行 npm 发布版：

```sh
npx @deepseek-ai/dsh web
```

源码方式更适合本项目后续接入和调试；两种启动方式不要同时占用同一个端口。

## 配置模型与工作区

官方 Web UI 启动后按以下顺序操作：

1. 打开 **Settings -> Models**。
2. 选择 DeepSeek 或添加兼容 OpenAI 的 provider。
3. 输入 API Key 并保存。官方 UI 对已保存的密钥只显示脱敏信息。
4. 点击 **Choose workspace**，选择需要让 Agent 读取或编辑的项目目录。
5. 创建会话并发送任务，例如：`概览这个仓库并说明主要模块。`

官方 Harness 也支持在启动前通过环境变量提供 Key：

```sh
export DEEPSEEK_API_KEY="<your-api-key>"
cd "$HARNESS_DIR"
pnpm dsh web
```

`DEEPSEEK_BASE_URL` 是可选变量，可用于兼容 OpenAI 的私有网关或自定义端点。优先使用 Web UI 的 Models 页面管理密钥；不要将真实 Key 提交到 `.env`、README、终端录屏或 Git 历史。

## 启动 Electron 桌面壳

在第二个终端启动本项目：

```sh
cd /Volumes/MAC-DATA/Github/deepseek-harness-electron
pnpm dev
```

该命令会启动 Vite 开发服务并打开 Electron 窗口。当前可在窗口中：

- 使用原生目录选择器打开工作区；
- 关闭工作区或在重启后恢复已选择的工作区；
- 查看独立 Desktop Host 的启动状态；
- 查看 IDE 工作台的 Explorer、编辑区和 Harness 状态面板。

当前 Electron 窗口不会替代官方 Web UI 中的会话页面。要与 DeepSeek Agent 对话，请继续使用前一节启动的 `http://127.0.0.1:3080`，直到本项目完成官方 Harness IPC adapter 的接入。

## 同时运行两个项目

日常开发使用两个终端：

```sh
# Terminal 1: 官方 Harness Web UI
cd /Volumes/MAC-DATA/Github/deepseek-harness
pnpm dsh web
```

```sh
# Terminal 2: Electron 桌面工作台
cd /Volumes/MAC-DATA/Github/deepseek-harness-electron
pnpm dev
```

停止服务时，在各自终端按 `Ctrl+C`。Electron 关闭窗口后，开发进程也应退出；若 Vite 仍在运行，再按一次 `Ctrl+C`。

## 验证与打包

在 Electron 项目目录运行：

```sh
pnpm typecheck
pnpm build
pnpm test
```

生成安装包：

```sh
pnpm package:mac
pnpm package:win
pnpm package:linux
```

跨平台发布应在对应平台的 CI 或构建机上完成签名与打包；不要把本机 macOS 构建产物当作 Windows 或 Linux 的发布验证。

## 常见问题

### `Electron uninstall` 或 Electron 二进制缺失

Electron 下载器没有取得运行时二进制。执行：

```sh
cd /Volumes/MAC-DATA/Github/deepseek-harness-electron
ELECTRON_GET_USE_PROXY=true pnpm exec install-electron --no
pnpm dev
```

如果网络需要代理，同时设置 `HTTP_PROXY` 和 `HTTPS_PROXY`，见前面的安装步骤。

### `EADDRINUSE` 或端口 `3080` 已被占用

用其他端口启动官方 Harness：

```sh
cd "$HARNESS_DIR"
pnpm dsh web --port 3081
```

### 官方 Web UI 能打开但不能发送消息

在 **Settings -> Models** 中检查是否已保存有效 API Key、provider、模型和可访问的 Base URL。无 Key 时服务器仍可启动，但模型请求会被拒绝。

### `pnpm dsh web` 提示缺少构建文件

从官方源码目录重新构建：

```sh
cd "$HARNESS_DIR"
pnpm run build
pnpm dsh web
```

### Electron 与官方 Harness 还没有连接

这是当前版本的已知范围，而不是启动错误。Electron 已具备受限 IPC、原生工作区和 Utility Host 基础；下一个实现切片会把官方 Harness 的 API/事件流挂接到该 Host。

## 安全边界

- Renderer 启用 `contextIsolation` 和 `sandbox`，没有 Node integration。
- Preload 仅暴露版本化、受限的桌面 API，不提供通用文件系统或子进程接口。
- 工作区由 Main process 选择并在持久化前 canonicalize。
- Desktop Host 通过结构化 IPC 上报就绪状态，不解析 CLI 输出。
- 官方 Harness 的 Agent 具备读取、编辑文件和运行命令的能力。仅选择信任的工作区，并仔细处理每次审批提示。
