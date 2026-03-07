# Contributing to specdrive

Thank you for your interest in contributing to specdrive!

## Development Setup

```bash
git clone https://github.com/bryonjacob/specdrive.git
cd specdrive
pnpm install
```

## Running Tests

```bash
pnpm test              # unit tests
pnpm run coverage      # with 96% threshold enforcement
pnpm run typecheck     # type checking
```

Or with [just](https://github.com/casey/just):

```bash
just check-all         # format, lint, typecheck, coverage
just test              # unit tests only
just complexity        # check per-function complexity
```

## Code Style

- No semicolons, single quotes, trailing commas (es5), 100 char print width
- Enforced by prettier + eslint with complexity <= 10
- Run `pnpm run format` and `pnpm run lint` before committing

## Architecture

Two-layer design:

- **Pure logic modules** (`config.ts`, `scan.ts`, `sources.ts`, `resolve.ts`, `lockfile.ts`, `color.ts`, `audit.ts`, `rid.ts`, `fs-utils.ts`) -- no side effects, tested at 96%+ coverage
- **Orchestration modules** (`install.ts`, `fetch.ts`, `status.ts`, `verify.ts`, `index.ts`) -- use child_process for git, filesystem I/O, console output

The init system uses an adapter pattern: each framework adapter is a single file. See `src/init/adapters/` for examples.

## Adding a Framework Adapter

1. Create `src/init/adapters/<framework>.ts` implementing the `Adapter` interface from `src/init/types.ts`
2. Add it to the `adapters` array in `src/init/adapters/index.ts`
3. Add tests in `tests/unit/init.test.ts`

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure `pnpm run coverage` and `pnpm run typecheck` pass
5. Submit a pull request

## Reporting Issues

Please open an issue on GitHub with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS
