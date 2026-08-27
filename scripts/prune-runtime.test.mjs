import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneRuntimeForTarget, validatePrunedRuntime } from './prune-runtime.mjs'

const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-prune-runtime-'))
  temporaryRoots.push(root)
  const prebuilds = join(root, 'node_modules', 'node-pty', 'prebuilds')
  for (const target of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-arm64', 'win32-x64']) {
    await mkdir(join(prebuilds, target), { recursive: true })
    await writeFile(join(prebuilds, target, 'binding.node'), target, 'utf8')
    await writeFile(join(prebuilds, target, 'binding.pdb'), target, 'utf8')
  }
  return { root, prebuilds }
}

describe('target Runtime pruning', () => {
  it('keeps only the selected native prebuild and removes PDB files', async () => {
    const value = await fixture()
    await pruneRuntimeForTarget(value.root, 'win32-x64')
    await expect(validatePrunedRuntime(value.root, 'win32-x64')).resolves.toBeUndefined()
    expect(await readdir(value.prebuilds)).toEqual(['win32-x64'])
    expect(await readdir(join(value.prebuilds, 'win32-x64'))).toEqual(['binding.node'])
  })

  it('rejects unsupported targets before deleting files', async () => {
    const value = await fixture()
    await expect(pruneRuntimeForTarget(value.root, 'linux-x64')).rejects.toThrow('Unsupported Runtime prune target')
    expect((await readdir(value.prebuilds)).length).toBe(5)
  })
})