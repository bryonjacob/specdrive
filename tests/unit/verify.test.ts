import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runVerify } from '../../src/verify.js'

function junitXml(testcases: string): string {
  return `<?xml version="1.0"?>
<testsuite name="suite" tests="1">
${testcases}
</testsuite>`
}

function testcase(name: string, props?: string[], failed?: boolean): string {
  const propXml = props
    ? `<properties>${props.map((p) => `<property name="rid" value="${p}"/>`).join('')}</properties>`
    : ''
  const failXml = failed ? '<failure message="fail"/>' : ''
  return `<testcase name="${name}">${propXml}${failXml}</testcase>`
}

describe('runVerify', () => {
  let testDir: string
  let reportPath: string

  beforeAll(async () => {
    testDir = join(tmpdir(), `specdrive-verify-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  async function setupSpec(rids: string[], config?: string) {
    await writeFile(
      join(testDir, 'specdrive.yaml'),
      config ??
        `localSpecs:
  - specs/local
`
    )
    const specDir = join(testDir, 'specs', 'local')
    await mkdir(specDir, { recursive: true })
    const lines = rids.map((r) => `@${r}\nScenario: Test ${r}`).join('\n\n')
    await writeFile(join(specDir, 'test.feature'), `Feature: Test\n\n${lines}\n`)
  }

  async function writeReport(xml: string) {
    reportPath = join(testDir, 'report.xml')
    await writeFile(reportPath, xml)
  }

  it('detects uncovered RIDs (spec → test direction)', async () => {
    await setupSpec(['RID-TEST-001', 'RID-TEST-002'])
    await writeReport(junitXml(testcase('test @RID-TEST-001')))

    const result = await runVerify(reportPath, testDir)
    expect(result.uncoveredRids).toEqual(['RID-TEST-002'])
    expect(result.coveredRids).toEqual(['RID-TEST-001'])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('detects undeclared RIDs (test → spec direction)', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('test @RID-GHOST-001')))

    const result = await runVerify(reportPath, testDir)
    expect(result.undeclaredRids).toEqual(['RID-GHOST-001'])
    expect(result.errors).toContainEqual(expect.stringContaining('not declared in any spec'))
  })

  it('counts untraced tests as warnings by default', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('some smoke test')))

    const result = await runVerify(reportPath, testDir)
    expect(result.untracedTests).toBe(1)
    expect(result.totalTests).toBe(2)
    expect(result.warnings).toContainEqual(expect.stringContaining('no RID and no @NOSPEC'))
    expect(result.errors).not.toContainEqual(expect.stringContaining('no RID and no @NOSPEC'))
  })

  it('treats untraced tests as errors with --strict', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('some smoke test')))

    const result = await runVerify(reportPath, testDir, true)
    expect(result.untracedTests).toBe(1)
    expect(result.errors).toContainEqual(expect.stringContaining('no RID and no @NOSPEC'))
  })

  it('treats untraced tests as errors with strictTraceability config', async () => {
    await setupSpec(
      ['RID-TEST-001'],
      `localSpecs:
  - specs/local
strictTraceability: true
`
    )
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('some smoke test')))

    const result = await runVerify(reportPath, testDir)
    expect(result.errors).toContainEqual(expect.stringContaining('no RID and no @NOSPEC'))
  })

  it('recognizes @NOSPEC in test name as opt-out and counts them', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('smoke test @NOSPEC')))

    const result = await runVerify(reportPath, testDir, true)
    expect(result.untracedTests).toBe(0)
    expect(result.nospecTests).toBe(1)
    expect(result.errors).not.toContainEqual(expect.stringContaining('no RID and no @NOSPEC'))
  })

  it('recognizes NOSPEC in property value as opt-out and counts them', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('smoke test', ['NOSPEC'])))

    const result = await runVerify(reportPath, testDir, true)
    expect(result.untracedTests).toBe(0)
    expect(result.nospecTests).toBe(1)
  })

  it('reports all green when fully bidirectional', async () => {
    await setupSpec(['RID-TEST-001', 'RID-TEST-002'])
    await writeReport(junitXml(testcase('test @RID-TEST-001') + testcase('test @RID-TEST-002')))

    const result = await runVerify(reportPath, testDir, true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.untracedTests).toBe(0)
    expect(result.undeclaredRids).toEqual([])
    expect(result.uncoveredRids).toEqual([])
  })

  it('handles missing report file', async () => {
    await setupSpec(['RID-TEST-001'])
    const result = await runVerify('/nonexistent/report.xml', testDir)
    expect(result.errors).toContainEqual(expect.stringContaining('Cannot read report file'))
  })

  it('detects failed RIDs', async () => {
    await setupSpec(['RID-TEST-001', 'RID-TEST-002'])
    await writeReport(
      junitXml(testcase('test @RID-TEST-001', undefined, true) + testcase('test @RID-TEST-002'))
    )

    const result = await runVerify(reportPath, testDir)
    expect(result.failedRids).toEqual(['RID-TEST-001'])
    expect(result.coveredRids).toContain('RID-TEST-001')
    expect(result.errors).toContainEqual(expect.stringContaining('failing tests'))
  })

  it('extracts RIDs from property elements', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('some test', ['RID-TEST-001'])))

    const result = await runVerify(reportPath, testDir)
    expect(result.coveredRids).toEqual(['RID-TEST-001'])
    expect(result.uncoveredRids).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('extracts RIDs from property elements with failure', async () => {
    await setupSpec(['RID-TEST-001'])
    await writeReport(junitXml(testcase('some test', ['RID-TEST-001'], true)))

    const result = await runVerify(reportPath, testDir)
    expect(result.failedRids).toEqual(['RID-TEST-001'])
    expect(result.coveredRids).toContain('RID-TEST-001')
  })

  it('handles testcase with name containing RID that already exists in ridMap from properties', async () => {
    await setupSpec(['RID-TEST-001'])
    // RID in both name and property — property should win, name should not duplicate
    const tc = `<testcase name="test @RID-TEST-001"><properties><property name="rid" value="RID-TEST-001"/></properties></testcase>`
    await writeReport(junitXml(tc))

    const result = await runVerify(reportPath, testDir)
    expect(result.coveredRids).toEqual(['RID-TEST-001'])
  })

  it('handles testcase with NOSPEC in property', async () => {
    await setupSpec(['RID-TEST-001'])
    // NOSPEC as a property value
    const tc = `<testcase name="smoke test"><properties><property name="rid" value="NOSPEC"/></properties></testcase>`
    await writeReport(junitXml(testcase('test @RID-TEST-001') + tc))

    const result = await runVerify(reportPath, testDir, true)
    expect(result.nospecTests).toBe(1)
    expect(result.untracedTests).toBe(0)
  })

  it('counts test with non-matching property as untraced', async () => {
    await setupSpec(['RID-TEST-001'])
    // A testcase with a rid property that doesn't match the RID pattern
    const tc = `<testcase name="test with prop"><properties><property name="rid" value="not-a-rid"/></properties></testcase>`
    await writeReport(junitXml(testcase('test @RID-TEST-001') + tc))

    const result = await runVerify(reportPath, testDir)
    expect(result.untracedTests).toBe(1)
  })

  it('works with vendored specs config', async () => {
    // Setup with specs (vendored) + install directory
    const specDir = join(testDir, 'specs', '_specdrive', 'my-spec')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'test.feature'), '@RID-VEND-001\nFeature: Vendored')
    await writeFile(
      join(testDir, 'specdrive.yaml'),
      `specs:\n  - name: my-spec\n    source: path:../test\n`
    )
    await writeReport(junitXml(testcase('test @RID-VEND-001')))

    const result = await runVerify(reportPath, testDir)
    expect(result.coveredRids).toContain('RID-VEND-001')
  })

  it('deduplicates RIDs from overlapping sources', async () => {
    // Same RID declared twice in different files
    const specDir = join(testDir, 'specs', 'local')
    await mkdir(specDir, { recursive: true })
    await writeFile(
      join(specDir, 'test.feature'),
      '@RID-DUP-001\nFeature: First\n\n@RID-DUP-001\nScenario: Second'
    )
    await writeFile(join(testDir, 'specdrive.yaml'), `localSpecs:\n  - specs/local\n`)
    await writeReport(junitXml(testcase('test @RID-DUP-001')))

    const result = await runVerify(reportPath, testDir)
    // Should deduplicate — only one RID-DUP-001 in declaredRids
    expect(result.declaredRids.filter((r) => r === 'RID-DUP-001')).toHaveLength(1)
  })

  it('handles self-closing testcase', async () => {
    await setupSpec(['RID-TEST-001'])
    // Self-closing testcase (no </testcase>)
    const xml = `<?xml version="1.0"?><testsuite><testcase name="test @RID-TEST-001"/></testsuite>`
    await writeReport(xml)

    const result = await runVerify(reportPath, testDir)
    expect(result.coveredRids).toContain('RID-TEST-001')
  })
})
