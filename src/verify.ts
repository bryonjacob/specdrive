import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { loadConfig } from './config.js'
import { scanAllSpecs, scanLocalSpecs } from './scan.js'
import { RID_RE } from './rid.js'
import { fmt, pad, box } from './color.js'
import type { RidEntry } from './types.js'

/**
 * Result of a verify run.
 */
export interface VerifyResult {
  declaredRids: string[]
  coveredRids: string[]
  uncoveredRids: string[]
  failedRids: string[]
  undeclaredRids: string[]
  untracedTests: number
  nospecTests: number
  totalTests: number
  errors: string[]
  warnings: string[]
}

const NOSPEC_RE = /@?NOSPEC/

function extractRidsFromProperties(
  block: string,
  failed: boolean,
  ridMap: Map<string, 'passed' | 'failed'>
): void {
  const propRe = /<property\s+name="rid"\s+value="([^"]+)"/g
  let propMatch: RegExpExecArray | null
  while ((propMatch = propRe.exec(block)) !== null) {
    const rid = propMatch[1]
    RID_RE.lastIndex = 0
    if (RID_RE.test(rid)) {
      ridMap.set(rid, failed ? 'failed' : (ridMap.get(rid) ?? 'passed'))
    }
  }
}

function extractRidsFromName(
  block: string,
  failed: boolean,
  ridMap: Map<string, 'passed' | 'failed'>
): void {
  const nameMatch = block.match(/\sname="([^"]*)"/)
  if (!nameMatch) return
  RID_RE.lastIndex = 0
  let ridMatch: RegExpExecArray | null
  while ((ridMatch = RID_RE.exec(nameMatch[1])) !== null) {
    if (!ridMap.has(ridMatch[0])) {
      ridMap.set(ridMatch[0], failed ? 'failed' : 'passed')
    }
  }
}

/**
 * Check whether a testcase block has a NOSPEC annotation.
 * Recognized in property values or test name attributes.
 */
function hasNospec(block: string): boolean {
  const propRe = /<property\s+name="rid"\s+value="([^"]+)"/g
  let propMatch: RegExpExecArray | null
  while ((propMatch = propRe.exec(block)) !== null) {
    if (NOSPEC_RE.test(propMatch[1])) return true
  }
  const nameMatch = block.match(/\sname="([^"]*)"/)
  if (nameMatch && NOSPEC_RE.test(nameMatch[1])) return true
  return false
}

interface JunitParseResult {
  ridMap: Map<string, 'passed' | 'failed'>
  untracedTests: number
  nospecTests: number
  totalTests: number
}

function hasAnyRid(block: string): boolean {
  const nameMatch = block.match(/\sname="([^"]*)"/)
  const name = nameMatch ? nameMatch[1] : ''
  RID_RE.lastIndex = 0
  if (RID_RE.test(name)) return true
  RID_RE.lastIndex = 0

  const propRe = /<property\s+name="rid"\s+value="([^"]+)"/g
  let propMatch: RegExpExecArray | null
  while ((propMatch = propRe.exec(block)) !== null) {
    RID_RE.lastIndex = 0
    if (RID_RE.test(propMatch[1])) return true
    RID_RE.lastIndex = 0
  }
  return false
}

function parseJunit(xml: string): JunitParseResult {
  const ridMap = new Map<string, 'passed' | 'failed'>()
  const testcases = xml.split(/<testcase\b/).slice(1)
  let untracedTests = 0
  let nospecTests = 0

  for (const tc of testcases) {
    const endIdx = tc.indexOf('</testcase>')
    const block = endIdx >= 0 ? tc.slice(0, endIdx) : tc
    const failed = block.includes('<failure')

    if (hasNospec(block)) {
      nospecTests++
      continue
    }

    const before = ridMap.size
    extractRidsFromProperties(block, failed, ridMap)
    extractRidsFromName(block, failed, ridMap)

    if (ridMap.size === before && !hasAnyRid(block)) {
      untracedTests++
    }
  }

  return { ridMap, untracedTests, nospecTests, totalTests: testcases.length }
}

/**
 * Run the `verify` command.
 *
 * Cross-references declared RIDs from installed spec packages and local specs
 * against a JUnit XML test report to determine coverage.
 */
async function collectDeclaredRids(
  baseDir: string,
  config: { specs: { name: string }[]; localSpecs?: string[] }
): Promise<RidEntry[]> {
  const specdriveDir = join(baseDir, 'specs', '_specdrive')

  let entries = config.specs.length > 0 ? await scanAllSpecs(specdriveDir) : []

  if (config.localSpecs && config.localSpecs.length > 0) {
    const localRids = await scanLocalSpecs(baseDir, config.localSpecs)
    entries = [...entries, ...localRids]
  }

  // Deduplicate by RID, keeping first occurrence
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.rid)) return false
    seen.add(e.rid)
    return true
  })
}

function classifyRids(
  ridEntries: RidEntry[],
  parsed: JunitParseResult,
  strict: boolean
): VerifyResult {
  const declaredRids = ridEntries.map((e) => e.rid).sort()
  const coveredRids: string[] = []
  const uncoveredRids: string[] = []
  const failedRids: string[] = []

  for (const rid of declaredRids) {
    const status = parsed.ridMap.get(rid)
    if (!status) {
      uncoveredRids.push(rid)
    } else if (status === 'failed') {
      failedRids.push(rid)
      coveredRids.push(rid)
    } else {
      coveredRids.push(rid)
    }
  }

  const declaredSet = new Set(declaredRids)
  const undeclaredRids = [...parsed.ridMap.keys()].filter((r) => !declaredSet.has(r)).sort()

  const { errors, warnings } = collectDiagnostics(
    uncoveredRids,
    failedRids,
    undeclaredRids,
    parsed.untracedTests,
    strict
  )

  return {
    declaredRids,
    coveredRids,
    uncoveredRids,
    failedRids,
    undeclaredRids,
    untracedTests: parsed.untracedTests,
    nospecTests: parsed.nospecTests,
    totalTests: parsed.totalTests,
    errors,
    warnings,
  }
}

