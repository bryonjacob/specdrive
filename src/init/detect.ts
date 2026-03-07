import type { Adapter, Detection } from './types.js'
import { adapters } from './adapters/index.js'

export interface DetectionResult {
  adapter: Adapter
  detection: Detection
}

const CONFIDENCE_ORDER: Record<Detection['confidence'], number> = {
  certain: 0,
  likely: 1,
  possible: 2,
}

/**
 * Run all adapter detectors against a project directory.
 * Returns matches sorted by confidence (highest first).
 */
export async function detectFrameworks(dir: string): Promise<DetectionResult[]> {
  const results: DetectionResult[] = []

  for (const adapter of adapters) {
    const detection = await adapter.detect(dir)
    if (detection) {
      results.push({ adapter, detection })
    }
  }

  results.sort(
    (a, b) => CONFIDENCE_ORDER[a.detection.confidence] - CONFIDENCE_ORDER[b.detection.confidence]
  )

  return results
}
