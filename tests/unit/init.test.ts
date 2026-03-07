import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { detectFrameworks } from '../../src/init/detect.js'
import { runInit } from '../../src/init/index.js'
import { vitestAdapter } from '../../src/init/adapters/vitest.js'

describe('detectFrameworks', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `specdrive-init-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  it('detects pytest from pyproject.toml', async () => {
    await writeFile(
      join(testDir, 'pyproject.toml'),
      `[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`
    )
    const results = await detectFrameworks(testDir)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].detection.framework).toBe('pytest')
    expect(results[0].detection.confidence).toBe('certain')
  })

  it('detects pytest from pytest.ini', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')
    const results = await detectFrameworks(testDir)
    expect(results.some((r) => r.detection.framework === 'pytest')).toBe(true)
  })

  it('detects pytest from setup.cfg', async () => {
    await writeFile(join(testDir, 'setup.cfg'), '[tool:pytest]\ntestpaths = tests\n')
    const results = await detectFrameworks(testDir)
    const pytest = results.find((r) => r.detection.framework === 'pytest')
    expect(pytest).toBeDefined()
    expect(pytest!.detection.evidence).toContain('setup.cfg has [tool:pytest] section')
  })

  it('detects pytest from requirements.txt with likely confidence', async () => {
    await writeFile(join(testDir, 'requirements-dev.txt'), 'pytest\npytest-cov\n')
    await writeFile(join(testDir, 'conftest.py'), '# test config\n')
    const results = await detectFrameworks(testDir)
    const pytest = results.find((r) => r.detection.framework === 'pytest')
    expect(pytest).toBeDefined()
    expect(pytest!.detection.confidence).toBe('likely')
  })

  it('detects pytest with possible confidence from conftest.py only', async () => {
    await writeFile(join(testDir, 'conftest.py'), '# test config\n')
    const results = await detectFrameworks(testDir)
    const pytest = results.find((r) => r.detection.framework === 'pytest')
    expect(pytest).toBeDefined()
    expect(pytest!.detection.confidence).toBe('possible')
  })

  it('detects vitest from package.json and config', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^3.0.0' } })
    )
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({})\n`
    )
    const results = await detectFrameworks(testDir)
    expect(results.some((r) => r.detection.framework === 'vitest')).toBe(true)
    const vitest = results.find((r) => r.detection.framework === 'vitest')!
    expect(vitest.detection.confidence).toBe('certain')
  })

  it('detects both pytest and vitest in polyglot project', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^3.0.0' } })
    )
    const results = await detectFrameworks(testDir)
    const frameworks = results.map((r) => r.detection.framework)
    expect(frameworks).toContain('pytest')
    expect(frameworks).toContain('vitest')
  })

  it('returns empty for unknown project', async () => {
    await writeFile(join(testDir, 'README.md'), '# Hello')
    const results = await detectFrameworks(testDir)
    expect(results).toEqual([])
  })
})

describe('runInit', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `specdrive-init-run-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  it('creates specdrive.yaml and conftest.py for pytest project', async () => {
    await writeFile(
      join(testDir, 'pyproject.toml'),
      `[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`
    )

    await runInit(testDir)

    const yaml = await readFile(join(testDir, 'specdrive.yaml'), 'utf-8')
    expect(yaml).toContain('localSpecs')

    const conftest = await readFile(join(testDir, 'conftest.py'), 'utf-8')
    expect(conftest).toContain('specdrive: RID traceability')
    expect(conftest).toContain('pytest_collection_modifyitems')
    expect(conftest).toContain('user_properties')
  })

  it('creates specdrive.yaml and setup file for vitest project', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^3.0.0' } })
    )
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({\n  test: {\n    globals: true,\n  },\n})\n`
    )

    await runInit(testDir)

    const yaml = await readFile(join(testDir, 'specdrive.yaml'), 'utf-8')
    expect(yaml).toContain('localSpecs')

    const setup = await readFile(join(testDir, 'specdrive.setup.ts'), 'utf-8')
    expect(setup).toContain('specdrive: RID traceability')

    const config = await readFile(join(testDir, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain('specdrive.setup.ts')
  })

  it('appends to existing conftest.py without clobbering', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')
    await writeFile(join(testDir, 'conftest.py'), 'import pytest\n\n# existing stuff\n')

    await runInit(testDir)

    const conftest = await readFile(join(testDir, 'conftest.py'), 'utf-8')
    expect(conftest).toContain('# existing stuff')
    expect(conftest).toContain('specdrive: RID traceability')
  })

  it('appends with double newline when conftest lacks trailing newline', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')
    await writeFile(join(testDir, 'conftest.py'), 'import pytest')

    await runInit(testDir)

    const conftest = await readFile(join(testDir, 'conftest.py'), 'utf-8')
    expect(conftest).toContain('import pytest\n\n')
    expect(conftest).toContain('specdrive: RID traceability')
  })

  it('is idempotent — running twice does not duplicate', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')

    await runInit(testDir)
    const first = await readFile(join(testDir, 'conftest.py'), 'utf-8')

    await runInit(testDir)
    const second = await readFile(join(testDir, 'conftest.py'), 'utf-8')

    expect(second).toBe(first)
  })

  it('does not overwrite existing specdrive.yaml', async () => {
    await writeFile(join(testDir, 'pytest.ini'), '[pytest]\n')
    await writeFile(join(testDir, 'specdrive.yaml'), 'localSpecs:\n  - my-specs\n')

    await runInit(testDir)

    const yaml = await readFile(join(testDir, 'specdrive.yaml'), 'utf-8')
    expect(yaml).toContain('my-specs')
  })

  it('handles unknown framework gracefully', async () => {
    await runInit(testDir)

    const yaml = await readFile(join(testDir, 'specdrive.yaml'), 'utf-8')
    expect(yaml).toContain('localSpecs')
  })

  it('shows manual steps when vitest config cannot be auto-edited', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^3.0.0' } })
    )
    // No vitest.config.ts — triggers manual instructions path

    await runInit(testDir)

    const setup = await readFile(join(testDir, 'specdrive.setup.ts'), 'utf-8')
    expect(setup).toContain('specdrive: RID traceability')
  })
})

