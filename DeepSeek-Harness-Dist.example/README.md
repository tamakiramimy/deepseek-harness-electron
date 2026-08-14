# DeepSeek-Harness-Dist

This directory is the replaceable official DeepSeek Harness runtime consumed by the Electron shell.

It must contain a `runtime-manifest.json` with an entry relative to this directory, plus every runtime dependency needed by that entry.

The standard npm layout is:

```text
DeepSeek-Harness-Dist/
  runtime-manifest.json
  package.json
  node_modules/
    @deepseek-ai/dsh/lib/bin.js
```

Create the default runtime from the Electron project root:

```sh
pnpm harness:dist:install
```

To use another official version, edit `package.json` in the actual `DeepSeek-Harness-Dist/` directory or set `DEEPSEEK_HARNESS_VERSION` before running the install command.

To use a runtime built from an official source checkout, copy the source runtime and set `runtime-manifest.json` to its built CLI entry, such as `apps/cli/lib/bin.js`. Its complete `node_modules/` dependency tree must remain beside the entry.