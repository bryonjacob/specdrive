import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../src/config.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('loadConfig', () => {
  it('loads a valid specdrive.yaml', async () => {
    const config = await loadConfig(fixturesDir)
    expect(config.specs).toHaveLength(2)
    expect(config.specs[0]).toEqual({
      name: 'property-plugin-core',
      source: 'path:../property-plugin-spec',
    })
    expect(config.specs[1]).toEqual({
      name: 'auth-baseline',
      source: 'github:org/auth-specs@v1.2.0',
    })
  })

  it('throws when config file is missing', async () => {
    await expect(loadConfig('/nonexistent')).rejects.toThrow('Config file not found')
  })

  it('throws on invalid YAML (not an object)', async () => {
    const dir = join(tmpdir(), `specdrive-config-invalid-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'just a string')
    await expect(loadConfig(dir)).rejects.toThrow('must be a YAML object')
  })

  it('throws when specs is not an array', async () => {
    const dir = join(tmpdir(), `specdrive-config-nospecs-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'specs: not-an-array\n')
    await expect(loadConfig(dir)).rejects.toThrow('"specs" must be an array')
  })

  it('throws when spec entry is not an object', async () => {
    const dir = join(tmpdir(), `specdrive-config-badspec-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'specs:\n  - just-a-string\n')
    await expect(loadConfig(dir)).rejects.toThrow('specs[0] must be an object')
  })

  it('throws when spec name is missing', async () => {
    const dir = join(tmpdir(), `specdrive-config-noname-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'specs:\n  - source: path:../foo\n')
    await expect(loadConfig(dir)).rejects.toThrow('specs[0].name must be a non-empty string')
  })

  it('throws when spec source is missing', async () => {
    const dir = join(tmpdir(), `specdrive-config-nosrc-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'specs:\n  - name: foo\n')
    await expect(loadConfig(dir)).rejects.toThrow('specs[0].source must be a non-empty string')
  })

  it('loads config with only localSpecs (no specs)', async () => {
    const dir = join(tmpdir(), `specdrive-config-localonly-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'localSpecs:\n  - specs/auth\n')
    const config = await loadConfig(dir)
    expect(config.specs).toEqual([])
    expect(config.localSpecs).toEqual(['specs/auth'])
  })

  it('loads config with both specs and localSpecs', async () => {
    const dir = join(tmpdir(), `specdrive-config-both-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'specdrive.yaml'),
      'specs:\n  - name: foo\n    source: path:../foo\nlocalSpecs:\n  - specs/auth\n'
    )
    const config = await loadConfig(dir)
    expect(config.specs).toHaveLength(1)
    expect(config.localSpecs).toEqual(['specs/auth'])
  })

  it('throws when localSpecs is not an array', async () => {
    const dir = join(tmpdir(), `specdrive-config-badlocal-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'localSpecs: not-an-array\n')
    await expect(loadConfig(dir)).rejects.toThrow('"localSpecs" must be an array')
  })

  it('throws when localSpecs entry is not a string', async () => {
    const dir = join(tmpdir(), `specdrive-config-badlocalentry-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'localSpecs:\n  - 123\n')
    await expect(loadConfig(dir)).rejects.toThrow('localSpecs[0] must be a non-empty string')
  })

  it('throws when neither specs nor localSpecs is declared', async () => {
    const dir = join(tmpdir(), `specdrive-config-empty-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'strictTraceability: true\n')
    await expect(loadConfig(dir)).rejects.toThrow('must declare "specs" or "localSpecs"')
  })

  it('throws when spec name has path separators', async () => {
    const dir = join(tmpdir(), `specdrive-config-badname-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'specdrive.yaml'),
      'specs:\n  - name: "../../evil"\n    source: path:../foo\n'
    )
    await expect(loadConfig(dir)).rejects.toThrow('invalid characters')
  })

  it('throws when localSpecs entry has path traversal', async () => {
    const dir = join(tmpdir(), `specdrive-config-traverse-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'localSpecs:\n  - "../../../etc"\n')
    await expect(loadConfig(dir)).rejects.toThrow('relative path within the project')
  })

  it('throws when localSpecs entry is absolute', async () => {
    const dir = join(tmpdir(), `specdrive-config-abs-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'specdrive.yaml'), 'localSpecs:\n  - "/etc/passwd"\n')
    await expect(loadConfig(dir)).rejects.toThrow('relative path within the project')
  })

  it('throws when strictTraceability is not a boolean', async () => {
    const dir = join(tmpdir(), `specdrive-config-strict-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'specdrive.yaml'),
      'localSpecs:\n  - specs\nstrictTraceability: "yes"\n'
    )
    await expect(loadConfig(dir)).rejects.toThrow('must be a boolean')
  })
})
