import { join, dirname, relative } from 'node:path'
import { mkdir, rm, copyFile } from 'node:fs/promises'
import { loadConfig } from './config.js'
import { fetchSpec } from './fetch.js'
import { loadSpecManifest, resolveFeatureFiles } from './resolve.js'
import { scanFeatureFiles } from './scan.js'
import { writeLockfile } from './lockfile.js'
import type { LockEntry, Lockfile } from './types.js'

/**
 * Run the `install` command.
 *
 * 1. Load config
 * 2. For each spec: fetch → resolve → copy features
 * 3. Write lockfile
 */
export async function runInstall(baseDir: string = process.cwd()): Promise<void> {
  const config = await loadConfig(baseDir)
  const specdriveDir = join(baseDir, 'specs', '_specdrive')
  const cacheDir = join(baseDir, '.specdrive', 'cache')

  await mkdir(cacheDir, { recursive: true })

  const lockEntries: LockEntry[] = []

  for (const spec of config.specs) {
    console.log(`  fetching ${spec.name} from ${spec.source}...`)

    const { localPath, resolvedRef } = await fetchSpec(spec.source, cacheDir, spec.name, baseDir)
    const manifest = await loadSpecManifest(localPath)
    const features = await resolveFeatureFiles(localPath, manifest)

    // Clean target and copy features
    const targetDir = join(specdriveDir, spec.name)
    await rm(targetDir, { recursive: true, force: true })
    await mkdir(targetDir, { recursive: true })

    for (const file of features) {
      const relPath = relative(localPath, file)
      const destPath = join(targetDir, relPath)
      const destDir = dirname(destPath)
      await mkdir(destDir, { recursive: true })
      await copyFile(file, destPath)
    }

    // Count RIDs
    const rids = await scanFeatureFiles(specdriveDir, spec.name)

    lockEntries.push({
      name: spec.name,
      source: spec.source,
      resolvedRef,
      installedAt: new Date().toISOString(),
      ridCount: rids.length,
    })

    console.log(`  ✓ ${spec.name}: ${features.length} feature(s), ${rids.length} RID(s)`)
  }

  const lockfile: Lockfile = { version: 1, specs: lockEntries }
  await writeLockfile(join(baseDir, '.specdrive-lock.yaml'), lockfile)

  console.log(`\nInstalled ${lockEntries.length} spec(s). Lockfile written.`)
  console.log(`Run \`specdrive init\` to generate framework-specific test boilerplate.`)
}
