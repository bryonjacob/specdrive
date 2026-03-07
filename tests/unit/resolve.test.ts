import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadSpecManifest, resolveFeatureFiles } from '../../src/resolve.js'

describe('loadSpecManifest', () => {
  it('loads a valid spec.yaml', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-valid-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'spec.yaml'),
      `
name: my-spec
version: 1.0.0
description: "Test spec"
omits:
  - RID-LEGACY-017
overrides:
  - RID-BASE-005
`
    )
    const manifest = await loadSpecManifest(specDir)
    expect(manifest).not.toBeNull()
    expect(manifest!.name).toBe('my-spec')
    expect(manifest!.version).toBe('1.0.0')
    expect(manifest!.omits).toEqual(['RID-LEGACY-017'])
    expect(manifest!.overrides).toEqual(['RID-BASE-005'])
  })

  it('returns null for missing spec.yaml', async () => {
    const manifest = await loadSpecManifest('/nonexistent-dir-123')
    expect(manifest).toBeNull()
  })

  it('returns null for non-object YAML', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-scalar-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), 'just a string')
    const manifest = await loadSpecManifest(specDir)
    expect(manifest).toBeNull()
  })

  it('parses extends as string entries', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-extends-str-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'spec.yaml'),
      `
name: ext-spec
version: 1.0.0
extends:
  - "github:org/base@v1"
`
    )
    const manifest = await loadSpecManifest(specDir)
    expect(manifest!.extends).toEqual([{ source: 'github:org/base@v1' }])
  })

  it('parses extends as object entries', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-extends-obj-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'spec.yaml'),
      `
name: ext-spec
version: 1.0.0
extends:
  - source: "github:org/base@v1"
`
    )
    const manifest = await loadSpecManifest(specDir)
    expect(manifest!.extends).toEqual([{ source: 'github:org/base@v1' }])
  })

  it('handles invalid extends entries gracefully', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-extends-bad-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'spec.yaml'),
      `
name: ext-spec
version: 1.0.0
extends:
  - 42
`
    )
    const manifest = await loadSpecManifest(specDir)
    expect(manifest!.extends).toEqual([{ source: '' }])
  })

  it('defaults name and version when missing', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-defaults-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), 'description: minimal\n')
    const manifest = await loadSpecManifest(specDir)
    expect(manifest!.name).toBe('')
    expect(manifest!.version).toBe('0.0.0')
  })

  it('returns undefined for omits/overrides/extends when not arrays', async () => {
    const specDir = join(tmpdir(), `specdrive-resolve-noarrays-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), 'name: test\nversion: 1.0.0\n')
    const manifest = await loadSpecManifest(specDir)
    expect(manifest!.extends).toBeUndefined()
    expect(manifest!.omits).toBeUndefined()
    expect(manifest!.overrides).toBeUndefined()
  })
})

describe('resolveFeatureFiles', () => {
  let specDir: string

  beforeAll(async () => {
    specDir = join(tmpdir(), `specdrive-resolve-features-${Date.now()}`)
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'keep.feature'), '@RID-KEEP-001\nFeature: Keeper\n')
    await writeFile(join(specDir, 'omit.feature'), '@RID-LEGACY-017\nFeature: Should be omitted\n')
    await writeFile(join(specDir, 'also-keep.feature'), '@RID-KEEP-002\nFeature: Also a keeper\n')
  })

  it('returns all features when no omits', async () => {
    const files = await resolveFeatureFiles(specDir, null)
    expect(files).toHaveLength(3)
  })

  it('filters features with omitted RIDs', async () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      omits: ['RID-LEGACY-017'],
    }
    const files = await resolveFeatureFiles(specDir, manifest)
    expect(files).toHaveLength(2)
    expect(files.every((f) => !f.includes('omit.feature'))).toBe(true)
  })

  it('returns all features when omits is empty', async () => {
    const manifest = { name: 'test', version: '1.0.0', omits: [] }
    const files = await resolveFeatureFiles(specDir, manifest)
    expect(files).toHaveLength(3)
  })

  it('returns empty for nonexistent dir', async () => {
    const files = await resolveFeatureFiles('/nonexistent-dir-123', null)
    expect(files).toEqual([])
  })
})
