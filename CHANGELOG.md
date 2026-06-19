# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-19

### Changed

- **audit: allow one RID across multiple scenarios (many-to-many requirement↔scenario); only same-scenario duplicate tags are errors.** Previously any RID appearing on more than one line was flagged as a duplicate, which wrongly penalized legitimate coverage where one requirement is proven by several scenarios, or one scenario covers several requirements. A duplicate is now reported only when the same RID tag is repeated within a single scenario (no intervening `Scenario:` / `Scenario Outline:` boundary). Projects relying on strict RID-per-scenario uniqueness will now permit cross-scenario reuse; this is intended and is the new default for everyone.

## [0.1.0] - 2025-11-30

### Added

- `specdrive init` command with pytest and vitest adapter support
- `specdrive install` command for fetching and vendoring spec packages
- `specdrive audit` command for RID format validation and duplicate detection
- `specdrive verify` command for cross-referencing RIDs against JUnit XML reports
- `specdrive status` command for viewing spec inventory
- Support for `path:`, `github:`, `gist:`, and `git:` source URI schemes
- Local spec directory support via `localSpecs` config
- `strictTraceability` config option for requiring RID annotations on all tests
- `@NOSPEC` annotation for opting tests out of traceability requirements
- Lockfile-based version pinning for vendored specs
- Generic fallback adapter with JUnit XML format documentation
