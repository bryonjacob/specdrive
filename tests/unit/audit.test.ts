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
    // Same RID repeated twice in one tag block above a single scenario —
    // a genuine same-scenario duplicate.
    await writeFile(
      join(specDir, 'duplicate.feature'),
      `
Feature: Duplicate RID

  @RID-DUP-001 @RID-DUP-001
  Scenario: Redundantly tagged
    Given something
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

// Duplicate semantics: requirement↔scenario is many-to-many. The same RID
// across distinct scenarios (or files) is valid; only the same RID repeated
// WITHIN one scenario is a duplicate error.
describe('runAudit duplicate semantics (many-to-many)', () => {
  async function auditWithLocalFeatures(
    label: string,
    files: Record<string, string>
  ): Promise<Awaited<ReturnType<typeof runAudit>>> {
    const testDir = join(tmpdir(), `specdrive-dup-${label}-${Date.now()}`)
    const specDir = join(testDir, 'specs', 'feat')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(testDir, 'specdrive.yaml'), 'localSpecs:\n  - specs/feat\n')
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(specDir, name), content)
    }
    return runAudit(testDir)
  }

  it('allows the same RID on two separate scenarios in one file', async () => {
    const result = await auditWithLocalFeatures('two-scenarios', {
      'a.feature': `Feature: Many scenarios prove one requirement

  @RID-COV-001
  Scenario: Unit-level proof
    Given a unit

  @RID-COV-001
  Scenario: End-to-end proof
    Given the whole system
`,
    })
    expect(result.duplicates).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('allows the same RID across two files', async () => {
    const result = await auditWithLocalFeatures('two-files', {
      'a.feature': `Feature: A

  @RID-COV-001
  Scenario: In file A
    Given a
`,
      'b.feature': `Feature: B

  @RID-COV-001
  Scenario: In file B
    Given b
`,
    })
    expect(result.duplicates).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('flags the same RID twice in one tag block above a scenario', async () => {
    const result = await auditWithLocalFeatures('tag-block', {
      'a.feature': `Feature: A

  @RID-COV-001 @RID-COV-001
  Scenario: Redundantly tagged
    Given a
`,
    })
    expect(result.duplicates).toHaveLength(1)
    expect(result.errors.some((e) => e.includes('Duplicate RID'))).toBe(true)
  })

  it('flags the same RID repeated within one scenario body', async () => {
    // Both occurrences sit inside the same scenario block (no intervening
    // Scenario: line between them), so they are a genuine same-scenario repeat.
    const result = await auditWithLocalFeatures('scenario-body', {
      'a.feature': `Feature: A

  Scenario: Tagged twice in body
    # @RID-COV-001
    Given a step
    # stray re-tag, no intervening Scenario: @RID-COV-001
    Then done
`,
    })
    expect(result.duplicates).toHaveLength(1)
    expect(result.errors.some((e) => e.includes('Duplicate RID'))).toBe(true)
  })

  it('allows two different RIDs on one scenario', async () => {
    const result = await auditWithLocalFeatures('two-rids', {
      'a.feature': `Feature: A

  @RID-COV-001 @RID-COV-002
  Scenario: Proves two requirements
    Given a
`,
    })
    expect(result.duplicates).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('allows many one-RID-many-scenario groups in a mixed file', async () => {
    const result = await auditWithLocalFeatures('mixed', {
      'a.feature': `Feature: Mixed real-world coverage

  @RID-SENS-8B-002
  Scenario: Edge case low
    Given a low value

  @RID-SENS-8B-002
  Scenario: Edge case high
    Given a high value

  @RID-SENS-8B-002 @RID-SENS-8D-001
  Scenario: Covers both sensors
    Given both sensors

  @RID-SENS-8D-001
  Scenario: Sensor D alone
    Given sensor D
`,
    })
    expect(result.duplicates).toEqual([])
    expect(result.errors).toEqual([])
  })
})
