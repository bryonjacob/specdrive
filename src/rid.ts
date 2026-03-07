/**
 * The core RID pattern: RID-UPPER-CASE-NNN
 * Base pattern (no anchors, no flags) — derive variants from this.
 */
const RID_CORE = 'RID-[A-Z][A-Z0-9-]*-\\d{3}'

/** Match @RID-... tags in Gherkin feature files (global, with capture group). */
export const RID_TAG_RE = new RegExp(`@(${RID_CORE})`, 'g')

/** Match RID-... anywhere in text (global, no capture group). */
export const RID_RE = new RegExp(RID_CORE, 'g')

/** Validate that a string is exactly one well-formed RID. */
export const RID_FORMAT_RE = new RegExp(`^${RID_CORE}$`)
