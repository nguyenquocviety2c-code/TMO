/**
 * Service Key Pool — Rotating API Key Management for External Services
 *
 * Provides round-robin key rotation with automatic failure tracking and cooldown.
 * Used by Tavily, Serper, and Jina API integrations in tool-executor.ts.
 *
 * Features:
 *   - Round-robin key selection across multiple API keys
 *   - Automatic failure detection: HTTP 429 (rate limit), 401/403 (auth error)
 *   - Cooldown period: Failed keys are skipped for a configurable duration
 *   - Permanent disable: Keys that return auth errors are disabled until restart
 *   - Statistics tracking: usage count, failure count, last used timestamp
 *
 * Architecture:
 *   ServiceKeyPool('Tavily', [key1, key2, key3, key4])
 *   → getNextKey() → round-robin selection → skip failed/disabled keys
 *   → reportResult(key, success, statusCode) → update key state
 *   → If key fails with 429 → cooldown 60s
 *   → If key fails with 401/403 → permanent disable (bad key)
 */

// ==================== TYPES ====================

export interface ServiceKeyState {
  key: string
  index: number
  enabled: boolean
  permanentlyDisabled: boolean
  cooldownUntil: number        // Timestamp (ms) when cooldown expires, 0 = no cooldown
  usageCount: number
  failureCount: number
  lastUsedAt: number           // Timestamp (ms), 0 = never used
  lastFailedAt: number         // Timestamp (ms), 0 = never failed
  lastStatusCode: number | null
  lastErrorMessage: string | null
}

export interface ServiceKeyPoolConfig {
  /** Name of the service (e.g., 'Tavily', 'Serper', 'Jina') — for logging */
  name: string
  /** API keys to rotate through */
  keys: string[]
  /** Cooldown duration in ms when a key hits rate limit (429). Default: 60000 (1 min) */
  rateLimitCooldownMs?: number
  /** Cooldown duration in ms when a key has a server error (5xx). Default: 30000 (30s) */
  serverErrorCooldownMs?: number
  /** Whether to permanently disable keys on auth errors (401/403). Default: true */
  disableOnAuthError?: boolean
}

export interface KeySelectionResult {
  key: string
  index: number
  /** How many keys were skipped to find this one (0 = first available) */
  skipped: number
  /** True if all keys are in cooldown/disabled — using a cooldown key as last resort */
  isLastResort: boolean
}

// ==================== KEY POOL CLASS ====================

export class ServiceKeyPool {
  private name: string
  private keys: ServiceKeyState[] = []
  private nextIndex: number = 0  // Round-robin pointer
  private rateLimitCooldownMs: number
  private serverErrorCooldownMs: number
  private disableOnAuthError: boolean

  constructor(config: ServiceKeyPoolConfig) {
    this.name = config.name
    this.rateLimitCooldownMs = config.rateLimitCooldownMs ?? 60000
    this.serverErrorCooldownMs = config.serverErrorCooldownMs ?? 30000
    this.disableOnAuthError = config.disableOnAuthError ?? true

    // Initialize key states — filter out empty/undefined keys
    const validKeys = config.keys.filter(k => k && k.trim().length > 0)
    this.keys = validKeys.map((key, index) => ({
      key,
      index,
      enabled: true,
      permanentlyDisabled: false,
      cooldownUntil: 0,
      usageCount: 0,
      failureCount: 0,
      lastUsedAt: 0,
      lastFailedAt: 0,
      lastStatusCode: null,
      lastErrorMessage: null,
    }))

    if (this.keys.length === 0) {
      console.warn(`[ServiceKeyPool:${this.name}] ⚠️ No valid API keys configured`)
    } else {
      console.log(`[ServiceKeyPool:${this.name}] ✅ Initialized with ${this.keys.length} key(s)`)
    }
  }

  /**
   * Get the next available API key using round-robin selection.
   * Skips keys that are in cooldown or permanently disabled.
   * If all keys are unavailable, returns the least-recently-failed key as a last resort.
   */
  getNextKey(): KeySelectionResult | null {
    if (this.keys.length === 0) return null

    const now = Date.now()
    let skipped = 0

    // Try all keys starting from nextIndex
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.nextIndex + i) % this.keys.length
      const state = this.keys[idx]

      // Skip permanently disabled keys
      if (state.permanentlyDisabled || !state.enabled) {
        skipped++
        continue
      }

      // Skip keys in cooldown
      if (state.cooldownUntil > now) {
        skipped++
        continue
      }

