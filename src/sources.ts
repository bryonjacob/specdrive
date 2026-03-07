import type { SourceUri } from './types.js'

/**
 * Parse a source URI string into a typed SourceUri.
 *
 * Supported formats:
 * - `path:../relative/path`
 * - `github:org/repo@ref`
 * - `gist:id@ref`
 * - `git:https://host/repo.git@ref`
 */
export function parseSourceUri(raw: string): SourceUri {
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) {
    throw new Error(`Invalid source URI (missing scheme): ${raw}`)
  }

  const scheme = raw.slice(0, colonIdx)
  const rest = raw.slice(colonIdx + 1)

  switch (scheme) {
    case 'path':
      return parsePath(rest, raw)
    case 'github':
      return parseGithub(rest, raw)
    case 'gist':
      return parseGist(rest, raw)
    case 'git':
      return parseGit(rest, raw)
    default:
      throw new Error(`Unknown source URI scheme "${scheme}": ${raw}`)
  }
}

function parsePath(rest: string, raw: string): SourceUri {
  if (!rest) throw new Error(`Invalid path URI (empty path): ${raw}`)
  return { scheme: 'path', path: rest }
}

function parseGithub(rest: string, raw: string): SourceUri {
  const { head, ref } = splitRef(rest, raw)
  const slashIdx = head.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`Invalid github URI (expected org/repo): ${raw}`)
  }
  const org = head.slice(0, slashIdx)
  const repo = head.slice(slashIdx + 1)
  if (!org || !repo) {
    throw new Error(`Invalid github URI (empty org or repo): ${raw}`)
  }
  return { scheme: 'github', org, repo, ref }
}

function parseGist(rest: string, raw: string): SourceUri {
  const { head, ref } = splitRef(rest, raw)
  if (!head) throw new Error(`Invalid gist URI (empty id): ${raw}`)
  return { scheme: 'gist', id: head, ref }
}

function parseGit(rest: string, raw: string): SourceUri {
  const { head, ref } = splitRef(rest, raw)
  if (!head) throw new Error(`Invalid git URI (empty url): ${raw}`)
  if (!/^https?:\/\//.test(head)) {
    throw new Error(`Invalid git URI (only http:// and https:// URLs are allowed): ${raw}`)
  }
  return { scheme: 'git', url: head, ref }
}

/**
 * Convert a SourceUri to a git clone URL.
 * Returns null for path: sources (they don't use git).
 */
export function toCloneUrl(uri: SourceUri): string | null {
  switch (uri.scheme) {
    case 'path':
      return null
    case 'github':
      return `https://github.com/${uri.org}/${uri.repo}.git`
    case 'gist':
      return `https://gist.github.com/${uri.id}.git`
    case 'git':
      return uri.url
  }
}

/**
 * Get the ref (branch/tag/SHA) from a SourceUri.
 * Returns 'local' for path: sources.
 */
export function getRef(uri: SourceUri): string {
  return uri.scheme === 'path' ? 'local' : uri.ref
}

function splitRef(rest: string, raw: string): { head: string; ref: string } {
  const atIdx = rest.lastIndexOf('@')
  if (atIdx === -1) {
    throw new Error(`Invalid source URI (missing @ref): ${raw}`)
  }
  const head = rest.slice(0, atIdx)
  const ref = rest.slice(atIdx + 1)
  if (!ref) {
    throw new Error(`Invalid source URI (empty ref): ${raw}`)
  }
  if (ref.startsWith('-')) {
    throw new Error(`Invalid source URI (ref must not start with "-"): ${raw}`)
  }
  return { head, ref }
}
