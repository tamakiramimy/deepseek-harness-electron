import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type { WorkspaceSummary } from '../shared/contracts.js'

export class DesktopBroker {
  async chooseWorkspace(owner: BrowserWindow): Promise<WorkspaceSummary | undefined> {
    const result = await dialog.showOpenDialog(owner, {
      title: 'Open workspace',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length !== 1) return undefined
    return canonicalWorkspace(result.filePaths[0])
  }
}

async function canonicalWorkspace(candidate: string): Promise<WorkspaceSummary> {
  const path = await realpath(candidate)
  const metadata = await stat(path)
  if (!metadata.isDirectory()) throw new Error('The selected workspace is not a directory.')
  return { name: basename(path), path }
}
