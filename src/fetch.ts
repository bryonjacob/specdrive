import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdir, access, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { parseSourceUri, toCloneUrl, getRef } from './sources.js'
import type { SourceUri } from './types.js'

const exec = promisify(execFile)

export interface FetchResult {
  localPath: string
  resolvedRef: string
}

/**
 * Fetch a spec source into the cache directory.
 *
 * - `path:` sources resolve the relative path and return resolvedRef 'local'
 * - Git sources clone into `.specdrive/cache/<name>/`
 */
export async function fetchSpec(
  sourceStr: string,
  cacheDir: string,
  name: string,
  baseDir: string = process.cwd()
): Promise<FetchResult> {
  const uri = parseSourceUri(sourceStr)

  if (uri.scheme === 'path') {
    const localPath = resolve(baseDir, uri.path)
    await access(localPath) // throws if not accessible
    return { localPath, resolvedRef: 'local' }
  }

  return cloneGitSource(uri, cacheDir, name)
}

async function cloneGitSource(
  uri: Exclude<SourceUri, { scheme: 'path' }>,
  cacheDir: string,
  name: string
): Promise<FetchResult> {
  const cloneUrl = toCloneUrl(uri)!
  const ref = getRef(uri)
  const targetDir = resolve(cacheDir, name)

  // Clean and recreate target
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })

  // Try shallow clone with branch/tag first
  try {
    await exec('git', [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--no-tags',
      '--branch',
      ref,
      '--',
      cloneUrl,
      targetDir,
    ])
  } catch {
    // Fall back to full clone + checkout (needed for SHA refs)
    await rm(targetDir, { recursive: true, force: true })
    await mkdir(targetDir, { recursive: true })
    await exec('git', ['clone', '--no-tags', '--', cloneUrl, targetDir])
    await exec('git', ['checkout', '--', ref], { cwd: targetDir })
  }

  // Get resolved SHA
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: targetDir })
  const resolvedRef = stdout.trim()

  return { localPath: targetDir, resolvedRef }
}
