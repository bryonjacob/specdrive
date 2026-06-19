import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { RID_TAG_RE } from './rid.js'
import { walkFeatureFiles } from './fs-utils.js'
import type { RidEntry } from './types.js'

/** Match a Scenario / Scenario Outline boundary line. */
const SCENARIO_RE = /^\s*(Scenario|Scenario Outline):/

/** Docstring delimiters that open/close a step-argument block. */
const DOCSTRING_DELIMS = new Set(['"""', '```'])

/**
 * A Gherkin tag line consists solely of whitespace-separated `@`-prefixed
 * tokens. A line like `# directory (@RID-X)` is a comment (first token is
 * `#`), and a step / table / docstring-body line never satisfies this. Only
 * genuine tag lines are eligible to yield @RID tags.
 */
function isTagLine(trimmed: string): boolean {
  if (!trimmed.startsWith('@')) return false
  return trimmed.split(/\s+/).every((token) => token.startsWith('@'))
}

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
 *
 * @RID tags are harvested ONLY from genuine Gherkin tag lines. RIDs mentioned
 * in `#` comments, step text, table rows, or inside `"""` / ``` docstrings
 * (including `//` comments in embedded source fixtures) are intentionally
 * ignored — writing a RID in a provenance comment is normal practice, not a
 * tag occurrence.
 */
function scanContent(content: string, file: string, specName: string): RidEntry[] {
  const entries: RidEntry[] = []
  const lines = content.split('\n')
  // Tags between two `Scenario:` lines all belong to one scenario: the tag
  // block precedes its scenario and the body follows it. So we open a new
  // scenario id at each boundary and assign that id to every tag until the
  // NEXT boundary. The first boundary closes the feature-level block (id 0).
  let scenarioId = 0
  let inDocstring = false
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    // A delimiter line toggles docstring state and yields nothing itself.
    if (DOCSTRING_DELIMS.has(trimmed)) {
      inDocstring = !inDocstring
      continue
    }
    // Inside a docstring, no line is Gherkin — skip boundary and tag detection.
    if (inDocstring) continue
    if (SCENARIO_RE.test(lines[i])) scenarioId++
    if (!isTagLine(trimmed)) continue
    let match: RegExpExecArray | null
    RID_TAG_RE.lastIndex = 0
    while ((match = RID_TAG_RE.exec(lines[i])) !== null) {
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