describe('vitestAdapter', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `specdrive-vitest-adapter-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  it('returns null when no vitest signals found', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ dependencies: {} }))
    const result = await vitestAdapter.detect(testDir)
    expect(result).toBeNull()
  })

  it('detects vitest with likely confidence from package.json only', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^3.0.0' } })
    )
    const result = await vitestAdapter.detect(testDir)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('likely')
  })

  it('detects vitest with possible confidence from config only', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ dependencies: {} }))
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({})\n`
    )
    const result = await vitestAdapter.detect(testDir)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('possible')
  })

  it('returns empty files when setup already has marker', async () => {
    await writeFile(
      join(testDir, 'specdrive.setup.ts'),
      '// -- specdrive: RID traceability --\n// existing content\n'
    )
    const files = await vitestAdapter.files(testDir)
    expect(files).toEqual([])
  })

  it('returns manual instructions when no vitest config exists', async () => {
    const edits = await vitestAdapter.configEdits(testDir)
    expect(edits).toHaveLength(1)
    expect(edits[0].safe).toBe(false)
    expect(edits[0].manual).toContain('No vitest config file found')
    expect(edits[0].manual).toContain('specdrive.setup.ts')
  })

  it('returns empty edits when setup file already wired in config', async () => {
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({\n  test: {\n    setupFiles: ['specdrive.setup.ts'],\n  },\n})\n`
    )
    const edits = await vitestAdapter.configEdits(testDir)
    expect(edits).toEqual([])
  })

  it('appends to existing setupFiles array', async () => {
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({\n  test: {\n    setupFiles: ['other.setup.ts'],\n  },\n})\n`
    )
    const edits = await vitestAdapter.configEdits(testDir)
    expect(edits).toHaveLength(1)
    expect(edits[0].safe).toBe(true)
    expect(edits[0].description).toContain('setupFiles array')

    // Apply and verify
    await edits[0].apply(testDir)
    const config = await readFile(join(testDir, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain("'other.setup.ts', 'specdrive.setup.ts'")
  })

  it('falls back to manual when config cannot be parsed', async () => {
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `// weird config without test block\nexport default { plugins: [] }\n`
    )
    const edits = await vitestAdapter.configEdits(testDir)
    expect(edits).toHaveLength(1)
    expect(edits[0].safe).toBe(false)
    expect(edits[0].manual).toContain('setupFiles')
  })

  it('does not detect vitest when config has no vitest markers', async () => {
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ dependencies: {} }))
    await writeFile(join(testDir, 'vitest.config.ts'), `export default {}\n`)
    const result = await vitestAdapter.detect(testDir)
    expect(result).toBeNull()
  })

  it('appends to empty setupFiles array', async () => {
    await writeFile(
      join(testDir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config'\nexport default defineConfig({\n  test: {\n    setupFiles: [],\n  },\n})\n`
    )
    const edits = await vitestAdapter.configEdits(testDir)
    expect(edits).toHaveLength(1)
    expect(edits[0].safe).toBe(true)

    await edits[0].apply(testDir)
    const config = await readFile(join(testDir, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain("setupFiles: ['specdrive.setup.ts']")
  })
})
