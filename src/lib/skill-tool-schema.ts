/**
 * Skill Tool Schema — Validates and parses tool definitions from ClawHub skill archives
 * 
 * ClawHub skills may contain tool references that map to Gateway tools.
 * This module validates those references and maps them to executable tools.
 */

export interface SkillToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    }>
    required?: string[]
  }
}

export interface SkillToolReference {
  toolName: string
  source: 'gateway-http' | 'gateway-bridge' | 'local' | 'skill-defined'
  confidence: number  // 0-1, how confident we are this tool is available
  description?: string
}

export interface SkillToolMapping {
  slug: string
  toolReferences: SkillToolReference[]
  totalTools: number
  availableTools: number
  unavailableTools: string[]
}

// All known tool names organized by source
export const GATEWAY_HTTP_TOOLS = [
  'web_search', 'web_fetch', 'x_search', 'memory_search', 'memory_get',
  'sessions_list', 'sessions_history', 'session_status', 'sessions_yield',
  'agents_list', 'message', 'tts', 'skill_workshop', 'browser', 'canvas',
  'create_goal', 'get_goal', 'update_goal',
]

export const GATEWAY_BRIDGE_TOOLS = [
  'exec', 'read', 'write', 'edit', 'apply_patch', 'code_execution', 'process',
  'sessions_spawn', 'sessions_send', 'cron', 'heartbeat_respond', 'gateway',
  'nodes', 'update_plan', 'image', 'image_generate', 'music_generate', 'video_generate',
]

export const LOCAL_TOOLS = [
  'opencode', 'knowledge_search', 'knowledge_graph', 'knowledge_write',
  'tavily', 'serper', 'jina',
]

export const ALL_KNOWN_TOOLS = new Set([
  ...GATEWAY_HTTP_TOOLS,
  ...GATEWAY_BRIDGE_TOOLS,
  ...LOCAL_TOOLS,
])

/**
 * Validate a tool schema object
 */
export function validateToolSchema(schema: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!schema || typeof schema !== 'object') {
    return { valid: false, errors: ['Schema must be an object'] }
  }
  
  const s = schema as Record<string, unknown>
  
  if (!s.name || typeof s.name !== 'string') errors.push('Missing "name" field')
  if (!s.description || typeof s.description !== 'string') errors.push('Missing "description" field')
  if (!s.parameters || typeof s.parameters !== 'object') errors.push('Missing "parameters" field')
  else {
    const params = s.parameters as Record<string, unknown>
    if (params.type !== 'object') errors.push('parameters.type must be "object"')
    if (!params.properties || typeof params.properties !== 'object') errors.push('Missing "parameters.properties"')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Map tool names found in a skill to their source and availability
 */
export function mapSkillTools(toolNames: string[]): SkillToolMapping {
  const references: SkillToolReference[] = []
  const unavailable: string[] = []
  
  for (const name of toolNames) {
    if (GATEWAY_HTTP_TOOLS.includes(name)) {
      references.push({
        toolName: name,
        source: 'gateway-http',
        confidence: 0.9,
        description: `Gateway HTTP tool: ${name}`,
      })
    } else if (GATEWAY_BRIDGE_TOOLS.includes(name)) {
      references.push({
        toolName: name,
        source: 'gateway-bridge',
        confidence: 0.8,
        description: `Gateway Bridge tool (requires session): ${name}`,
      })
    } else if (LOCAL_TOOLS.includes(name)) {
      references.push({
        toolName: name,
        source: 'local',
        confidence: 1.0,
        description: `Local built-in tool: ${name}`,
      })
    } else if (ALL_KNOWN_TOOLS.has(name)) {
      references.push({
        toolName: name,
        source: 'gateway-http', // default
        confidence: 0.5,
        description: `Known tool: ${name}`,
      })
    } else {
      unavailable.push(name)
    }
  }
  
  return {
    slug: '',  // Will be set by caller
    toolReferences: references,
    totalTools: toolNames.length,
    availableTools: references.length,
    unavailableTools: unavailable,
  }
}

/**
 * Get tool definitions (OpenAI function calling format) for tools referenced by a skill
 */
export function getToolDefinitionsForSkill(
  toolNames: string[],
  allGatewayDefs: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return allGatewayDefs.filter(def => toolNames.includes(def.function.name))
}
