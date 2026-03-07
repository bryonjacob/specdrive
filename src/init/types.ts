/**
 * Result of framework detection.
 */
export interface Detection {
  framework: string
  confidence: 'certain' | 'likely' | 'possible'
  evidence: string[]
}

/**
 * A file the adapter wants to create.
 */
export interface AdapterFile {
  path: string
  content: string
  description: string
}

/**
 * A modification to an existing config file.
 */
export interface ConfigEdit {
  path: string
  description: string
  safe: boolean
  apply: (dir: string) => Promise<void>
  manual: string
}

/**
 * A framework adapter. One per supported test framework.
 *
 * Adding a new framework = implement this interface + register in adapters/index.ts.
 */
export interface Adapter {
  framework: string
  detect: (dir: string) => Promise<Detection | null>
  files: (dir: string) => Promise<AdapterFile[]>
  configEdits: (dir: string) => Promise<ConfigEdit[]>
}
