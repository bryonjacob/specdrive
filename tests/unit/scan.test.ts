import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { scanFeatureFiles, scanAllSpecs, scanLocalSpecs } from '../../src/scan.js'
import { tmpdir } from 'node:os'

describe('scanFeatureFiles', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = join(tmpdir(), `specdrive-scan-test-${Date.now()}`)
    const specDir = join(testDir, 'my-spec')
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'strategies.feature'),
      `
@RID-STRAT-001
Feature: Built-in strategies

  @RID-STRAT-002 @property-based
  Rule: Text strategy

    Scenario: Text
      Given any text <T>

  @RID-STRAT-003
  Rule: Integer strategy

    Scenario: Integer
      Given any integer <N>
`
    )
    await writeFile(join(specDir, 'not-a-feature.txt'), 'ignored')
  })

  it('extracts all RIDs from feature files', async () => {
    const entries = await scanFeatureFiles(testDir, 'my-spec')
    const rids = entries.map((e) => e.rid)
    expect(rids).toContain('RID-STRAT-001')
    expect(rids).toContain('RID-STRAT-002')
    expect(rids).toContain('RID-STRAT-003')
    expect(entries).toHaveLength(3)
  })

  it('records correct line numbers', async () => {
    const entries = await scanFeatureFiles(testDir, 'my-spec')
    const strat001 = entries.find((e) => e.rid === 'RID-STRAT-001')
    expect(strat001?.line).toBe(2)
  })

  it('sets spec name on all entries', async () => {
    const entries = await scanFeatureFiles(testDir, 'my-spec')
    expect(entries.every((e) => e.spec === 'my-spec')).toBe(true)
  })

  it('ignores non-feature files', async () => {
    const entries = await scanFeatureFiles(testDir, 'my-spec')
    expect(entries.every((e) => e.file.endsWith('.feature'))).toBe(true)
  })

  it('returns empty for nonexistent spec', async () => {
    const entries = await scanFeatureFiles(testDir, 'no-such-spec')
    expect(entries).toEqual([])
  })

  it('scans nested subdirectories', async () => {
    const nestedDir = join(tmpdir(), `specdrive-scan-nested-${Date.now()}`)
    const subDir = join(nestedDir, 'nested-spec', 'sub', 'deep')
    await mkdir(subDir, { recursive: true })
    await writeFile(join(subDir, 'deep.feature'), '@RID-DEEP-001\nFeature: Deep')

    const entries = await scanFeatureFiles(nestedDir, 'nested-spec')
    expect(entries).toHaveLength(1)
    expect(entries[0].rid).toBe('RID-DEEP-001')
  })
})

describe('scanAllSpecs', () => {
  it('scans all subdirectories', async () => {
    const testDir = join(tmpdir(), `specdrive-scanall-test-${Date.now()}`)
    const specA = join(testDir, 'spec-a')
    const specB = join(testDir, 'spec-b')
    await mkdir(specA, { recursive: true })
    await mkdir(specB, { recursive: true })
    await writeFile(join(specA, 'a.feature'), '@RID-AAA-001\nFeature: A')
    await writeFile(join(specB, 'b.feature'), '@RID-BBB-001\nFeature: B')

    const entries = await scanAllSpecs(testDir)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.spec).sort()).toEqual(['spec-a', 'spec-b'])
  })

  it('returns empty for nonexistent directory', async () => {
    const entries = await scanAllSpecs('/nonexistent-dir-123')
    expect(entries).toEqual([])
  })
})

describe('scanLocalSpecs', () => {
  it('finds RIDs in specified directories', async () => {
    const testDir = join(tmpdir(), `specdrive-local-scan-${Date.now()}`)
    const specDir = join(testDir, 'specs', 'auth')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'login.feature'), '@RID-AUTH-001\nFeature: Login')

    const entries = await scanLocalSpecs(testDir, ['specs/auth'])
    expect(entries).toHaveLength(1)
    expect(entries[0].rid).toBe('RID-AUTH-001')
    expect(entries[0].spec).toBe('auth')
  })

  it('handles multiple paths', async () => {
    const testDir = join(tmpdir(), `specdrive-local-multi-${Date.now()}`)
    const authDir = join(testDir, 'specs', 'auth')
    const billingDir = join(testDir, 'specs', 'billing')
    await mkdir(authDir, { recursive: true })
    await mkdir(billingDir, { recursive: true })
    await writeFile(join(authDir, 'login.feature'), '@RID-AUTH-001\nFeature: Login')
    await writeFile(join(billingDir, 'pay.feature'), '@RID-BILL-001\nFeature: Pay')

    const entries = await scanLocalSpecs(testDir, ['specs/auth', 'specs/billing'])
    expect(entries).toHaveLength(2)
    const rids = entries.map((e) => e.rid).sort()
    expect(rids).toEqual(['RID-AUTH-001', 'RID-BILL-001'])
  })

  it('returns empty for nonexistent path', async () => {
    const testDir = join(tmpdir(), `specdrive-local-nodir-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
    const entries = await scanLocalSpecs(testDir, ['specs/nonexistent'])
    expect(entries).toEqual([])
  })

  it('handles path without slash (flat directory)', async () => {
    const testDir = join(tmpdir(), `specdrive-local-flat-${Date.now()}`)
    const specDir = join(testDir, 'myspecs')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'test.feature'), '@RID-FLAT-001\nFeature: Flat')

    const entries = await scanLocalSpecs(testDir, ['myspecs'])
    expect(entries).toHaveLength(1)
    expect(entries[0].rid).toBe('RID-FLAT-001')
    expect(entries[0].spec).toBe('myspecs')
  })
})
