#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInstall } from './install.js'
import { runAudit } from './audit.js'
import { runStatus } from './status.js'
import { runVerify } from './verify.js'
import { runInit } from './init/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
const VERSION: string = pkg.version

const HELP = `
specdrive v${VERSION} — spec package manager for Gherkin behavioral contracts

Usage:
  specdrive init                 Detect test framework and set up RID traceability
  specdrive install              Fetch and vendor spec packages
  specdrive audit                Verify all RIDs are present and valid
  specdrive verify <report.xml>  Cross-reference RIDs against JUnit XML test report
                                 --strict  Fail on untraced tests (overrides config)
  specdrive status               Show declared specs, versions, and RID counts
  specdrive --help               Show this help message
  specdrive --version            Show version
`

async function handleVerify(): Promise<void> {
  const args = process.argv.slice(3)
  const strict = args.includes('--strict')
  const reportPath = args.find((a) => !a.startsWith('--'))
  if (!reportPath) {
    console.error('Usage: specdrive verify <report.xml> [--strict]')
    process.exit(1)
  }
  const result = await runVerify(reportPath, process.cwd(), strict || undefined)
  if (result.errors.length > 0) process.exit(1)
}

async function handleAudit(): Promise<void> {
  const result = await runAudit()
  if (result.errors.length > 0) process.exit(1)
}

const commands: Record<string, () => Promise<void>> = {
  init: () => runInit(),
  install: () => runInstall(),
  audit: handleAudit,
  verify: handleVerify,
  status: () => runStatus(),
}

async function main() {
  const command = process.argv[2]

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION)
    return
  }

  const handler = commands[command]
  if (!handler) {
    console.error(`Unknown command: ${command}`)
    console.log(HELP)
    process.exit(1)
  }

  await handler()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
