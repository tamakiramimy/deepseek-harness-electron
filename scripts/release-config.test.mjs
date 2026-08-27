import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('self-contained desktop release contract', () => {
  it('packages the managed Runtime asset and uses an assisted NSIS installer', async () => {
    const config = await readFile(join(projectRoot, 'electron-builder.yml'), 'utf8')
    expect(config).toContain('from: runtime-package')
    expect(config).toContain('to: harness-runtime')
    expect(config).toContain('oneClick: false')
    expect(config).toContain('allowToChangeInstallationDirectory: true')
  })

  it('builds platform Runtime packages before self-contained shell artifacts', async () => {
    const workflow = await readFile(join(projectRoot, '.github', 'workflows', 'package.yml'), 'utf8')
    const archiveScript = await readFile(join(projectRoot, 'scripts', 'package-runtime-archive.mjs'), 'utf8')
    expect(workflow).toContain('needs: runtime')
    expect(workflow).toContain('name: runtime-package-${{ matrix.target }}')
    expect(workflow).toContain('pnpm harness:dist:archive')
    expect(workflow).not.toContain('Assemble Runtime Bundle')
    expect(archiveScript).toContain('await validateHarnessWin32DirectoryPicker(runtimeRoot)')
  })

  it('publishes both Windows setup and portable targets', async () => {
    const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
    const config = await readFile(join(projectRoot, 'electron-builder.yml'), 'utf8')
    for (const target of ['x64', 'arm64']) {
      const command = manifest.scripts[`package:win:${target}`]
      expect(command).toContain(`--win nsis --${target}`)
      expect(command).toContain(`--win portable --${target}`)
    }
    expect(config).toContain('-setup.${ext}')
    expect(config).toContain('-portable.${ext}')
  })
})