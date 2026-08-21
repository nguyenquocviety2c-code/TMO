/**
 * router.ts — Intelligent Routing & Decomposition (Layer 3)
 *
 * Mục đích:
 *   - routeStep(): Phân tích sub-task và quyết định cách xử lý
 *   - Trả về RoutingDecision với decompositionPlan, routingType, confidence
 *
 * Blueprint: docs/fullstack-agent-architecture-v2.md — Layer 3
 */

import { RoutingDecision, PartDefinition } from './worklog'
import { SubTask, DecompositionPlan } from '../thinking/types'

/**
 * routeStep — Phân tích sub-task và quyết định cách xử lý
 *
 * Logic routing dựa trên:
 *   - subTask.type: frontend | backend | database | integration | config | verify
 *   - subTask.estimatedComplexity: simple | medium | complex
 *
 * Bảng quyết định:
 *   frontend    → mode A (Pure Visual), tier 1
 *   backend     → mode B, tier theo complexity (simple=1, medium=2, complex=3)
 *   database    → mode B, tier 2 (simple/medium) hoặc 3 (complex)
 *   integration → mode C (Hybrid), tier 2
 *   config      → mode B, tier 1
 *   verify      → mode B, tier 1
 *
 * @param subTask - SubTask cần phân tích
 * @returns RoutingDecision với mode, tier, score, reasoning
 */
export async function routeStep(subTask: SubTask): Promise<RoutingDecision> {
  // Determine mode and tier based on sub-task type and complexity
  const { mode, tier } = determineModeAndTier(subTask)

  // Calculate confidence score based on complexity
  const score = calculateScore(subTask.estimatedComplexity)

  // Build reasoning string
  const reasoning = buildReasoning(subTask, mode, tier)

  // Map sub-task to part definition
  const parts: PartDefinition[] = [
    {
      name: subTask.name,
      type: subTask.type === 'frontend' ? 'visual' : 'backend',
      description: subTask.description,
      dependency: subTask.dependencies,
    },
  ]

  // Build minimal decomposition plan from sub-task
  const decompositionPlan: DecompositionPlan = {
    originalTask: subTask.name,
    subTasks: [subTask],
    dependencyGraph: {
      nodes: new Map([[subTask.id, subTask]]),
      edges: [],
      topologicalOrder: [subTask.id],
      parallelGroups: [[subTask.id]],
    },
    totalEstimatedTokens: subTask.estimatedTokens,
    totalEstimatedTime: 0,
    criticalPath: [subTask.id],
    risks: subTask.risks,
  }

  return {
    mode,
    tier,
    score,
    reasoning,
    parts,
    decompositionPlan,
  }
}

/**
 * Determine mode and tier based on sub-task type and complexity
 */
function determineModeAndTier(subTask: SubTask): { mode: 'A' | 'B' | 'C'; tier: 1 | 2 | 3 } {
  switch (subTask.type) {
    case 'frontend':
      return { mode: 'A', tier: 1 }

    case 'backend':
      return { mode: 'B', tier: complexityToTier(subTask.estimatedComplexity) }

    case 'database':
      // Database simple/medium → tier 2, complex → tier 3
      return {
        mode: 'B',
        tier: subTask.estimatedComplexity === 'complex' ? 3 : 2,
      }

    case 'integration':
      return { mode: 'C', tier: 2 }

    case 'config':
    case 'verify':
      return { mode: 'B', tier: 1 }

    default:
      // Fallback for unknown types
      return { mode: 'B', tier: 1 }
  }
}

/**
 * Map complexity to tier for backend tasks
 */
function complexityToTier(complexity: 'simple' | 'medium' | 'complex'): 1 | 2 | 3 {
  switch (complexity) {
    case 'simple':
      return 1
    case 'medium':
      return 2
    case 'complex':
      return 3
  }
}

/**
 * Calculate confidence score based on complexity
 */
function calculateScore(complexity: 'simple' | 'medium' | 'complex'): number {
  switch (complexity) {
    case 'simple':
      return 0.9
    case 'medium':
      return 0.7
    case 'complex':
      return 0.5
  }
}

/**
 * Build human-readable reasoning string
 */
function buildReasoning(subTask: SubTask, mode: 'A' | 'B' | 'C', tier: 1 | 2 | 3): string {
  const modeDesc =
    mode === 'A' ? 'Pure Visual (UI only)' :
    mode === 'C' ? 'Hybrid (UI + Backend)' :
    'Pure Backend'

  const tierDesc =
    tier === 1 ? 'Simple — TL + G2-B' :
    tier === 2 ? 'Medium — TL + G1 + G2-A + G2-B' :
    'Complex — Full pipeline with G3'

  return `Sub-task "${subTask.name}" (${subTask.type}, ${subTask.estimatedComplexity}) → Mode ${mode} (${modeDesc}), Tier ${tier} (${tierDesc}). Assigned to: ${subTask.assignedAgent || 'auto'}`
}