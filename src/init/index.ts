import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileExists } from '../fs-utils.js'
import { fmt, box } from '../color.js'
import { detectFrameworks, type DetectionResult } from './detect.js'
import { JUNIT_XML_SPEC } from './adapters/generic.js'
import type { Adapter, AdapterFile, ConfigEdit } from './types.js'

const SPECDRIVE_YAML_TEMPLATE = `# specdrive.yaml — Gherkin behavioral contract configuration
# Docs: https://github.com/bryonjacob/specdrive

# Local spec directories (relative to project root)
localSpecs:
  - specs

# Uncomment to install shared spec packages:
# specs:
#   - name: my-shared-spec
#     source: github:org/spec-repo@v1.0

# Uncomment to fail on tests without RID annotations:
# strictTraceability: true
`

/**
 * Print detection results.
 */
function printDetections(results: DetectionResult[]): void {
  if (results.length === 0) {
    console.log(`  ${fmt.yellow('No known test framework detected.')}\n`)
    return
  }

  console.log('  Detected frameworks:\n')
  for (const { adapter, detection } of results) {
    const conf =
      detection.confidence === 'certain'
        ? fmt.green(detection.confidence)
        : detection.confidence === 'likely'
          ? fmt.yellow(detection.confidence)
          : fmt.dim(detection.confidence)
    console.log(`    ${fmt.bold(adapter.framework)}  (${conf})`)
    for (const e of detection.evidence) {
      console.log(`      ${fmt.dim(e)}`)
    }
  }
  console.log('')
}

/**
 * Plan all changes for selected adapters. Returns a structured plan.
 */
interface InitPlan {
  filesToCreate: AdapterFile[]
  configEdits: ConfigEdit[]
  createSpecdriveYaml: boolean
}

async function buildPlan(dir: string, selectedAdapters: Adapter[]): Promise<InitPlan> {
  const filesToCreate: AdapterFile[] = []
  const configEdits: ConfigEdit[] = []

  for (const adapter of selectedAdapters) {
    const files = await adapter.files(dir)
    filesToCreate.push(...files)
    const edits = await adapter.configEdits(dir)
    configEdits.push(...edits)
  }

  const createSpecdriveYaml = !(await fileExists(join(dir, 'specdrive.yaml')))

  return { filesToCreate, configEdits, createSpecdriveYaml }
}

/**
 * Print the plan and instructions.
 */
function printAutoChanges(plan: InitPlan): void {
  console.log('  Changes:')
  if (plan.createSpecdriveYaml) {
    console.log(`    ${fmt.green('create')}  specdrive.yaml`)
  }
  for (const f of plan.filesToCreate) {
    const verb = f.description.startsWith('append') ? 'modify' : 'create'
    const color = verb === 'create' ? fmt.green : fmt.yellow
    console.log(`    ${color(verb)}  ${f.path}  ${fmt.dim(`(${f.description})`)}`)
  }
  for (const e of plan.configEdits.filter((e) => e.safe)) {
    console.log(`    ${fmt.yellow('modify')}  ${e.path}  ${fmt.dim(`(${e.description})`)}`)
  }
  console.log('')
}

function printManualSteps(edits: ConfigEdit[]): void {
  console.log(`  ${fmt.yellow('Manual steps needed:')}\n`)
  for (const e of edits) {
    console.log(`    ${fmt.yellow('>')} ${e.description}\n`)
    for (const line of e.manual.split('\n')) {
      console.log(`      ${line}`)
    }
    console.log('')
  }
}

function printPlan(plan: InitPlan): void {
  const totalActions =
    plan.filesToCreate.length +
    plan.configEdits.filter((e) => e.safe).length +
    (plan.createSpecdriveYaml ? 1 : 0)
  const manualEdits = plan.configEdits.filter((e) => !e.safe)

  if (totalActions === 0 && manualEdits.length === 0) {
    console.log(`  ${fmt.dim('Nothing to do — already configured.')}`)
    return
  }

  if (totalActions > 0) printAutoChanges(plan)
  if (manualEdits.length > 0) printManualSteps(manualEdits)
}

/**
 * Apply the plan: write files and execute safe config edits.
 */
async function applyPlan(dir: string, plan: InitPlan): Promise<string[]> {
  const applied: string[] = []

  if (plan.createSpecdriveYaml) {
    await writeFile(join(dir, 'specdrive.yaml'), SPECDRIVE_YAML_TEMPLATE)
    applied.push('specdrive.yaml')
  }

  for (const f of plan.filesToCreate) {
    await writeFile(join(dir, f.path), f.content)
    applied.push(f.path)
  }

  for (const e of plan.configEdits.filter((e) => e.safe)) {
    await e.apply(dir)
    applied.push(e.path)
  }

  return applied
}

/**
 * Print post-init summary.
 */
function printSummary(applied: string[]): void {
  if (applied.length > 0) {
    console.log('  Applied:')
    for (const f of applied) {
      console.log(`    ${fmt.green('+')} ${f}`)
    }
    console.log('')
  }

  // Commit / gitignore guidance
  const commitFiles = applied.filter((f) => f !== 'specs/_specdrive')
  if (commitFiles.length > 0) {
    console.log(`  ${fmt.bold('Commit these files:')}`)
    for (const f of commitFiles) {
      console.log(`    ${f}`)
    }
    console.log('')
  }

  console.log(`  ${fmt.bold('Add to .gitignore (if not already):')}`)
  console.log('    specs/_specdrive/')
  console.log('    .specdrive/cache/')
  console.log('')

  // Next steps
  box([
    'Next steps:',
    `  1. Add ${fmt.bold('.feature')} files with ${fmt.bold('@RID-*')} tags to your specs/ directory`,
    `  2. Run ${fmt.bold('specdrive audit')} to validate RIDs`,
    `  3. Run tests with JUnit XML output`,
    `  4. Run ${fmt.bold('specdrive verify <report.xml>')} to check coverage`,
  ])
  console.log('')
}

/**
 * Run `specdrive init`.
 */
export async function runInit(dir: string = process.cwd()): Promise<void> {
  console.log(`\n${fmt.boldGreen('specdrive init')}\n`)

  // 1. Detect frameworks
  const results = await detectFrameworks(dir)
  printDetections(results)

  // 2. Select adapters
  let selectedAdapters: Adapter[]
  if (results.length === 0) {
    selectedAdapters = []
    console.log(`  ${JUNIT_XML_SPEC}\n`)
  } else {
    // Use all detected frameworks — a project can have both pytest and vitest
    selectedAdapters = results.map((r) => r.adapter)
  }

  // 3. Build plan
  const plan = await buildPlan(dir, selectedAdapters)

  // 4. Show plan
  printPlan(plan)

  // 5. Apply
  const applied = await applyPlan(dir, plan)

  // 6. Summary
  printSummary(applied)
}
