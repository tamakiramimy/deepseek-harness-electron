import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(join(fileURLToPath(import.meta.url), '..', '..'))
const distRoot = resolve(process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
const runtimeRoot = await resolveRuntimeRoot(distRoot)
const manifest = JSON.parse(await readFile(join(runtimeRoot, 'runtime-manifest.json'), 'utf8'))

if (manifest.format !== 1 || typeof manifest.entry !== 'string') throw new Error('Runtime manifest must have format 1 and a string entry.')
const cliPath = resolve(runtimeRoot, manifest.entry)
assertPathInside(runtimeRoot, cliPath, 'Runtime manifest entry')
await access(cliPath)

const port = await findAvailablePort()
const harnessHome = await mkdtemp(join(tmpdir(), 'deepseek-harness-runtime-smoke-'))
const url = `http://127.0.0.1:${String(port)}`
const child = spawn(process.execPath, [cliPath, 'web', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: distRoot,
  env: { ...process.env, DSH_HOME: harnessHome },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForWebUi(url, child)
  console.log(`Harness runtime smoke test passed: ${url}`)
} finally {
  child.kill()
  await rm(harnessHome, { recursive: true, force: true })
}

async function resolveRuntimeRoot(root) {
  if (await pathExists(join(root, 'runtime-manifest.json'))) return root
  const indexPath = join(root, 'runtime-index.json')
  if (!await pathExists(indexPath)) throw new Error('Runtime bundle has no runtime-manifest.json or runtime-index.json.')
  const index = JSON.parse(await readFile(indexPath, 'utf8'))
  if (index.format !== 1 || typeof index.runtimes !== 'object' || index.runtimes === null || Array.isArray(index.runtimes)) {
    throw new Error('Runtime bundle index is invalid.')
  }
  const target = `${process.platform}-${process.arch}`
  const directory = index.runtimes[target]
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new Error(`Runtime bundle has no entry for ${target}.`)
  }
  const runtimeRoot = resolve(root, directory)
  assertPathInside(root, runtimeRoot, `Runtime bundle entry ${target}`)
  return runtimeRoot
}

function assertPathInside(root, candidate, label) {
  const relativePath = relative(root, candidate)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside DeepSeek-Harness-Dist.`)
  }
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findAvailablePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) {
        server.close()
        reject(new Error('Unable to allocate a loopback port.'))
        return
      }
      server.close((error) => error === undefined ? resolvePromise(address.port) : reject(error))
    })
  })
}

async function waitForWebUi(url, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Harness exited with code ${String(child.exitCode)} before it became ready.`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        await response.body?.cancel()
        return
      }
    } catch {
      // The official plugin tree is still loading.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error('Harness runtime did not become ready within 30 seconds.')
}