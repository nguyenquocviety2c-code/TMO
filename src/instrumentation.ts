/**
 * Next.js Instrumentation Hook (Edge-safe)
 *
 * Automatically starts mini-services when the Next.js dev server starts:
 *   - openclaw-gateway (port 18789)
 *   - opencode-server (port 18790)
 *   - gateway-bridge (port 18791)
 *
 * IMPORTANT — Edge-safe pattern:
 * This file is statically analyzed by BOTH the Node and Edge bundlers. It must
 * NOT reference any Node-only API (path, process.cwd, child_process, fs) at
 * module scope or inside any function whose body the Edge bundler can see —
 * otherwise the Edge bundler emits "Ecmascript file had an error" and the
 * build can stall. All Node-only logic lives in ./instrumentation-node.ts and
 * is loaded via a dynamic import() that only runs on the Node.js runtime.
 */

export async function register() {
  // Only run on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Dynamic import keeps Node-only code out of the Edge bundle.
  await import('./instrumentation-node')
}
