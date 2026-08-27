import { access, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const SUPPORTED_TARGETS = new Set(['darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-x64'])

export async function pruneRuntimeForTarget(runtimeRoot, target) {
  assertTarget(target)
  const prebuilds = join(resolve(runtimeRoot), 'node_modules', 'node-pty', 'prebuilds')
  await access(join(prebuilds, target))
  for (const entry of await readdir(prebuilds, { withFileTypes: true })) {
    if (entry.name !== target) await rm(join(prebuilds, entry.name), { recursive: true, force: true })
  }
  for (const entry of await readdir(join(prebuilds, target), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdb')) {
      await rm(join(prebuilds, target, entry.name), { force: true })
    }
  }
}

export async function validatePrunedRuntime(runtimeRoot, target) {
  assertTarget(target)
  const prebuilds = join(resolve(runtimeRoot), 'node_modules', 'node-pty', 'prebuilds')
  const entries = await readdir(prebuilds, { withFileTypes: true })
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  if (directories.length !== 1 || directories[0] !== target) {
    throw new Error(`Runtime node-pty prebuilds must contain only ${target}; found ${directories.join(', ') || 'none'}.`)
  }
  const pdb = (await readdir(join(prebuilds, target))).filter(entry => entry.toLowerCase().endsWith('.pdb'))
  if (pdb.length > 0) throw new Error(`Runtime contains production-unneeded PDB files: ${pdb.join(', ')}.`)
}

function assertTarget(target) {
  if (!SUPPORTED_TARGETS.has(target)) throw new Error(`Unsupported Runtime prune target: ${String(target)}`)
}