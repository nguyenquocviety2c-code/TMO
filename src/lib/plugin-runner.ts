/**
 * Plugin Runner — Execute skill plugins in a sandboxed environment
 * 
 * When a ClawHub skill archive contains executable plugin code (.plugin.js),
 * this module loads and runs it safely with resource limits.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

export interface PluginManifest {
  name: string
  version: string
  description?: string
  tools?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
    handler: string  // function name in the plugin module
  }>
}

export interface PluginExecutionContext {
  toolName: string
  args: Record<string, unknown>
  allowedApis: string[]
  timeout: number
  maxOutputLength: number
}

export interface PluginExecutionResult {
  success: boolean
  result: unknown
  error?: string
  duration: number
  timedOut: boolean
}

interface LoadedPlugin {
  slug: string
  manifest: PluginManifest
  code: string
  loadedAt: Date
}

// In-memory registry of loaded plugins
const pluginRegistry = new Map<string, LoadedPlugin>()

/**
 * Load a plugin from the skills directory
 */
export function loadPlugin(slug: string): { loaded: boolean; manifest?: PluginManifest; error?: string } {
  const skillDir = join(process.cwd(), 'skills', slug)
  
  // Look for plugin manifest
  const manifestPath = join(skillDir, 'plugin.json')
  if (!existsSync(manifestPath)) {
    return { loaded: false, error: 'No plugin.json manifest found' }
  }
  
  try {
    const manifestRaw = readFileSync(manifestPath, 'utf-8')
    const manifest: PluginManifest = JSON.parse(manifestRaw)
    
    // Look for plugin code
    const pluginPath = join(skillDir, 'index.plugin.js')
    if (!existsSync(pluginPath)) {
      return { loaded: false, error: 'Plugin code file not found (index.plugin.js)' }
    }
    
    const code = readFileSync(pluginPath, 'utf-8')
    
    pluginRegistry.set(slug, {
      slug,
      manifest,
      code,
      loadedAt: new Date(),
    })
    
    return { loaded: true, manifest }
  } catch (err) {
    return { loaded: false, error: err instanceof Error ? err.message : 'Unknown error loading plugin' }
  }
}

/**
 * Execute a plugin tool in a sandboxed context
 */
export async function executePlugin(
  slug: string,
  context: PluginExecutionContext
): Promise<PluginExecutionResult> {
  const startTime = Date.now()
  const plugin = pluginRegistry.get(slug)
  
  if (!plugin) {
    return { success: false, result: null, error: `Plugin "${slug}" not loaded`, duration: 0, timedOut: false }
  }
  
  // Find the handler for the requested tool
  const toolDef = plugin.manifest.tools?.find(t => t.name === context.toolName)
  if (!toolDef) {
    return { success: false, result: null, error: `Tool "${context.toolName}" not found in plugin "${slug}"`, duration: Date.now() - startTime, timedOut: false }
  }
  
  try {
    // Create sandboxed execution context
    const sandbox = createSandbox(context)
    
    // Execute with timeout
    const result = await Promise.race([
      executeInSandbox(plugin.code, toolDef.handler, context.args, sandbox),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Plugin execution timed out')), context.timeout)
      ),
    ])
    
    // Truncate output if too long
    let finalResult = result
    if (typeof result === 'string' && result.length > context.maxOutputLength) {
      finalResult = result.substring(0, context.maxOutputLength) + '... [truncated]'
    }
    
    return { success: true, result: finalResult, duration: Date.now() - startTime, timedOut: false }
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out')
    return { 
      success: false, 
      result: null, 
      error: err instanceof Error ? err.message : 'Unknown execution error', 
      duration: Date.now() - startTime, 
      timedOut: isTimeout 
    }
  }
}

/**
 * Create a sandboxed environment with limited API access
 */
function createSandbox(context: PluginExecutionContext): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => console.log(`[Plugin:${context.toolName}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Plugin:${context.toolName}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[Plugin:${context.toolName}]`, ...args),
    },
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
  }
  
  // Conditionally expose fetch
  if (context.allowedApis.includes('fetch')) {
    sandbox.fetch = fetch
  }
  
  return sandbox
}

/**
 * Execute code in a sandbox context
 * Uses Function constructor for basic sandboxing
 * NOTE: For production, use VM2 or isolated-vm for stronger isolation
 */
async function executeInSandbox(
  code: string, 
  handlerName: string, 
  args: Record<string, unknown>,
  sandbox: Record<string, unknown>
): Promise<unknown> {
  // Basic sandboxed execution using Function constructor
  // This provides minimal isolation — for production, use VM2
  
  const wrappedCode = `
    ${code}
    if (typeof ${handlerName} === 'function') {
      return ${handlerName}(args, sandbox);
    } else {
      throw new Error('Handler "${handlerName}" not found in plugin');
    }
  `
  
  const sandboxKeys = Object.keys(sandbox)
  const sandboxValues = Object.values(sandbox)
  
  try {
    const fn = new Function('args', 'sandbox', ...sandboxKeys, wrappedCode)
    const result = fn(args, sandbox, ...sandboxValues)
    
    // Handle async results
    if (result instanceof Promise) {
      return await result
    }
    return result
  } catch (err) {
    throw new Error(`Plugin execution error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Get all loaded plugins
 */
export function getLoadedPlugins(): Array<{ slug: string; manifest: PluginManifest; loadedAt: Date }> {
  return Array.from(pluginRegistry.values()).map(p => ({
    slug: p.slug,
    manifest: p.manifest,
    loadedAt: p.loadedAt,
  }))
}

/**
 * Unload a plugin
 */
export function unloadPlugin(slug: string): boolean {
  return pluginRegistry.delete(slug)
}

/**
 * Scan skills directory for plugins and load them all
 */
export async function loadAllPlugins(): Promise<{ loaded: number; failed: number; results: Array<{ slug: string; loaded: boolean; error?: string }> }> {
  const skillsDir = join(process.cwd(), 'skills')
  
  if (!existsSync(skillsDir)) {
    return { loaded: 0, failed: 0, results: [] }
  }
  
  const results: Array<{ slug: string; loaded: boolean; error?: string }> = []
  let loaded = 0
  let failed = 0
  
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  
  for (const slug of dirs) {
    const result = loadPlugin(slug)
    results.push({ slug, loaded: result.loaded, error: result.error })
    if (result.loaded) loaded++
    else failed++
  }
  
  return { loaded, failed, results }
}
