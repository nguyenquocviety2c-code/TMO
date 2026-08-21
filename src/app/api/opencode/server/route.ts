import { NextResponse } from 'next/server'
import { isOpenCodeOnline, getOpenCodeInfo } from '@/lib/opencode'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { getProjectRoot } from '@/lib/paths'

export const dynamic = 'force-dynamic'

// The actual OpenCode server process runs as "bun server.ts" from the opencode-server directory
// We use PID file for reliable targeting, with pkill as fallback
const OPENCODE_PID_FILE = resolve(getProjectRoot(), 'mini-services', 'opencode-server', '.pid')
const OPENCODE_DIR = resolve(getProjectRoot(), 'mini-services', 'opencode-server')

function killOpenCodeServer(): boolean {
  // Strategy 1: Use PID file (most reliable)
  try {
    if (existsSync(OPENCODE_PID_FILE)) {
      const pid = parseInt(readFileSync(OPENCODE_PID_FILE, 'utf-8').trim())
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 'SIGTERM')
          return true
        } catch {
          // Process may have already exited
        }
      }
    }
  } catch { /* ignore */ }

  // Strategy 2: pkill with actual command pattern
  try {
    execSync('pkill -f "bun server.ts" 2>/dev/null || true', { timeout: 5000 })
    return true
  } catch { /* ignore */ }

  // Strategy 3: Kill by port
  try {
    execSync('fuser -k 18790/tcp 2>/dev/null || true', { timeout: 5000 })
    return true
  } catch { /* ignore */ }

  return false
}

/**
 * POST /api/opencode/server
 * Manage OpenCode server: restart or stop
 * Body: { action: 'restart' | 'stop' | 'start' }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body

    if (!action || !['restart', 'stop', 'start'].includes(action)) {
      return NextResponse.json({ error: 'action must be "restart", "stop", or "start"' }, { status: 400 })
    }

    const online = await isOpenCodeOnline()

    if (action === 'stop') {
      if (!online) {
        return NextResponse.json({ message: 'Server already offline', wasOnline: false })
      }
      // Kill the opencode-server process using multi-strategy helper
      try {
        killOpenCodeServer()
        // Wait briefly and verify
        await new Promise(r => setTimeout(r, 1500))
        const stillOnline = await isOpenCodeOnline()
        return NextResponse.json({
          message: stillOnline ? 'Server may still be shutting down' : 'Server stopped successfully',
          wasOnline: true,
          stopped: !stillOnline,
        })
      } catch {
        return NextResponse.json({ message: 'Failed to stop server', wasOnline: true }, { status: 500 })
      }
    }

    if (action === 'restart') {
      // Kill existing then start fresh
      try {
        if (online) {
          killOpenCodeServer()
          await new Promise(r => setTimeout(r, 1500))
        }
        // Start the server
        execSync(`cd ${OPENCODE_DIR} && nohup bun server.ts > /tmp/opencode-server.log 2>&1 &`, {
          timeout: 5000,
          stdio: 'ignore',
        })
        // Wait for startup
        await new Promise(r => setTimeout(r, 3000))
        const nowOnline = await isOpenCodeOnline()
        const serverInfo = nowOnline ? await getOpenCodeInfo() : null
        return NextResponse.json({
          message: nowOnline ? 'Server restarted successfully' : 'Server restart attempted but not yet online',
          online: nowOnline,
          serverInfo,
        })
      } catch (err) {
        return NextResponse.json({
          message: 'Failed to restart server',
          error: err instanceof Error ? err.message : 'Unknown error',
        }, { status: 500 })
      }
    }

    if (action === 'start') {
      if (online) {
        const serverInfo = await getOpenCodeInfo()
        return NextResponse.json({ message: 'Server already running', online: true, serverInfo })
      }
      try {
        execSync(`cd ${OPENCODE_DIR} && nohup bun server.ts > /tmp/opencode-server.log 2>&1 &`, {
          timeout: 5000,
          stdio: 'ignore',
        })
        await new Promise(r => setTimeout(r, 3000))
        const nowOnline = await isOpenCodeOnline()
        const serverInfo = nowOnline ? await getOpenCodeInfo() : null
        return NextResponse.json({
          message: nowOnline ? 'Server started successfully' : 'Server start attempted but not yet online',
          online: nowOnline,
          serverInfo,
        })
      } catch (err) {
        return NextResponse.json({
          message: 'Failed to start server',
          error: err instanceof Error ? err.message : 'Unknown error',
        }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({
      error: 'Server management failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
