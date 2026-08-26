import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  patchHarnessModelCapabilities,
  validateHarnessModelCapabilities,
} from './patch-harness-model-capabilities.mjs'

const CLIENT_ENTRY = join(
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-settings-models',
  'lib',
  'client.js',
)
const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixtureRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-model-capabilities-'))
  temporaryRoots.push(root)
  const client = join(root, CLIENT_ENTRY)
  await mkdir(dirname(client), { recursive: true })
  await writeFile(client, [
    '\t\tfunction capacitySpelling(value) {',
    '\t\t\treturn value === void 0 ? \"\" : formatCapacity(value);',
    '\t\t}',
    '\t\tfunction ModelListEditor(props) {',
    '\t\t\tconst fields = [',
    '\t\t\t\teditCapacity(index, \"maxTokens\", event.target.value);',
    '\t\t\t\t})]',
    '\t\t\t\t\t\t}) : null]',
    '\t\t}',
    '\t\t//#endregion',
    '\t\tconst en = {',
    '\t\t\tmodelAdvanced: \"Capacities\",',
    '\t\t};',
    '\t\tconst zh = {',
    '\t\t\tmodelAdvanced: \"容量\",',
    '\t\t};',
  ].join('\n'), 'utf8')
  return { root, client }
}

describe('model capability runtime patch', () => {
  it('adds vision and reasoning controls exactly once', async () => {
    const runtime = await fixtureRuntime()

    await expect(patchHarnessModelCapabilities(runtime.root)).resolves.toBe(true)
    await expect(patchHarnessModelCapabilities(runtime.root)).resolves.toBe(false)
    await expect(validateHarnessModelCapabilities(runtime.root)).resolves.toBeUndefined()

    const patched = await readFile(runtime.client, 'utf8')
    expect(patched).toContain('inputForCapability')
    expect(patched).toContain('reasoningForCapability')
    expect(patched).toContain('modelInputVision: \"文本 + 图片\"')
    expect(patched).toContain('modelReasoningExtended: \"Standard + Extra high / Max\"')
  })

  it('rejects a runtime that has not been patched', async () => {
    const runtime = await fixtureRuntime()
    await expect(validateHarnessModelCapabilities(runtime.root))
      .rejects.toThrow('Runtime model-capability patch is missing')
  })
})
