/**
 * Agent Seed — Code Team System
 *
 * Seeds 5 Code Team agents on startup.
 * Agents are hardcoded — clone GitHub → run local → Code Team always available.
 *
 * Re-enabled for Code Team workflow (Phase 1).
 * Only seeds Code Team (5 agents). No Research Team.
 */

// Re-export from code-team module for backward compatibility
// The actual seed logic is in src/lib/code-team/agents.ts
export { ensureCodeTeamAgents as ensureSystemAgents } from './code-team/agents'
export { forceReseedCodeTeam as forceReseedSystemAgents } from './code-team/agents'

// Legacy: kept for type compatibility with agents API
export interface SeedResult {
  updated: number
  created: number
}

// Legacy definitions — kept for reference but NOT used for seeding
// Research team agents are NOT seeded automatically

export interface SystemAgentDef {
  name: string
  description: string
  instruction: string
  domain: string
  capable: string
  provider: string
  model: string
  temperature: number
  maxTokens: number
  team: string
  position: string
  avatar: string
}

export const TEAM_CODE_AGENTS: SystemAgentDef[] = []
export const TEAM_RESEARCH_AGENTS: SystemAgentDef[] = []
export const ALL_SYSTEM_AGENTS: SystemAgentDef[] = []