function collectDiagnostics(
  uncoveredRids: string[],
  failedRids: string[],
  undeclaredRids: string[],
  untracedTests: number,
  strict: boolean
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  if (uncoveredRids.length > 0) {
    errors.push(`${uncoveredRids.length} RID(s) not covered by any test`)
  }
  if (failedRids.length > 0) {
    errors.push(`${failedRids.length} RID(s) have failing tests`)
  }
  if (undeclaredRids.length > 0) {
    errors.push(
      `${undeclaredRids.length} RID(s) in tests not declared in any spec (typo or stale tag?)`
    )
  }
  if (untracedTests > 0) {
    const msg = `${untracedTests} test(s) have no RID and no @NOSPEC annotation`
    if (strict) errors.push(msg)
    else warnings.push(msg)
  }

  return { errors, warnings }
}

export async function runVerify(
  reportPath: string,
  baseDir: string = process.cwd(),
  strict?: boolean
): Promise<VerifyResult> {
  const config = await loadConfig(baseDir)
  const isStrict = strict ?? config.strictTraceability ?? false

  const ridEntries = await collectDeclaredRids(baseDir, config)
  const declaredRids = ridEntries.map((e) => e.rid).sort()

  let xml: string
  try {
    xml = await readFile(reportPath, 'utf-8')
  } catch {
    const result: VerifyResult = {
      declaredRids,
      coveredRids: [],
      uncoveredRids: declaredRids,
      failedRids: [],
      undeclaredRids: [],
      untracedTests: 0,
      nospecTests: 0,
      totalTests: 0,
      errors: [`Cannot read report file: ${reportPath}`],
      warnings: [],
    }
    printReport(result, ridEntries, baseDir)
    return result
  }

  const result = classifyRids(ridEntries, parseJunit(xml), isStrict)
  printReport(result, ridEntries, baseDir)
  return result
}

function ridSource(rid: string, entries: RidEntry[], baseDir: string): string {
  const entry = entries.find((e) => e.rid === rid)
  if (!entry) return ''
  return relative(baseDir, entry.file)
}

function printVerifyStats(result: VerifyResult): void {
  const w = 3
  const declaredLine = `${pad(result.declaredRids.length, w)} RIDs declared`
  const coveredStr =
    result.coveredRids.length === result.declaredRids.length
      ? fmt.green(`${pad(result.coveredRids.length, w)} covered`)
      : `${pad(result.coveredRids.length, w)} covered`
  const uncoveredStr =
    result.uncoveredRids.length > 0
      ? fmt.yellow(`${result.uncoveredRids.length} uncovered`)
      : fmt.dim(`${result.uncoveredRids.length} uncovered`)
  const coverLine = `${coveredStr}   ${uncoveredStr}`
  const failedStr =
    result.failedRids.length > 0
      ? fmt.red(`${pad(result.failedRids.length, w)} failed`)
      : fmt.dim(`${pad(result.failedRids.length, w)} failed`)
  const traced = result.totalTests - result.untracedTests - result.nospecTests
  let testLine = `${pad(result.totalTests, w)} tests  ${fmt.dim('·')}  ${traced} traced`
  if (result.nospecTests > 0) {
    testLine += `  ${fmt.dim('·')}  ${result.nospecTests} skipped`
  }

  box([declaredLine, coverLine, failedStr, testLine])
}

function printVerifyDetails(result: VerifyResult, ridEntries: RidEntry[], baseDir: string): void {
  if (result.uncoveredRids.length > 0) {
    console.log(`\n  Uncovered RIDs:`)
    for (const rid of result.uncoveredRids) {
      const src = ridSource(rid, ridEntries, baseDir)
      const srcStr = src ? `  ${fmt.dim(src)}` : ''
      console.log(`    ${fmt.red('✗')} ${rid}${srcStr}`)
    }
  }
  if (result.failedRids.length > 0) {
    console.log(`\n  Failed RIDs:`)
    for (const rid of result.failedRids) {
      console.log(`    ${fmt.red('✗')} ${rid}  ${fmt.red('(test failed)')}`)
    }
  }
  if (result.undeclaredRids.length > 0) {
    console.log(`\n  Undeclared RIDs:`)
    for (const rid of result.undeclaredRids) {
      console.log(`    ${fmt.yellow('?')} ${rid}  ${fmt.dim('(in tests but not in specs)')}`)
    }
  }
  if (result.warnings.length > 0) {
    console.log(`\n  Warnings:`)
    for (const w of result.warnings) {
      console.log(`    ${fmt.yellow('⚠')} ${fmt.yellow(w)}`)
    }
  }
}

function printReport(result: VerifyResult, ridEntries: RidEntry[], baseDir: string): void {
  const hasErrors = result.errors.length > 0
  const header = hasErrors ? fmt.boldRed('specdrive verify ✗') : fmt.boldGreen('specdrive verify ✓')
  console.log(`\n${header}\n`)

  printVerifyStats(result)
  printVerifyDetails(result, ridEntries, baseDir)

  if (hasErrors) {
    console.log('')
    for (const e of result.errors) {
      console.log(`  ${fmt.red('✗')} ${fmt.red(e)}`)
    }
  } else {
    console.log(`\n  ${fmt.boldGreen(`✓ All ${result.declaredRids.length} RIDs verified.`)}`)
  }
  console.log('')
}