      // Found an available key!
      this.nextIndex = (idx + 1) % this.keys.length
      state.usageCount++
      state.lastUsedAt = now
      return {
        key: state.key,
        index: state.index,
        skipped,
        isLastResort: false,
      }
    }

    // ALL keys are unavailable — find the least-recently-failed key as last resort
    const availableKeys = this.keys.filter(k => !k.permanentlyDisabled && k.enabled)
    if (availableKeys.length === 0) {
      console.error(`[ServiceKeyPool:${this.name}] ❌ All keys permanently disabled!`)
      return null
    }

    // Sort by cooldownUntil ascending (soonest to recover first)
    availableKeys.sort((a, b) => a.cooldownUntil - b.cooldownUntil)
    const lastResort = availableKeys[0]
    
    console.warn(
      `[ServiceKeyPool:${this.name}] ⚠️ All keys in cooldown — using key ${lastResort.index + 1} as last resort ` +
      `(cooldown expires in ${Math.max(0, lastResort.cooldownUntil - now)}ms)`
    )

    lastResort.usageCount++
    lastResort.lastUsedAt = now
    this.nextIndex = (lastResort.index + 1) % this.keys.length

    return {
      key: lastResort.key,
      index: lastResort.index,
      skipped,
      isLastResort: true,
    }
  }

  /**
   * Report the result of using a key.
   * This updates the key's state for future rotation decisions.
   *
   * @param keyIndex - The index of the key that was used
   * @param success - Whether the API call succeeded
   * @param statusCode - HTTP status code (if applicable)
   * @param errorMessage - Error message (if failed)
   */
  reportResult(keyIndex: number, success: boolean, statusCode?: number, errorMessage?: string): void {
    if (keyIndex < 0 || keyIndex >= this.keys.length) return
    const state = this.keys[keyIndex]
    const now = Date.now()

    state.lastStatusCode = statusCode ?? null
    state.lastErrorMessage = errorMessage ?? null

    if (success) {
      // Clear any cooldown on success
      state.cooldownUntil = 0
      return
    }

    // Handle failure
    state.failureCount++
    state.lastFailedAt = now

    // Detect "credits exhausted" or "insufficient quota" errors — permanently disable
    const msg = (errorMessage || '').toLowerCase()
    const isCreditsExhausted = (
      (statusCode === 400 || statusCode === 402 || statusCode === 403) &&
      (msg.includes('not enough credits') || msg.includes('insufficient') || msg.includes('quota') || msg.includes('exceeded') || msg.includes('limit reached'))
    )

    if (isCreditsExhausted && this.disableOnAuthError) {
      state.permanentlyDisabled = true
      console.error(
        `[ServiceKeyPool:${this.name}] 🔑 Key ${keyIndex + 1} permanently disabled (credits/quota exhausted): ${errorMessage || 'No credits'}`
      )
    } else if (statusCode === 429) {
      // Rate limit — apply cooldown
      state.cooldownUntil = now + this.rateLimitCooldownMs
      console.warn(
        `[ServiceKeyPool:${this.name}] 🔑 Key ${keyIndex + 1} rate limited (429) — cooldown ${this.rateLimitCooldownMs / 1000}s`
      )
    } else if (statusCode === 401 || statusCode === 403) {
      // Auth error — permanently disable the key
      if (this.disableOnAuthError) {
        state.permanentlyDisabled = true
        console.error(
          `[ServiceKeyPool:${this.name}] 🔑 Key ${keyIndex + 1} permanently disabled (auth error ${statusCode}): ${errorMessage || 'Invalid/expired key'}`
        )
      } else {
        state.cooldownUntil = now + this.rateLimitCooldownMs
      }
    } else if (statusCode && statusCode >= 500) {
      // Server error — short cooldown
      state.cooldownUntil = now + this.serverErrorCooldownMs
      console.warn(
        `[ServiceKeyPool:${this.name}] 🔑 Key ${keyIndex + 1} server error (${statusCode}) — cooldown ${this.serverErrorCooldownMs / 1000}s`
      )
    } else {
      // Other error (network, timeout, etc.) — short cooldown
      state.cooldownUntil = now + this.serverErrorCooldownMs
      console.warn(
        `[ServiceKeyPool:${this.name}] 🔑 Key ${keyIndex + 1} error (${statusCode || 'N/A'}) — cooldown ${this.serverErrorCooldownMs / 1000}s: ${errorMessage || 'Unknown'}`
      )
    }
  }

  // ==================== STATUS & DIAGNOSTICS ====================

  /** Get the number of keys currently available (not in cooldown or disabled) */
  getAvailableCount(): number {
    const now = Date.now()
    return this.keys.filter(k => !k.permanentlyDisabled && k.enabled && k.cooldownUntil <= now).length
  }

  /** Get the total number of keys (including disabled/cooldown) */
  getTotalCount(): number {
    return this.keys.length
  }

  /** Check if the pool has any keys at all */
  hasKeys(): boolean {
    return this.keys.length > 0
  }

  /** Get detailed status of all keys (with masked key values for security) */
  getKeyStatuses(): Array<{
    index: number
    keyPreview: string
    enabled: boolean
    permanentlyDisabled: boolean
    inCooldown: boolean
    cooldownRemaining: number
    usageCount: number
    failureCount: number
    lastStatusCode: number | null
    lastErrorMessage: string | null
  }> {
    const now = Date.now()
    return this.keys.map(k => ({
      index: k.index,
      keyPreview: maskKey(k.key),
      enabled: k.enabled,
      permanentlyDisabled: k.permanentlyDisabled,
      inCooldown: k.cooldownUntil > now,
      cooldownRemaining: k.cooldownUntil > now ? Math.ceil((k.cooldownUntil - now) / 1000) : 0,
      usageCount: k.usageCount,
      failureCount: k.failureCount,
      lastStatusCode: k.lastStatusCode,
      lastErrorMessage: k.lastErrorMessage,
    }))
  }

  /** Get a summary string for logging */
  getSummary(): string {
    const available = this.getAvailableCount()
    const total = this.getTotalCount()
    const disabled = this.keys.filter(k => k.permanentlyDisabled).length
    const cooldown = this.keys.filter(k => !k.permanentlyDisabled && k.cooldownUntil > Date.now()).length
    return `[ServiceKeyPool:${this.name}] ${available}/${total} available, ${cooldown} in cooldown, ${disabled} permanently disabled`
  }
}

