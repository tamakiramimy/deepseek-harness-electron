import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const SHIM_DIRECTORY = '.desktop-bin'

export interface RuntimeEntries {
  readonly cliPath: string
  readonly packageManagerPath: string | undefined
}

export async function writeRuntimeShims(
  harnessHome: string,
  runtime: RuntimeEntries,
  executable = process.execPath,
  platform = process.platform,
): Promise<string> {
  const shimDirectory = join(harnessHome, SHIM_DIRECTORY)
  await mkdir(shimDirectory, { recursive: true, mode: 0o700 })
  const commands = [
    { name: 'dsh', command: [executable, runtime.cliPath] },
    { name: 'node', command: [executable] },
    ...(runtime.packageManagerPath === undefined
      ? []
      : [{ name: 'pnpm', command: [executable, runtime.packageManagerPath] }]),
  ]
  const shims = platform === 'win32'
    ? commands.map(({ name, command }) => ({ name: `${name}.cmd`, body: windowsShim(command) }))
    : commands.map(({ name, command }) => ({ name, body: posixShim(command) }))
  for (const shim of shims) {
    const path = join(shimDirectory, shim.name)
    await writeFile(path, shim.body, 'utf8')
    await chmod(path, 0o700)
  }
  return shimDirectory
}

export function shimPath(shimDirectory: string, inherited = process.env.PATH ?? ''): string {
  return inherited === '' ? shimDirectory : `${shimDirectory}${delimiter}${inherited}`
}

function posixShim(command: readonly string[]): string {
  const quoted = command.map((part) => `'${part.replaceAll("'", `'\\''`)}'`).join(' ')
  return `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quoted} "$@"\n`
}

function windowsShim(command: readonly string[]): string {
  const quoted = command.map((part) => `"${part}"`).join(' ')
  return `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${quoted} %*\r\n`
}