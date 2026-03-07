import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Check whether a file exists and is accessible.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Check whether a file exists and contains a given string.
 */
export async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    const content = await readFile(path, 'utf-8')
    return content.includes(needle)
  } catch {
    return false
  }
}

/**
 * Recursively walk a directory and return all .feature file paths.
 */
export async function walkFeatureFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return result
  }

  for (const dirent of dirents) {
    const fullPath = join(dir, dirent.name)
    if (dirent.isDirectory()) {
      const sub = await walkFeatureFiles(fullPath)
      result.push(...sub)
    } else if (dirent.name.endsWith('.feature')) {
      result.push(fullPath)
    }
  }

  return result
}
