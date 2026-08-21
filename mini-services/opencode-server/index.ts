/**
 * OpenCode Server Manager — Magnum Opus
 * 
 * Spawns the OpenCode Hono server as a child process and keeps it alive.
 * Uses stdio: 'pipe' to prevent terminal inheritance issues.
 * 
 * Port: 18790
 */

import { spawn, ChildProcess } from 'child_process'
import { resolve } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'

const PORT = 18790
const PID_FILE = resolve(__dirname, '.pid')
const SERVER_SCRIPT = resolve(__dirname, 'server.ts')

let serverProcess: ChildProcess | null = null
let isShuttingDown = false

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killExisting(): void {
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
      if (!isNaN(pid) && isProcessRunning(pid)) {
        console.log(`[opencode-manager] Stopping existing server (PID ${pid})...`)
        process.kill(pid, 'SIGTERM')
        const start = Date.now()
        while (isProcessRunning(pid) && Date.now() - start < 5000) { /* busy wait */ }
        if (isProcessRunning(pid)) {
          process.kill(pid, 'SIGKILL')
        }
      }
      unlinkSync(PID_FILE)
    } catch { /* ignore */ }
  }
}

function startServer(): void {
  killExisting()
  
  console.log(`[opencode-manager] Starting OpenCode server on port ${PORT}...`)
  
  serverProcess = spawn('bun', [SERVER_SCRIPT], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      OPENCODE_SERVER_PORT: String(PORT),
      OPENCODE_WORKSPACE: process.env.OPENCODE_WORKSPACE || '.',
    },
  })
  
  // Pipe server output to manager console
  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(data.toString().trim())
  })
  
  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[server-err] ${data.toString().trim()}`)
  })
  
  if (serverProcess.pid) {
    writeFileSync(PID_FILE, String(serverProcess.pid))
    console.log(`[opencode-manager] Server PID: ${serverProcess.pid}`)
  }
  
  serverProcess.on('error', (err) => {
    console.error('[opencode-manager] Failed to start server:', err)
    cleanup()
    if (!isShuttingDown) {
      setTimeout(() => { if (!isShuttingDown) startServer() }, 3000)
    }
  })
  
  serverProcess.on('exit', (code, signal) => {
    if (code !== null) {
      console.log(`[opencode-manager] Server exited with code ${code}`)
    } else if (signal !== null) {
      console.log(`[opencode-manager] Server killed by signal ${signal}`)
    }
    cleanup()
    if (!isShuttingDown) {
      console.log('[opencode-manager] Server crashed, restarting in 3s...')
      setTimeout(() => { if (!isShuttingDown) startServer() }, 3000)
    }
  })
}

function cleanup(): void {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE) } catch { /* ignore */ }
  serverProcess = null
}

function shutdown(): void {
  if (isShuttingDown) return
  isShuttingDown = true
  
  if (serverProcess && !serverProcess.killed) {
    console.log('[opencode-manager] Shutting down server...')
    serverProcess.kill('SIGTERM')
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL')
      }
      cleanup()
      process.exit(0)
    }, 5000)
  } else {
    cleanup()
    process.exit(0)
  }
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

startServer()
