import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { RID_TAG_RE } from './rid.js'
import { walkFeatureFiles } from './fs-utils.js'
import type { SpecManifest } from './types.js'

/**
 * Load a spec manifest (spec.yaml) from a spec directory.
 * Returns null if spec.yaml doesn't exist.
 */
export async function loadSpecManifest(specDir: string): Promise<SpecManifest | null> {
  let content: string
  try {
    content = await readFile(join(specDir, 'spec.yaml'), 'utf-8')
  } catch {
    return null
  }

  const raw = parse(content)
  if (!raw || typeof raw !== 'object') return null

  return {
    name: raw.name ?? '',
    version: raw.version ?? '0.0.0',
    description: raw.description,
    extends: parseExtends(raw.extends),
    omits: parseStringArray(raw.omits),
    overrides: parseStringArray(raw.overrides),
  }
}

function parseExtendEntry(e: unknown): { source: string } {
  if (typeof e === 'string') return { source: e }
  if (e && typeof e === 'object' && 'source' in e)
    return { source: (e as Record<string, string>).source }
  return { source: '' }
}

function parseExtends(value: unknown): { source: string }[] | undefined {
  return Array.isArray(value) ? value.map(parseExtendEntry) : undefined
}

function parseStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((s: unknown) => typeof s === 'string') : undefined
}

/**
 * Resolve the list of .feature files in a spec directory.
 * If a manifest has `omits`, feature files containing those RIDs are excluded.
 */
export async function resolveFeatureFiles(
  specDir: string,
  manifest: SpecManifest | null
): Promise<string[]> {
  const files = await walkFeatureFiles(specDir)

  if (!manifest?.omits?.length) return files

  const omitSet = new Set(manifest.omits)
  const result: string[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    const rids = extractRids(content)
    const shouldOmit = rids.some((rid) => omitSet.has(rid))
    if (!shouldOmit) result.push(file)
  }

  return result
}

function extractRids(content: string): string[] {
  const rids: string[] = []
  RID_TAG_RE.lastIndex = 0
  let match
  while ((match = RID_TAG_RE.exec(content)) !== null) {
    rids.push(match[1])
  }
  return rids
}
