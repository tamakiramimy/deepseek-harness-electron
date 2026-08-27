import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensurePackagedRuntime } from './runtime-manager.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(target = 'win32-x64') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-manager-'))
  temporaryRoots.push(root)
  const packageDirectory = join(root, 'package')
  const userDataDirectory = join(root, 'user-data')
  await mkdir(packageDirectory, { recursive: true })
  const archive = Buffer.from('fixture runtime archive')
  await writeFile(join(packageDirectory, 'runtime.zip'), archive)
  const manifest = {
    format: 1,
    archive: 'runtime.zip',
    target,
    runtimeVersion: '0.1.1-rc.2',
    sha256: createHash('sha256').update(archive).digest('hex'),
  }
  await writeFile(join(packageDirectory, 'runtime-package.json'), JSON.stringify(manifest), 'utf8')
  return { packageDirectory, userDataDirectory, manifest }
}

async function fakeExtract(_archive: string, destination: string, target = 'win32-x64'): Promise<void> {
  const cli = join(destination, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  await mkdir(join(destination, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
  await writeFile(cli, 'export {}', 'utf8')
  await writeFile(join(destination, 'runtime-manifest.json'), JSON.stringify({
    format: 1,
    entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
    runtimeVersion: '0.1.1-rc.2',
    target,
  }), 'utf8')
}

describe('ensurePackagedRuntime', () => {
  it('verifies, stages and reuses a matching packaged Runtime', async () => {
    const value = await fixture()
    const extract = vi.fn((archive: string, destination: string) => fakeExtract(archive, destination))

    const first = await ensurePackagedRuntime(value.packageDirectory, value.userDataDirectory, { target: 'win32-x64', extract })
    const second = await ensurePackagedRuntime(value.packageDirectory, value.userDataDirectory, { target: 'win32-x64', extract })

    expect(second).toBe(first)
    expect(extract).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(join(first, '.desktop-runtime.json'), 'utf8'))).toEqual(value.manifest)
  })

  it('rejects an archive hash mismatch before extraction', async () => {
    const value = await fixture()
    await writeFile(join(value.packageDirectory, 'runtime.zip'), 'tampered', 'utf8')
    const extract = vi.fn()

    await expect(ensurePackagedRuntime(value.packageDirectory, value.userDataDirectory, { target: 'win32-x64', extract }))
      .rejects.toThrow('SHA-256 integrity check')
    expect(extract).not.toHaveBeenCalled()
  })

  it('rejects a Runtime for another architecture', async () => {
    const value = await fixture('win32-arm64')
    await expect(ensurePackagedRuntime(value.packageDirectory, value.userDataDirectory, { target: 'win32-x64' }))
      .rejects.toThrow('targets win32-arm64')
  })
})