import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { SpecdriveConfig, SpecDeclaration } from './types.js'

const CONFIG_FILENAME = 'specdrive.yaml'
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/

function validateSpecName(name: string, i: number): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid config: specs[${i}].name contains invalid characters (only a-z, A-Z, 0-9, '.', '_', '-' allowed)`
    )
  }
}

function parseSpecEntry(s: unknown, i: number): SpecDeclaration {
  if (!s || typeof s !== 'object') {
    throw new Error(`Invalid config: specs[${i}] must be an object`)
  }
  const obj = s as Record<string, unknown>
  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error(`Invalid config: specs[${i}].name must be a non-empty string`)
  }
  if (typeof obj.source !== 'string' || !obj.source) {
    throw new Error(`Invalid config: specs[${i}].source must be a non-empty string`)
  }
  validateSpecName(obj.name, i)
  return { name: obj.name, source: obj.source }
}

function parseSpecs(raw: Record<string, unknown>): SpecDeclaration[] {
  if (raw.specs === undefined) return []
  if (!Array.isArray(raw.specs)) {
    throw new Error(`Invalid config: "specs" must be an array`)
  }
  return raw.specs.map((s: unknown, i: number) => parseSpecEntry(s, i))
}

function validateLocalPath(p: string, i: number): void {
  if (p.startsWith('/') || p.includes('..')) {
    throw new Error(
      `Invalid config: localSpecs[${i}] must be a relative path within the project (no ".." or absolute paths)`
    )
  }
}

function parseLocalSpecs(raw: Record<string, unknown>): string[] | undefined {
  if (raw.localSpecs === undefined) return undefined
  if (!Array.isArray(raw.localSpecs)) {
    throw new Error(`Invalid config: "localSpecs" must be an array`)
  }
  for (let i = 0; i < raw.localSpecs.length; i++) {
    if (typeof raw.localSpecs[i] !== 'string' || !raw.localSpecs[i]) {
      throw new Error(`Invalid config: localSpecs[${i}] must be a non-empty string`)
    }
    validateLocalPath(raw.localSpecs[i], i)
  }
  return raw.localSpecs
}

function parseStrictTraceability(raw: Record<string, unknown>): boolean | undefined {
  if (raw.strictTraceability === undefined) return undefined
  if (typeof raw.strictTraceability !== 'boolean') {
    throw new Error(`Invalid config: "strictTraceability" must be a boolean (true/false)`)
  }
  return raw.strictTraceability || undefined
}

/**
 * Load and validate specdrive.yaml from the given directory.
 */
export async function loadConfig(dir: string = process.cwd()): Promise<SpecdriveConfig> {
  const configPath = join(dir, CONFIG_FILENAME)
  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch {
    throw new Error(`Config file not found: ${configPath}`)
  }

  const raw = parse(content)
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid config: ${configPath} must be a YAML object`)
  }

  const specs = parseSpecs(raw)
  const localSpecs = parseLocalSpecs(raw)

  if (specs.length === 0 && !localSpecs) {
    throw new Error(`Invalid config: must declare "specs" or "localSpecs"`)
  }

  const strictTraceability = parseStrictTraceability(raw)
  return { specs, localSpecs, strictTraceability }
}
