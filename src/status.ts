import { join } from 'node:path'
import { loadConfig } from './config.js'
import { readLockfile } from './lockfile.js'
import { scanAllSpecs, scanLocalSpecs } from './scan.js'
import type { SpecdriveConfig, Lockfile, RidEntry, SpecDeclaration } from './types.js'

function printSpecRow(
  spec: SpecDeclaration,
  lockMap: Map<string, Lockfile['specs'][0]>,
  rids: RidEntry[]
): void {
  const lock = lockMap.get(spec.name)
  const specRids = rids.filter((r) => r.spec === spec.name)
  const version = lock?.resolvedRef?.slice(0, 12) ?? '—'
  const status = lock ? 'installed' : 'not installed'
  const name = spec.name.padEnd(20)
  const source = spec.source.padEnd(35)
  const ver = version.padEnd(14)
  const ridCount = String(specRids.length).padEnd(6)
  console.log(`  ${name} ${source} ${ver} ${ridCount} ${status}`)
}

async function printVendoredSpecs(
  config: SpecdriveConfig,
  baseDir: string,
  lockfile: Lockfile | null
): Promise<void> {
  const rids = await scanAllSpecs(join(baseDir, 'specs', '_specdrive'))
  const lockMap = new Map(lockfile?.specs.map((s) => [s.name, s]) ?? [])

  console.log('')
  console.log(
    '  Name                 Source                              Version        RIDs   Status'
  )
  console.log('  ' + '─'.repeat(90))

  for (const spec of config.specs) {
    printSpecRow(spec, lockMap, rids)
  }

  console.log('')
}

function leafName(localPath: string): string {
  const lastSlash = localPath.lastIndexOf('/')
  return lastSlash >= 0 ? localPath.slice(lastSlash + 1) : localPath
}

async function printLocalSpecs(config: SpecdriveConfig, baseDir: string): Promise<void> {
  const localRids = await scanLocalSpecs(baseDir, config.localSpecs!)

  console.log('  Local specs:')
  console.log('  ' + '─'.repeat(40))

  for (const localPath of config.localSpecs!) {
    const pathRids = localRids.filter((r) => r.spec === leafName(localPath))
    console.log(`  ${localPath.padEnd(30)} ${pathRids.length} RIDs`)
  }

  console.log('')
}

/**
 * Run the `status` command.
 *
 * Prints a table showing each declared spec, its source, locked version,
 * RID count, and install status. Also shows local spec paths and RID counts.
 */
export async function runStatus(baseDir: string = process.cwd()): Promise<void> {
  const config = await loadConfig(baseDir)
  const lockfile = await readLockfile(join(baseDir, '.specdrive-lock.yaml'))

  if (config.specs.length > 0) {
    await printVendoredSpecs(config, baseDir, lockfile)
  }

  if (config.localSpecs && config.localSpecs.length > 0) {
    await printLocalSpecs(config, baseDir)
  }
}
