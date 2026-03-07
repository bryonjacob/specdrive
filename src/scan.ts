import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { RID_TAG_RE } from './rid.js'
import { walkFeatureFiles } from './fs-utils.js'
import type { RidEntry } from './types.js'

/**
 * Scan feature files under `baseDir/specName/` for @RID-* tags.
 */
export async function scanFeatureFiles(baseDir: string, specName: string): Promise<RidEntry[]> {
  const specDir = join(baseDir, specName)
  const files = await walkFeatureFiles(specDir)
  const entries: RidEntry[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let match: RegExpExecArray | null
      RID_TAG_RE.lastIndex = 0
      while ((match = RID_TAG_RE.exec(line)) !== null) {
        entries.push({
          rid: match[1],
          file,
          line: i + 1,
          spec: specName,
        })
      }
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
