# specdrive

Spec package manager for Gherkin behavioral contracts. Install shared `.feature` specs, audit requirement ID (RID) integrity, and verify bidirectional traceability between specs and test results.

## Why specdrive?

If your team writes Gherkin specs with requirement IDs (`@RID-AUTH-001`, `@RID-PAY-003`), specdrive gives you:

- **Shared specs as packages** -- fetch `.feature` files from git repos and vendor them into your project, with lockfile-based version pinning.
- **RID integrity auditing** -- validate RID format, catch duplicates, and enumerate your spec inventory.
- **Traceability verification** -- cross-reference declared RIDs against JUnit XML test reports to find coverage gaps.
- **Framework-aware setup** -- auto-detect your test framework and generate the bridging code that maps requirement tags into JUnit XML properties.

Specdrive is **language-agnostic**. It works with any project that produces JUnit XML test output -- Python (pytest), JavaScript/TypeScript (Vitest, Jest), Java (JUnit 5), and more.

## Installation

```bash
npm install -g specdrive
```

Or use without installing:

```bash
npx specdrive init
```

## Commands

### `specdrive init`

Detect your test framework, generate requirement-to-JUnit bridging code, and scaffold a `specdrive.yaml` config file.

```bash
npx specdrive init
```

Supported frameworks:

| Framework            | Status    |
| -------------------- | --------- |
| pytest (pytest-bdd)  | Supported |
| Vitest (QuickPickle) | Supported |
| Generic (JUnit XML)  | Fallback  |

Adding a new framework adapter is one file -- see [Adding Adapters](#adding-a-framework-adapter) below.

### `specdrive install`

Fetch spec packages from git repos or local paths, vendor into `specs/_specdrive/`, and write a lockfile.

```bash
npx specdrive install
```

### `specdrive audit`

Validate RID format, check for duplicates, and enumerate specs with counts.

```bash
npx specdrive audit
```

### `specdrive verify`

Cross-reference declared RIDs against a JUnit XML test report. Shows coverage percentage and lists uncovered RIDs with source locations.

```bash
npx specdrive verify test-results.xml
```

### `specdrive status`

Show declared specs, versions, and RID counts.

```bash
npx specdrive status
```

## Configuration

Create a `specdrive.yaml` in your project root:

```yaml
# Local spec directories (relative to project root)
localSpecs:
  - specs/auth
  - specs/billing

# Shared spec packages (fetched from git)
specs:
  - name: core-spec
    source: github:org/spec-repo@v1.0.0
  - name: integration-spec
    source: git:https://gitlab.com/team/specs.git@main

# Fail on tests without RID annotations (default: false)
strictTraceability: true
```

At least one of `specs` or `localSpecs` must be present.

## Source URI Schemes

| Scheme    | Example                          | Description       |
| --------- | -------------------------------- | ----------------- |
| `path:`   | `path:../local-spec`             | Local filesystem  |
| `github:` | `github:org/repo@v1.0`           | GitHub repository |
| `gist:`   | `gist:abc123@main`               | GitHub Gist       |
| `git:`    | `git:https://host/repo.git@v2.0` | Any git URL       |

All remote sources require an `@ref` (tag, branch, or SHA).

## What Are RIDs?

Requirement IDs (RIDs) are tags on Gherkin scenarios that create traceability links between specs and tests:

```gherkin
@RID-AUTH-001
Scenario: User can log in with valid credentials
  Given a registered user
  When they provide correct credentials
  Then they are authenticated
```

Specdrive ensures every RID is well-formed, unique across your spec inventory, and covered by a passing test.

## Project Layout (consumer-side)

After setup, your project will have:

```
specdrive.yaml            # config: specs and/or localSpecs
.specdrive-lock.yaml      # locked versions with SHAs (commit this)
.specdrive/cache/         # git clones (gitignore this)
specs/_specdrive/         # vendored feature files (gitignore this)
```

## Adding a Framework Adapter

Each adapter is a single file at `src/init/adapters/<framework>.ts` implementing the `Adapter` interface:

- `detect(dir)` -- inspect project files, return confidence level + evidence
- `files(dir)` -- bridging code files to generate
- `configEdits(dir)` -- modifications to existing config files

Register it in `src/init/adapters/index.ts`. The orchestrator does not need to change.

Adapters are idempotent (marker comments prevent duplication), safe (only automates edits it can parse reliably), and communicative (shows a plan before applying).

## Development

```bash
pnpm install
pnpm test           # 122 unit tests
pnpm run build      # tsc -> dist/
pnpm run coverage   # 96% threshold
```

Or with [just](https://github.com/casey/just):

```bash
just dev-install
just check-all      # format, lint, typecheck, coverage
```

### `specdrive --version`

Print the installed version.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and contribution guidelines.

## License

[MIT](LICENSE)
