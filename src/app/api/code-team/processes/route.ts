import { NextResponse } from 'next/server'
import { processManager } from '@/lib/execution/process-manager'
import {
  validateCommand,
  needsApproval,
} from '@/lib/security/command-validator'
import { getWorkspaceManager } from '@/lib/workspace/workspace-manager'

export const dynamic = 'force-dynamic'

/**
 * GET /api/code-team/processes
 * List all managed processes
 */
export async function GET() {
  try {
    const processes = await processManager.listProcesses()
    return NextResponse.json({ ok: true, data: processes })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * POST /api/code-team/processes
 * Start a new long-running process.
 * Body: { command: string, name: string, cwd?: string, tags?: string[], forceApproval?: boolean }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { command, name, cwd, tags, forceApproval } = body

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ ok: false, error: 'command is required' }, { status: 400 })
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
    }

    // Validate command
    const validation = validateCommand(command)
    if (!validation.valid) {
      return NextResponse.json({
        ok: false,
        error: validation.error || 'Command validation failed',
      }, { status: 400 })
    }

    // HIGH tier needs approval
    if (validation.tier && needsApproval(validation.tier) && !forceApproval) {
      return NextResponse.json({
        ok: false,
        error: `Command requires approval (tier: ${validation.tier})`,
        data: { tier: validation.tier, approvalNeeded: true },
      }, { status: 403 })
    }

    // Resolve cwd via active workspace (auto-creates default if none)
    const wm = getWorkspaceManager()
    const activeWs = await wm.getActiveWorkspace()
    let resolvedCwd = activeWs.rootPath
    if (cwd) {
      try {
        resolvedCwd = await wm.resolveInWorkspace(cwd)
      } catch (err) {
        return NextResponse.json({
          ok: false,
          error: err instanceof Error ? err.message : 'Invalid working directory',
        }, { status: 400 })
      }
    }

    const info = await processManager.startProcess({
      command: validation.sanitized,
      name,
      cwd: resolvedCwd,
      tags: tags ?? [],
    })

    return NextResponse.json({ ok: true, data: info }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * DELETE /api/code-team/processes?processId=...
 * Kill a process by id
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const processId = url.searchParams.get('processId')

    if (!processId) {
      return NextResponse.json({ ok: false, error: 'processId is required' }, { status: 400 })
    }

    const killed = await processManager.killProcess(processId)
    if (killed) {
      return NextResponse.json({ ok: true, data: { killed: true, processId } })
    }
    return NextResponse.json({
      ok: false,
      error: `Process ${processId} not found or not running`,
    }, { status: 404 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}