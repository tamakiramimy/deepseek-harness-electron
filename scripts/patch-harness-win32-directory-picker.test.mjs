import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  patchHarnessWin32DirectoryPicker,
  validateHarnessWin32DirectoryPicker,
} from './patch-harness-win32-directory-picker.mjs'

const WORKER_ENTRY = join(
  'node_modules',
  '@deepseek-ai',
  'dsh-host-directory-picker-native',
  'lib',
  'worker.cjs',
)
const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixtureRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-win32-picker-'))
  temporaryRoots.push(root)
  const worker = join(root, WORKER_ENTRY)
  await mkdir(dirname(worker), { recursive: true })
  await writeFile(worker, `function readUtf16(koffi, address) {
	const bytes = Buffer.from(koffi.view(address, 32768));
	let end = 0;
	while (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
	return bytes.toString("utf16le", 0, end);
}
const post = (message) => {
\t/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
\tsend(message, () => {
\t\tif (process.connected) process.disconnect();
\t});
};
(async () => {
\ttry {
\t\tpost({
\t\t\tkind: "done",
\t\t\tpath: runFolderDialog(await loadWin32DialogBindings(), title, (threadId) => {
\t\t\t\tpost({
\t\t\t\t\tkind: "showing",
\t\t\t\t\tthreadId
\t\t\t\t});
\t\t\t})
\t\t});
\t} catch (error) {
\t\tpost({
\t\t\tkind: "error",
\t\t\tmessage: error instanceof Error ? error.stack ?? error.message : String(error)
\t\t});
\t}
})();`, 'utf8')
  return { root, worker }
}

describe('Win32 directory-picker runtime patch', () => {
  it('keeps IPC connected for showing and disconnects only for terminal messages', async () => {
    const runtime = await fixtureRuntime()

    await expect(patchHarnessWin32DirectoryPicker(runtime.root)).resolves.toBe(true)
    await expect(patchHarnessWin32DirectoryPicker(runtime.root)).resolves.toBe(false)
    await expect(validateHarnessWin32DirectoryPicker(runtime.root)).resolves.toBeUndefined()

    const patched = await readFile(runtime.worker, 'utf8')
    expect(patched).toContain('const post = (message, terminal = false)')
    expect(patched).toContain('if (terminal && process.connected) process.disconnect()')
    expect(patched).toContain('kind: "showing",\n\t\t\t\t\tthreadId\n\t\t\t\t});')
    expect(patched).toContain('kind: "done"')
    expect(patched.match(/}, true\);/g)).toHaveLength(2)
    expect(patched).toContain('koffi.decode(address, "char16_t", -1)')
    expect(patched).not.toContain('koffi.view(address, 32768)')
  })

  it('rejects an unpatched runtime', async () => {
    const runtime = await fixtureRuntime()
    await expect(validateHarnessWin32DirectoryPicker(runtime.root))
      .rejects.toThrow('Runtime Win32 directory-picker patch is missing')
  })
})