// ==================== HELPER: MASK API KEY ====================

/** Mask an API key for safe logging: "tvly-dev-1JX7...hVQ" */
function maskKey(key: string): string {
  if (!key) return '(empty)'
  if (key.length <= 12) return '***'
  return key.slice(0, 8) + '...' + key.slice(-3)
}

// ==================== GLOBAL POOL INSTANCES ====================
// Initialized from .env on module load. These are singletons.

/**
 * Tavily Key Pool — 4 keys for deep web search
 * Rate limit: ~1000 requests/month per key
 */
export const tavilyKeyPool = new ServiceKeyPool({
  name: 'Tavily',
  keys: [
    process.env.TAVILY_API_KEY_1 || '',
    process.env.TAVILY_API_KEY_2 || '',
    process.env.TAVILY_API_KEY_3 || '',
    process.env.TAVILY_API_KEY_4 || '',
  ],
  rateLimitCooldownMs: 60000,   // 1 min cooldown on 429
  serverErrorCooldownMs: 30000, // 30s cooldown on 5xx
  disableOnAuthError: true,     // Permanently disable bad keys
})

/**
 * Jina Key Pool — 3 unique keys for web page reading
 * Rate limit: Varies by plan
 */
export const jinaKeyPool = new ServiceKeyPool({
  name: 'Jina',
  keys: [
    process.env.JINA_API_KEY_1 || '',
    process.env.JINA_API_KEY_2 || '',
    process.env.JINA_API_KEY_3 || '',
  ].filter(k => k.length > 0), // Filter empty since we may have fewer than 3 keys
  rateLimitCooldownMs: 60000,
  serverErrorCooldownMs: 30000,
  disableOnAuthError: true,
})

/**
 * Serper Key Pool — 4 keys for Google Search API
 * Rate limit: 25,000 searches/month per key
 */
export const serperKeyPool = new ServiceKeyPool({
  name: 'Serper',
  keys: [
    process.env.SERPER_API_KEY_1 || '',
    process.env.SERPER_API_KEY_2 || '',
    process.env.SERPER_API_KEY_3 || '',
    process.env.SERPER_API_KEY_4 || '',
  ],
  rateLimitCooldownMs: 60000,
  serverErrorCooldownMs: 30000,
  disableOnAuthError: true,
})

// Log pool status on startup
console.log(`[ServiceKeyPool] Tavily: ${tavilyKeyPool.getAvailableCount()}/${tavilyKeyPool.getTotalCount()} keys`)
console.log(`[ServiceKeyPool] Jina: ${jinaKeyPool.getAvailableCount()}/${jinaKeyPool.getTotalCount()} keys`)
console.log(`[ServiceKeyPool] Serper: ${serperKeyPool.getAvailableCount()}/${serperKeyPool.getTotalCount()} keys`)
