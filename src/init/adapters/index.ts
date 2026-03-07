import type { Adapter } from '../types.js'
import { pytestAdapter } from './pytest.js'
import { vitestAdapter } from './vitest.js'

/**
 * All registered adapters. To add a new framework, create an adapter
 * file and add it here. The init orchestrator doesn't need to change.
 */
export const adapters: Adapter[] = [pytestAdapter, vitestAdapter]
