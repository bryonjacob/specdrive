import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { loadConfig } from './config.js'
import { scanAllSpecs, scanLocalSpecs } from './scan.js'
import { RID_FORMAT_RE } from './rid.js'
import { fmt, pad, box } from './color.js'
import type { AuditResult, RidEntry } from './types.js'

/**
 * Run the `audit` command.
 *
 * 1. Check all declared specs are installed (if vendored specs declared)
 * 2. Scan all RIDs (vendored + local)
 * 3. Validate format, check for duplicates
 * 4. Print report
 */
export async function runAudit(baseDir: string = process.cwd()): Promise<AuditResult> {
  const config = await loadConfig(baseDir)
  const specdriveDir = join(baseDir, 'specs', '_specdrive')

  const declared = config.specs.map((s) => s.name)

  // Check installed only when vendored specs are declared
  let installed: string[] = []
  let missing: string[] = []
  if (declared.length > 0) {
    const result = await checkInstalled(declared, specdriveDir)
    installed = result.installed
    missing = result.missing
  }

  // Scan vendored specs
  let rids: RidEntry[] = []
  if (declared.length > 0) {
    rids = await scanAllSpecs(specdriveDir)
  }

  // Scan local specs
  if (config.localSpecs && config.localSpecs.length > 0) {
    const localRids = await scanLocalSpecs(baseDir, config.localSpecs)
    rids = [...rids, ...localRids]
  }

  const invalidFormat = rids.filter((r) => !RID_FORMAT_RE.test(r.rid))
  const duplicates = findDuplicates(rids)
  const errors = buildErrors(missing, invalidFormat, duplicates)

  printReport(declared, installed, config.localSpecs ?? [], rids, duplicates, invalidFormat, errors)
  return { declared, installed, missing, rids, duplicates, invalidFormat, errors }
}

async function checkInstalled(
  declared: string[],
  specdriveDir: string
): Promise<{ installed: string[]; missing: string[] }> {
  const installed: string[] = []
  const missing: string[] = []
  for (const name of declared) {
    try {
      await access(join(specdriveDir, name))
      installed.push(name)
    } catch {
      missing.push(name)
    }
  }
  return { installed, missing }
}

function findDuplicates(rids: RidEntry[]): RidEntry[][] {
  const ridMap = new Map<string, RidEntry[]>()
  for (const r of rids) {
    const key = `${r.spec}/${r.rid}`
    const list = ridMap.get(key) ?? []
    list.push(r)
    ridMap.set(key, list)
  }
  return [...ridMap.values()].filter((list) => list.length > 1)
}

function buildErrors(
  missing: string[],
  invalidFormat: RidEntry[],
  duplicates: RidEntry[][]
): string[] {
  const errors: string[] = []
  for (const name of missing) {
    errors.push(`Spec "${name}" is declared but not installed. Run \`specdrive install\`.`)
  }
  for (const entry of invalidFormat) {
    errors.push(`Invalid RID format "${entry.rid}" at ${entry.file}:${entry.line}`)
  }
  for (const group of duplicates) {
    const rid = group[0].rid
    const locations = group.map((e) => `${e.file}:${e.line}`).join(', ')
    errors.push(`Duplicate RID "${rid}" found at: ${locations}`)
  }
  return errors
}

function countBySpec(rids: RidEntry[], specName: string): number {
  return new Set(rids.filter((r) => r.spec === specName).map((r) => r.rid)).size
}

function printSpecList(
  declared: string[],
  installed: string[],
  localSpecs: string[],
  rids: RidEntry[]
): void {
  if (declared.length === 0 && localSpecs.length === 0) return

  console.log('  Specs:')
  for (const name of installed) {
    const count = countBySpec(rids, name)
    console.log(
      `    ${fmt.green('◆')} ${fmt.bold(name)}  ${pad(count, 3)} RIDs  ${fmt.dim('(installed)')}`
    )
  }
  for (const name of declared.filter((n) => !installed.includes(n))) {
    console.log(`    ${fmt.red('◆')} ${fmt.bold(name)}  ${fmt.red('missing')}`)
  }
  for (const path of localSpecs) {
    const leaf = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    const count = countBySpec(rids, leaf)
    console.log(
      `    ${fmt.cyan('◆')} ${fmt.bold(path)}  ${pad(count, 3)} RIDs  ${fmt.dim('(local)')}`
    )
  }
  console.log('')
}

function printReport(
  declared: string[],
  installed: string[],
  localSpecs: string[],
  rids: RidEntry[],
  duplicates: RidEntry[][],
  invalidFormat: RidEntry[],
  errors: string[]
): void {
  const hasErrors = errors.length > 0
  const header = hasErrors ? fmt.boldRed('specdrive audit ✗') : fmt.boldGreen('specdrive audit ✓')
  console.log(`\n${header}\n`)

  printSpecList(declared, installed, localSpecs, rids)

  const uniqueRids = new Set(rids.map((r) => r.rid)).size
  const w = 3
  const ridLine = `${pad(uniqueRids, w)} RIDs declared`
  const dupCount = duplicates.length
  const dupStr =
    dupCount > 0
      ? fmt.yellow(`${pad(dupCount, w)} duplicates`)
      : fmt.dim(`${pad(dupCount, w)} duplicates`)
  const fmtCount = invalidFormat.length
  const fmtStr =
    fmtCount > 0
      ? fmt.red(`${pad(fmtCount, w)} format errors`)
      : fmt.dim(`${pad(fmtCount, w)} format errors`)

  box([ridLine, dupStr, fmtStr])

  if (hasErrors) {
    console.log(`\n  Errors:`)
    for (const e of errors) {
      console.log(`    ${fmt.red('✗')} ${e}`)
    }
    console.log(`\n  ${fmt.red(`✗ ${errors.length} error(s) found.`)}`)
  } else {
    console.log(`\n  ${fmt.boldGreen('✓ All specs valid.')}`)
  }
  console.log('')
}
