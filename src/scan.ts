import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { RID_TAG_RE } from './rid.js'
import { walkFeatureFiles } from './fs-utils.js'
import type { RidEntry } from './types.js'

/** Match a Scenario / Scenario Outline boundary line. */
const SCENARIO_RE = /^\s*(Scenario|Scenario Outline):/

/**
 * Scan feature files under `baseDir/specName/` for @RID-* tags.
 */
export async function scanFeatureFiles(baseDir: string, specName: string): Promise<RidEntry[]> {
  const specDir = join(baseDir, specName)
  const files = await walkFeatureFiles(specDir)
  const entries: RidEntry[] = []

  for (const file of files) {
    entries.push(...scanContent(await readFile(file, 'utf-8'), file, specName))
  }

  return entries
}

/**
 * Extract @RID-* tags from one feature file's content, stamping each with a
 * per-file `scenarioId`.
 *
 * A scenario owns both its preceding tag block and its body, so tags are
 * buffered and attached to the upcoming scenario's id (flushed at each
 * `Scenario:` boundary). Tags inside a scenario body share that same id. This
 * is what lets dedup distinguish a same-scenario repeat (a tag above a
 * scenario re-tagged in its body → same id → duplicate) from the same RID on
 * two different scenarios (different ids → valid).
 */
function scanContent(content: string, file: string, specName: string): RidEntry[] {
  const entries: RidEntry[] = []
  const lines = content.split('\n')
  // Tags between two `Scenario:` lines all belong to one scenario: the tag
  // block precedes its scenario and the body follows it. So we open a new
  // scenario id at each boundary and assign that id to every tag until the
  // NEXT boundary. The first boundary closes the feature-level block (id 0).
  let scenarioId = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SCENARIO_RE.test(line)) scenarioId++
    let match: RegExpExecArray | null
    RID_TAG_RE.lastIndex = 0
    while ((match = RID_TAG_RE.exec(line)) !== null) {
      entries.push({ rid: match[1], file, line: i + 1, spec: specName, scenarioId })
    }
  }
  return entries
}

/**
 * Scan all spec directories under `baseDir` for RIDs.
 */
export async function scanAllSpecs(baseDir: string): Promise<RidEntry[]> {
  let dirents
  try {
    dirents = await readdir(baseDir, { withFileTypes: true })
  } catch {
    return []
  }

  const entries: RidEntry[] = []
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const specEntries = await scanFeatureFiles(baseDir, dirent.name)
      entries.push(...specEntries)
    }
  }

  return entries
}

/**
 * Scan local spec directories for @RID-* tags.
 * Each path is relative to `baseDir` and split into parent + leaf
 * so that `scanFeatureFiles` can be reused.
 */
export async function scanLocalSpecs(baseDir: string, localPaths: string[]): Promise<RidEntry[]> {
  const entries: RidEntry[] = []
  for (const localPath of localPaths) {
    const lastSlash = localPath.lastIndexOf('/')
    const parent = lastSlash >= 0 ? localPath.slice(0, lastSlash) : '.'
    const leaf = lastSlash >= 0 ? localPath.slice(lastSlash + 1) : localPath
    const parentDir = join(baseDir, parent)
    const specEntries = await scanFeatureFiles(parentDir, leaf)
    entries.push(...specEntries)
  }
  return entries
}
