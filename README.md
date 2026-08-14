# DeepSeek Harness Desktop

An Electron workbench for DeepSeek Harness. The first implementation slice provides a secure Electron shell, native workspace selection, persistent desktop state, and an isolated Utility Host protocol. The official DeepSeek Harness transport mounts in the next slice.

## Development

```sh
pnpm install
pnpm dev
```

## Verification

```sh
pnpm typecheck
pnpm build
```

## Security posture

- Renderer processes run with `contextIsolation`, `sandbox`, and no Node integration.
- The preload exposes only a small, versioned desktop API.
- Workspace selection is owned by the main process and paths are canonicalized before persistence.
- The Utility Host reports structured readiness over Electron IPC; no CLI output parsing is used.
