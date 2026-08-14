import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DesktopStore } from './desktop-store.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('DesktopStore', () => {
  it('restores and clears the selected workspace across instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deepseek-harness-desktop-'))
    temporaryDirectories.push(directory)
    const workspace = { name: 'harness', path: '/workspace/harness' }

    const first = new DesktopStore(directory)
    await first.load()
    expect(first.workspace()).toBeUndefined()

    await first.setWorkspace(workspace)
    const restarted = new DesktopStore(directory)
    await restarted.load()
    expect(restarted.workspace()).toEqual(workspace)

    await restarted.setWorkspace(undefined)
    const cleared = new DesktopStore(directory)
    await cleared.load()
    expect(cleared.workspace()).toBeUndefined()
  })
})