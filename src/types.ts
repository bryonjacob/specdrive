/**
 * Source URI discriminated union.
 * Parsed from strings like `path:../local`, `github:org/repo@v1.0`, etc.
 */
export type SourceUri =
  | { scheme: 'path'; path: string }
  | { scheme: 'github'; org: string; repo: string; ref: string }
  | { scheme: 'gist'; id: string; ref: string }
  | { scheme: 'git'; url: string; ref: string }

/**
 * A spec dependency declared in specdrive.yaml.
 */
export interface SpecDeclaration {
  name: string
  source: string
}

/**
 * Top-level specdrive.yaml config.
 */
export interface SpecdriveConfig {
  specs: SpecDeclaration[]
  localSpecs?: string[]
  strictTraceability?: boolean
}

/**
 * Spec manifest (spec.yaml) found inside a spec package.
 */
export interface SpecManifest {
  name: string
  version: string
  description?: string
  extends?: SpecExtension[]
  omits?: string[]
  overrides?: string[]
}

/**
 * An extends entry in spec.yaml — references an upstream spec.
 */
export interface SpecExtension {
  source: string
}

/**
 * A locked dependency entry in .specdrive-lock.yaml.
 */
export interface LockEntry {
  name: string
  source: string
  resolvedRef: string
  installedAt: string
  ridCount: number
}

/**
 * The full lockfile structure.
 */
export interface Lockfile {
  version: 1
  specs: LockEntry[]
}

/**
 * A single RID occurrence found by scanning feature files.
 *
 * `scenarioId` is a per-file, monotonically increasing counter that
 * increments at each `Scenario:` / `Scenario Outline:` line. Tags before
 * the first scenario share id 0. Two occurrences of the same RID in the
 * same file with the same `scenarioId` belong to one scenario and are a
 * genuine duplicate; differing ids mean different scenarios (valid reuse).
 */
export interface RidEntry {
  rid: string
  file: string
  line: number
  spec: string
  scenarioId: number
}

/**
 * Result of an audit run.
 */
export interface AuditResult {
  declared: string[]
  installed: string[]
  missing: string[]
  rids: RidEntry[]
  duplicates: RidEntry[][]
  invalidFormat: RidEntry[]
  errors: string[]
}
