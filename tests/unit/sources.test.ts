import { describe, it, expect } from 'vitest'
import { parseSourceUri, toCloneUrl, getRef } from '../../src/sources.js'

describe('parseSourceUri', () => {
  it('parses path: URIs', () => {
    const uri = parseSourceUri('path:../local-spec')
    expect(uri).toEqual({ scheme: 'path', path: '../local-spec' })
  })

  it('parses github: URIs', () => {
    const uri = parseSourceUri('github:org/repo@v1.0.0')
    expect(uri).toEqual({ scheme: 'github', org: 'org', repo: 'repo', ref: 'v1.0.0' })
  })

  it('parses gist: URIs', () => {
    const uri = parseSourceUri('gist:abc123def@main')
    expect(uri).toEqual({ scheme: 'gist', id: 'abc123def', ref: 'main' })
  })

  it('parses git: URIs', () => {
    const uri = parseSourceUri('git:https://gitlab.com/org/repo.git@v2.0')
    expect(uri).toEqual({ scheme: 'git', url: 'https://gitlab.com/org/repo.git', ref: 'v2.0' })
  })

  it('throws on missing scheme', () => {
    expect(() => parseSourceUri('no-colon')).toThrow('missing scheme')
  })

  it('throws on unknown scheme', () => {
    expect(() => parseSourceUri('npm:package@1.0')).toThrow('Unknown source URI scheme')
  })

  it('throws on missing ref for github', () => {
    expect(() => parseSourceUri('github:org/repo')).toThrow('missing @ref')
  })

  it('throws on empty path', () => {
    expect(() => parseSourceUri('path:')).toThrow('empty path')
  })

  it('throws on empty org or repo', () => {
    expect(() => parseSourceUri('github:/repo@v1')).toThrow('empty org or repo')
  })

  it('handles @ in git URLs', () => {
    const uri = parseSourceUri('git:https://user@host.com/repo.git@main')
    expect(uri).toEqual({ scheme: 'git', url: 'https://user@host.com/repo.git', ref: 'main' })
  })

  it('throws on empty gist id', () => {
    expect(() => parseSourceUri('gist:@main')).toThrow('empty id')
  })

  it('throws on empty git url', () => {
    expect(() => parseSourceUri('git:@main')).toThrow('empty url')
  })

  it('throws on empty ref', () => {
    expect(() => parseSourceUri('github:org/repo@')).toThrow('empty ref')
  })

  it('throws on missing ref for gist', () => {
    expect(() => parseSourceUri('gist:abc123')).toThrow('missing @ref')
  })

  it('throws on git: URI with non-http URL', () => {
    expect(() => parseSourceUri('git:ssh://git@host/repo.git@main')).toThrow(
      'only http:// and https://'
    )
  })

  it('throws on git: URI with ext:: protocol', () => {
    expect(() => parseSourceUri('git:ext::sh -c cmd@main')).toThrow('only http:// and https://')
  })

  it('throws on ref starting with dash', () => {
    expect(() => parseSourceUri('github:org/repo@--evil')).toThrow('must not start with "-"')
  })

  it('throws on empty org or repo (empty repo)', () => {
    expect(() => parseSourceUri('github:org/@v1')).toThrow('empty org or repo')
  })
})

describe('toCloneUrl', () => {
  it('returns null for path: URIs', () => {
    expect(toCloneUrl({ scheme: 'path', path: '../local' })).toBeNull()
  })

  it('returns github clone URL', () => {
    expect(toCloneUrl({ scheme: 'github', org: 'org', repo: 'repo', ref: 'v1' })).toBe(
      'https://github.com/org/repo.git'
    )
  })

  it('returns gist clone URL', () => {
    expect(toCloneUrl({ scheme: 'gist', id: 'abc123', ref: 'main' })).toBe(
      'https://gist.github.com/abc123.git'
    )
  })

  it('returns git URL directly', () => {
    expect(toCloneUrl({ scheme: 'git', url: 'https://gitlab.com/repo.git', ref: 'v1' })).toBe(
      'https://gitlab.com/repo.git'
    )
  })
})

describe('getRef', () => {
  it('returns "local" for path: URIs', () => {
    expect(getRef({ scheme: 'path', path: '../local' })).toBe('local')
  })

  it('returns ref for github: URIs', () => {
    expect(getRef({ scheme: 'github', org: 'o', repo: 'r', ref: 'v1.0' })).toBe('v1.0')
  })
})
