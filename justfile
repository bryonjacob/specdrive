set shell := ["bash", "-uc"]

# Show all available commands
default:
    @just --list

# Install dependencies and setup development environment
dev-install:
    pnpm install

# Format code (auto-fix)
format:
    pnpm prettier --write .

# Lint code (auto-fix, complexity threshold=10)
lint:
    pnpm eslint . --fix

# Type check code
typecheck:
    pnpm tsc --noEmit

# Run unit tests
test:
    pnpm vitest run tests/unit --reporter=verbose

# Run tests in watch mode
test-watch:
    pnpm vitest tests/unit

# Run unit tests with coverage threshold (96%)
coverage:
    pnpm vitest run tests/unit --coverage --coverage.lines=96

# Run integration tests with coverage report (no threshold)
integration-test:
    pnpm vitest run tests/integration --coverage || true

# Detailed complexity report for refactoring decisions
complexity:
    @./scripts/complexity.sh

# Show lines of code by file
loc:
    cloc src/ --by-file --quiet

# Show outdated packages
deps:
    pnpm outdated

# Check for security vulnerabilities
vulns:
    pnpm audit

# Analyze licenses (flag GPL, etc.)
lic:
    @echo "Runtime dependencies:"
    @pnpm licenses list --prod --json 2>/dev/null | jq -r 'to_entries | map("  \(.value | length) \(.key)") | sort | reverse[]' 2>/dev/null || echo "  (none)"
    @echo ""
    @echo "Dev dependencies:"
    @pnpm licenses list --dev --json | jq -r 'to_entries | map("  \(.value | length) \(.key)") | sort | reverse[]'

# Generate software bill of materials
sbom:
    @./scripts/spin.sh "Generating SBOM..." pnpm dlx @cyclonedx/cdxgen -o sbom.json

# Environment health check
doctor:
    @echo "Checking environment..."
    @node --version
    @pnpm --version
    @npx tsc --version
    @echo "All tools available."

# Build artifacts
build:
    pnpm tsc

# Run all quality checks (format, lint, typecheck, coverage - fastest first)
check-all: format lint typecheck coverage
    @echo "All checks passed"

# Remove generated files and artifacts
clean:
    rm -rf node_modules dist coverage .vitest
