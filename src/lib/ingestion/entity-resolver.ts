/**
 * Entity Resolver - Entity resolution and deduplication
 * 
 * Step 1: Exact match (case-insensitive, trim whitespace) → merge immediately
 * Step 2: Fuzzy match using Levenshtein distance (threshold: similarity > 0.85) → merge
 * Step 3: LLM-based match for ambiguous cases (optional, high cost)
 * 
 * Merge strategy: combine properties (union), max confidence score, increment occurrence_count
 */

import type { DocumentDomain } from './pdf-parser'

// ==================== INPUT TYPE ====================

/** Entity extracted by LLM — input to the resolution pipeline.
 *  Mirrors the ExtractedEntity interface from process/route.ts for standalone use. */
export interface ExtractedEntity {
  name: string
  type: string
  description: string
  properties: Record<string, string | number | boolean>
  confidenceScore: number
  source: string
  domain: DocumentDomain
}

// ==================== TYPES ====================

export interface ResolvedEntity {
  id?: string
  canonicalName: string
  entityType: string
  description: string
  properties: Record<string, string | number | boolean>
  avgConfidence: number
  occurrenceCount: number
  domains: DocumentDomain[]
  sourceNames: string[] // All names that were merged into this entity
}

export interface DuplicatePair {
  merged: string
  into: string
  method: 'exact' | 'fuzzy' | 'llm'
  similarity: number
}

export interface ResolutionResult {
  resolved: ResolvedEntity[]
  duplicates: DuplicatePair[]
  stats: {
    totalInput: number
    afterExactMatch: number
    afterFuzzyMatch: number
    finalCount: number
  }
}

// ==================== LEVENSHTEIN DISTANCE ====================

/**
 * Calculate Levenshtein distance between two strings
 * Simple implementation without external dependencies
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Create a matrix of size (m+1) x (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}

/**
 * Calculate similarity ratio between two strings (0 to 1)
 */
function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0
  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLen
}

// ==================== EXACT MATCH ====================

/**
 * Step 1: Exact match (case-insensitive, trim whitespace)
 */
function exactMatchResolution(entities: ExtractedEntity[]): {
  resolved: Map<string, ResolvedEntity>
  duplicates: DuplicatePair[]
} {
  const resolved = new Map<string, ResolvedEntity>()
  const duplicates: DuplicatePair[] = []
  // Map from normalized name to canonical name
  const nameToCanonical = new Map<string, string>()

  for (const entity of entities) {
    const normalizedName = entity.name.toLowerCase().trim()

    const existingCanonical = nameToCanonical.get(normalizedName)
    if (existingCanonical) {
      // Merge into existing entity
      const existing = resolved.get(existingCanonical)!
      existing.occurrenceCount++
      existing.avgConfidence = Math.max(existing.avgConfidence, entity.confidenceScore)
      existing.sourceNames.push(entity.name)
      
      // Merge properties (union)
      if (entity.properties && typeof entity.properties === 'object') {
        for (const [key, value] of Object.entries(entity.properties)) {
          if (!(key in existing.properties)) {
            existing.properties[key] = value
          }
        }
      }

      // Merge descriptions - keep the longer one
      if (entity.description && entity.description.length > existing.description.length) {
        existing.description = entity.description
      }

      // Add domain if not present
      if (!existing.domains.includes(entity.domain)) {
        existing.domains.push(entity.domain)
      }

      duplicates.push({
        merged: entity.name,
        into: existingCanonical,
        method: 'exact',
        similarity: 1.0,
      })
    } else {
      // New entity
      const canonicalName = entity.name.trim()
      const resolvedEntity: ResolvedEntity = {
        canonicalName,
        entityType: entity.type,
        description: entity.description || '',
        properties: { ...(entity.properties || {}) },
        avgConfidence: entity.confidenceScore,
        occurrenceCount: 1,
        domains: [entity.domain],
        sourceNames: [entity.name],
      }
      resolved.set(canonicalName, resolvedEntity)
      nameToCanonical.set(normalizedName, canonicalName)
    }
  }

  return { resolved, duplicates }
}

// ==================== FUZZY MATCH ====================

/**
 * Step 2: Fuzzy match using Levenshtein distance (threshold: similarity > 0.85)
 */
