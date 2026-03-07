import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runAudit } from '../../src/audit.js'

describe('runAudit', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = join(tmpdir(), `specdrive-audit-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    await writeFile(
      join(testDir, 'specdrive.yaml'),
      `
specs:
  - name: my-spec
    source: path:../some-spec
  - name: missing-spec
    source: path:../missing
`
    )

    const specDir = join(testDir, 'specs', '_specdrive', 'my-spec')
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'valid.feature'),
      `
@RID-TEST-001
Feature: Valid feature
`
    )
    await writeFile(
      join(specDir, 'duplicate.feature'),
      `
@RID-TEST-001
Feature: Duplicate RID
`
    )
  })

  it('reports missing specs', async () => {
    const result = await runAudit(testDir)
    expect(result.missing).toContain('missing-spec')
    expect(result.installed).toContain('my-spec')
  })

  it('detects duplicate RIDs', async () => {
    const result = await runAudit(testDir)
    expect(result.duplicates.length).toBeGreaterThan(0)
  })

  it('builds error messages for issues', async () => {
    const result = await runAudit(testDir)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
    expect(result.errors.some((e) => e.includes('not installed'))).toBe(true)
    expect(result.errors.some((e) => e.includes('Duplicate RID'))).toBe(true)
  })
})

describe('runAudit clean', () => {
  it('reports no issues for clean spec', async () => {
    const testDir = join(tmpdir(), `specdrive-audit-clean-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    await writeFile(
      join(testDir, 'specdrive.yaml'),
      `
specs:
  - name: clean-spec
    source: path:../clean
`
    )

    const specDir = join(testDir, 'specs', '_specdrive', 'clean-spec')
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'ok.feature'),
      `
@RID-OK-001
Feature: Clean feature
`
    )

    const result = await runAudit(testDir)
    expect(result.errors).toEqual([])
  })
})

describe('runAudit with local specs', () => {
  it('audits local specs only (no vendored)', async () => {
    const testDir = join(tmpdir(), `specdrive-audit-local-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    await writeFile(
      join(testDir, 'specdrive.yaml'),
      `
localSpecs:
  - specs/auth
`
    )

    const authDir = join(testDir, 'specs', 'auth')
    await mkdir(authDir, { recursive: true })
    await writeFile(
      join(authDir, 'login.feature'),
      `
@RID-AUTH-001
Feature: Login

@RID-AUTH-002
Rule: Valid credentials
`
    )

    const result = await runAudit(testDir)
    expect(result.rids).toHaveLength(2)
    expect(result.rids.map((r) => r.rid).sort()).toEqual(['RID-AUTH-001', 'RID-AUTH-002'])
    expect(result.errors).toEqual([])
    expect(result.declared).toEqual([])
    expect(result.missing).toEqual([])
  })

  it('audits both vendored and local specs', async () => {
    const testDir = join(tmpdir(), `specdrive-audit-both-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    await writeFile(
      join(testDir, 'specdrive.yaml'),
      `
specs:
  - name: core-spec
    source: path:../core
localSpecs:
  - specs/auth
`
    )

    const vendoredDir = join(testDir, 'specs', '_specdrive', 'core-spec')
    await mkdir(vendoredDir, { recursive: true })
    await writeFile(join(vendoredDir, 'core.feature'), '@RID-CORE-001\nFeature: Core')

    const authDir = join(testDir, 'specs', 'auth')
    await mkdir(authDir, { recursive: true })
    await writeFile(join(authDir, 'login.feature'), '@RID-AUTH-001\nFeature: Login')

    const result = await runAudit(testDir)
    expect(result.rids).toHaveLength(2)
    const rids = result.rids.map((r) => r.rid).sort()
    expect(rids).toEqual(['RID-AUTH-001', 'RID-CORE-001'])
    expect(result.errors).toEqual([])
  })
})
