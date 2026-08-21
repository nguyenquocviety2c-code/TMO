import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { resolve, join } from 'path'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

// Track running dev processes to avoid duplicates
const runningProcesses = new Map<string, { process: ReturnType<typeof spawn>; port: number | null; startedAt: number }>()

/**
 * POST /api/opencode/preview/start
 * Auto-start dev server for the workspace project
 * Body: { root: string, command?: string, script?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { root, command, script } = body

    if (!root) {
      return NextResponse.json({ error: 'root parameter is required' }, { status: 400 })
    }

    const resolvedRoot = resolve(root)
    if (!existsSync(resolvedRoot)) {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 })
    }

    // Check if already running for this root
    const existingProcess = runningProcesses.get(resolvedRoot)
    if (existingProcess) {
      return NextResponse.json({
        status: 'already_running',
        message: 'Dev server already started for this workspace',
        pid: existingProcess.process.pid,
        startedAt: existingProcess.startedAt,
      })
    }

    // Determine the command to run
    let cmd: string
    if (command) {
      cmd = command
    } else if (script) {
      const pkgManager = existsSync(join(resolvedRoot, 'bun.lockb')) || existsSync(join(resolvedRoot, 'bun.lock'))
        ? 'bun'
        : existsSync(join(resolvedRoot, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : existsSync(join(resolvedRoot, 'yarn.lock'))
            ? 'yarn'
            : 'npm'
      cmd = `${pkgManager} run ${script}`
    } else {
      const pkgManager = existsSync(join(resolvedRoot, 'bun.lockb')) || existsSync(join(resolvedRoot, 'bun.lock'))
        ? 'bun'
        : existsSync(join(resolvedRoot, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : existsSync(join(resolvedRoot, 'yarn.lock'))
            ? 'yarn'
            : 'npm'
      cmd = `${pkgManager} run dev`
    }

    // Spawn the process
    const childProcess = spawn(cmd, [], {
      cwd: resolvedRoot,
      shell: true,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    // Detach so it keeps running after the API call
    childProcess.unref()

    const pid = childProcess.pid
    const startedAt = Date.now()

    runningProcesses.set(resolvedRoot, { process: childProcess, port: null, startedAt })

    // Clean up on process exit
    childProcess.on('exit', () => {
      runningProcesses.delete(resolvedRoot)
    })

    return NextResponse.json({
      status: 'started',
      message: `Dev server started: ${cmd}`,
      command: cmd,
      pid,
      startedAt,
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to start dev server',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * GET /api/opencode/preview/start?root=xxx
 * Check if dev server is already running for workspace
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const root = searchParams.get('root')

  if (!root) {
    return NextResponse.json({ error: 'root parameter is required' }, { status: 400 })
  }

  const resolvedRoot = resolve(root)
  const existingProcess = runningProcesses.get(resolvedRoot)

  if (existingProcess) {
    return NextResponse.json({
      running: true,
      pid: existingProcess.process.pid,
      startedAt: existingProcess.startedAt,
    })
  }

  return NextResponse.json({ running: false })
}
