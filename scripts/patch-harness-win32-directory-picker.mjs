import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PATCH_MARKER = 'deepseek-harness-electron:win32-directory-picker-ipc-v1'
const WORKER_ENTRY = join(
  'node_modules',
  '@deepseek-ai',
  'dsh-host-directory-picker-native',
  'lib',
  'worker.cjs',
)

const ORIGINAL_POST = `const post = (message) => {
	/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
	send(message, () => {
		if (process.connected) process.disconnect();
	});
};`

const PATCHED_POST = `/* ${PATCH_MARKER} */
const post = (message, terminal = false) => {
	send(message, () => {
		if (terminal && process.connected) process.disconnect();
	});
};`

export async function patchHarnessWin32DirectoryPicker(runtimeRoot) {
  const workerPath = join(resolve(runtimeRoot), WORKER_ENTRY)
  const source = await readFile(workerPath, 'utf8')
  if (source.includes(PATCH_MARKER)) return false

  let patched = replaceOnce(source, ORIGINAL_POST, PATCHED_POST, 'worker post helper')
  patched = replaceOnce(
    patched,
    '\t\tpost({\n\t\t\tkind: "done",',
    '\t\tpost({\n\t\t\tkind: "done",',
    'done message',
    (value) => value,
  )
  patched = replaceOnce(
    patched,
    '\t\t});\n\t} catch (error) {\n\t\tpost({',
    '\t\t}, true);\n\t} catch (error) {\n\t\tpost({',
    'done terminal message',
  )
  patched = replaceOnce(
    patched,
    '\t\t\tkind: "error",\n\t\t\tmessage: error instanceof Error ? error.stack ?? error.message : String(error)\n\t\t});',
    '\t\t\tkind: "error",\n\t\t\tmessage: error instanceof Error ? error.stack ?? error.message : String(error)\n\t\t}, true);',
    'error terminal message',
  )

  await writeFile(workerPath, patched, 'utf8')
  return true
}

export async function validateHarnessWin32DirectoryPicker(runtimeRoot) {
  const workerPath = join(resolve(runtimeRoot), WORKER_ENTRY)
  await access(workerPath)
  const source = await readFile(workerPath, 'utf8')
  if (!source.includes(PATCH_MARKER)) {
    throw new Error(`Runtime Win32 directory-picker patch is missing: ${workerPath}`)
  }
  for (const token of ['const post = (message, terminal = false)', 'if (terminal && process.connected)', '}, true);']) {
    if (!source.includes(token)) {
      throw new Error(`Runtime Win32 directory-picker patch is incomplete (${token}): ${workerPath}`)
    }
  }
}

function replaceOnce(source, search, replacement, label, transform = undefined) {
  const matches = source.split(search).length - 1
  if (matches !== 1) throw incompatible(`${label}; expected one anchor, found ${String(matches)}`)
  const next = transform === undefined ? replacement : transform(replacement)
  return source.replace(search, next)
}

function incompatible(anchor) {
  return new Error(`Installed @deepseek-ai/dsh Win32 directory picker is incompatible with the desktop patch (${anchor}).`)
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const runtimeRoot = resolve(process.argv[2] ?? process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
  const changed = await patchHarnessWin32DirectoryPicker(runtimeRoot)
  await validateHarnessWin32DirectoryPicker(runtimeRoot)
  console.log(`${changed ? 'Applied' : 'Validated'} Win32 directory-picker IPC fix: ${runtimeRoot}`)
}