import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeRuntimeShims } from './runtime-shims.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('writeRuntimeShims', () => {
  it('pins Windows dsh, node and pnpm to the embedded executable and runtime entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-shims-'))
    temporaryRoots.push(root)
    const directory = await writeRuntimeShims(root, {
      cliPath: 'D:\\App\\runtime\\dsh\\bin.js',
      packageManagerPath: 'D:\\App\\runtime\\pnpm\\pnpm.cjs',
    }, 'D:\\App\\DeepSeek Harness Desktop.exe', 'win32')

    expect((await readdir(directory)).sort()).toEqual(['dsh.cmd', 'node.cmd', 'pnpm.cmd'])
    expect(await readFile(join(directory, 'dsh.cmd'), 'utf8'))
      .toContain('"D:\\App\\DeepSeek Harness Desktop.exe" "D:\\App\\runtime\\dsh\\bin.js" %*')
  })

  it('still creates an absolute dsh shim when the optional package manager is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-shims-'))
    temporaryRoots.push(root)
    const directory = await writeRuntimeShims(root, {
      cliPath: '/app/runtime/dsh/bin.js',
      packageManagerPath: undefined,
    }, '/app/electron', 'darwin')

    expect((await readdir(directory)).sort()).toEqual(['dsh', 'node'])
    expect(await readFile(join(directory, 'dsh'), 'utf8'))
      .toContain("exec '/app/electron' '/app/runtime/dsh/bin.js' \"$@\"")
  })
})