function fuzzyMatchResolution(
  resolved: Map<string, ResolvedEntity>,
  duplicates: DuplicatePair[],
  threshold = 0.85
): {
  resolved: Map<string, ResolvedEntity>
  duplicates: DuplicatePair[]
} {
  const entries = Array.from(resolved.entries())
  const toMerge: Array<{ source: string; target: string; similarity: number }> = []
  const processed = new Set<string>()

  // Compare all pairs
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [nameA, entityA] = entries[i]
      const [nameB, entityB] = entries[j]

      // Skip if different entity types (except RELATED_TO situations)
      if (entityA.entityType !== entityB.entityType) continue

      // Skip already processed
      if (processed.has(nameA) || processed.has(nameB)) continue

      const normalizedA = nameA.toLowerCase().trim()
      const normalizedB = nameB.toLowerCase().trim()
      const similarity = stringSimilarity(normalizedA, normalizedB)

      if (similarity > threshold) {
        // Merge shorter name into longer name (prefer more descriptive)
        const [source, target] = nameA.length >= nameB.length ? [nameB, nameA] : [nameA, nameB]
        toMerge.push({ source, target, similarity })
        processed.add(source)
      }
    }
  }

  // Perform merges
  for (const { source, target, similarity } of toMerge) {
    const sourceEntity = resolved.get(source)
    const targetEntity = resolved.get(target)

    if (sourceEntity && targetEntity) {
      // Merge source into target
      targetEntity.occurrenceCount += sourceEntity.occurrenceCount
      targetEntity.avgConfidence = Math.max(targetEntity.avgConfidence, sourceEntity.avgConfidence)
      targetEntity.sourceNames.push(...sourceEntity.sourceNames)

      // Merge properties
      for (const [key, value] of Object.entries(sourceEntity.properties)) {
        if (!(key in targetEntity.properties)) {
          targetEntity.properties[key] = value
        }
      }

      // Merge descriptions
      if (sourceEntity.description.length > targetEntity.description.length) {
        targetEntity.description = sourceEntity.description
      }

      // Merge domains
      for (const domain of sourceEntity.domains) {
        if (!targetEntity.domains.includes(domain)) {
          targetEntity.domains.push(domain)
        }
      }

      // Remove source from resolved
      resolved.delete(source)

      duplicates.push({
        merged: source,
        into: target,
        method: 'fuzzy',
        similarity,
      })
    }
  }

  return { resolved, duplicates }
}

// ==================== MAIN RESOLUTION ====================

/**
 * Resolve and deduplicate entities
 */
export function resolveEntities(entities: ExtractedEntity[]): ResolutionResult {
  const totalInput = entities.length

  // Step 1: Exact match
  const { resolved, duplicates: exactDuplicates } = exactMatchResolution(entities)
  const afterExactMatch = resolved.size

  // Step 2: Fuzzy match
  const { resolved: finalResolved, duplicates: fuzzyDuplicates } = fuzzyMatchResolution(resolved, exactDuplicates)
  const afterFuzzyMatch = finalResolved.size

  // Step 3: LLM-based match (skipped for now - high cost)
  // Could be implemented later as an optional step

  const finalEntities = Array.from(finalResolved.values())

  return {
    resolved: finalEntities,
    duplicates: [...exactDuplicates, ...fuzzyDuplicates],
    stats: {
      totalInput,
      afterExactMatch,
      afterFuzzyMatch,
      finalCount: finalEntities.length,
    },
  }
}

/**
 * Update relationship references after entity resolution
 */
export function updateRelationshipReferences(
  relationships: Array<{ source: string; target: string; [key: string]: unknown }>,
  duplicates: DuplicatePair[]
): Array<{ source: string; target: string; [key: string]: unknown }> {
  // Build mapping from merged names to canonical names
  const mergeMap = new Map<string, string>()
  for (const dup of duplicates) {
    mergeMap.set(dup.merged.toLowerCase().trim(), dup.into)
    // Also map the canonical name itself
    if (!mergeMap.has(dup.into.toLowerCase().trim())) {
      mergeMap.set(dup.into.toLowerCase().trim(), dup.into)
    }
  }

  return relationships.map((rel) => ({
    ...rel,
    source: mergeMap.get(rel.source.toLowerCase().trim()) || rel.source,
    target: mergeMap.get(rel.target.toLowerCase().trim()) || rel.target,
  }))
}
