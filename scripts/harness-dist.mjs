import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
const action = process.argv[2]
const manifestPath = join(distRoot, 'runtime-manifest.json')
const packagePath = join(distRoot, 'package.json')

switch (action) {
  case '--init':
    await initializeDist()
    break
  case '--install':
    await initializeDist()
    await run('npm', ['install', '--omit=dev', '--ignore-scripts=false'], distRoot)
    await writeManifest()
    break
  case '--validate':
    await validateDist()
    break
  default:
    throw new Error('Usage: node scripts/harness-dist.mjs --init|--install|--validate')
}

async function initializeDist() {
  await mkdir(distRoot, { recursive: true })
  try {
    await access(packagePath)
  } catch {
    await writeFile(packagePath, JSON.stringify({
      name: 'deepseek-harness-dist',
      private: true,
      type: 'module',
      dependencies: {
        '@deepseek-ai/dsh': process.env.DEEPSEEK_HARNESS_VERSION ?? 'latest',
      },
    }, null, 2).concat('\n'), 'utf8')
  }
  try {
    await access(manifestPath)
  } catch {
    await writeManifest()
  }
  console.log(`DeepSeek Harness runtime directory: ${distRoot}`)
}

async function writeManifest() {
  await writeFile(manifestPath, JSON.stringify({
    format: 1,
    entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
  }, null, 2).concat('\n'), 'utf8')
}

async function validateDist() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error(`Invalid runtime manifest: ${manifestPath}`)
  }
  const entry = resolve(distRoot, manifest.entry)
  const outsideRoot = relative(distRoot, entry)
  if (outsideRoot === '' || outsideRoot.startsWith('..') || outsideRoot.includes('../')) {
    throw new Error('Runtime manifest entry must remain inside DeepSeek-Harness-Dist.')
  }
  await access(entry)
  console.log(`Validated DeepSeek Harness runtime entry: ${entry}`)
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${String(code)}.`)))
  })
}