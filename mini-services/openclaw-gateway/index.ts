/**
 * OpenClaw Gateway Mini-Service
 *
 * Spawns the OpenClaw gateway process with development-friendly settings:
 *   - Port: 18789
 *   - Auth mode: none (no authentication required)
 *   - Bind mode: loopback (localhost only)
 *
 * The gateway WebSocket is available at ws://127.0.0.1:18789
 * The gateway HTTP API is available at http://127.0.0.1:18789
 *
 * Handles bun --hot module replacement gracefully by tracking the child
 * process via a PID file, avoiding duplicate gateway instances.
 */

import { spawn, ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";

const GATEWAY_PORT = 18789;
const GATEWAY_AUTH = "none";
const GATEWAY_BIND = "loopback";
const PID_FILE = resolve(__dirname, ".gateway.pid");

// ==================== MEMORY GUARD ====================
// Prevents the "spawn storm" crash-loop: when system RAM is nearly full,
// spawning another openclaw process (which itself spawns 5-10 children
// each ~350MB) would push the system into OOM and the auto-restart loop
// would compound. Instead we wait for RAM to free up before restarting.
const MEMORY_LIMIT_PERCENT = 90; // don't spawn if system RAM usage > 90%
const MEMORY_CHECK_INTERVAL_MS = 10_000; // re-check every 10s when waiting

function getSystemMemoryUsagePercent(): number {
  try {
    const fs = require("fs");
    const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
    const total = parseInt(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1] || "0", 10) * 1024;
    const available = parseInt(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] || "0", 10) * 1024;
    if (total === 0) return 0;
    return Math.round(((total - available) / total) * 100);
  } catch {
    return 0; // if we can't read, assume OK
  }
}

async function waitForMemory(): Promise<void> {
  while (true) {
    const usage = getSystemMemoryUsagePercent();
    if (usage < MEMORY_LIMIT_PERCENT) return;
    console.log(`[openclaw-gateway] System RAM at ${usage}% (limit ${MEMORY_LIMIT_PERCENT}%), waiting before restart...`);
    await new Promise(r => setTimeout(r, MEMORY_CHECK_INTERVAL_MS));
  }
}

// Resolve the openclaw binary from the parent project's node_modules
const openclawBin = resolve(__dirname, "../../node_modules/.bin/openclaw");

let gatewayProcess: ChildProcess | null = null;
let isShuttingDown = false;

/**
 * Check if a process with the given PID is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 doesn't kill, just checks existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill any existing gateway process tracked by the PID file
 */
function killExistingGateway(): void {
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (!isNaN(pid) && isProcessRunning(pid)) {
        console.log(
          `[openclaw-gateway] Stopping existing gateway (PID ${pid})...`
        );
        try {
          process.kill(pid, "SIGTERM");
          // Wait a bit for graceful shutdown
          const start = Date.now();
          while (isProcessRunning(pid) && Date.now() - start < 5000) {
            // busy wait
          }
          if (isProcessRunning(pid)) {
            console.log(
              `[openclaw-gateway] Force killing gateway (PID ${pid})...`
            );
            process.kill(pid, "SIGKILL");
          }
        } catch {
          // Process already gone
        }
      }
      unlinkSync(PID_FILE);
    } catch {
      // Ignore errors reading PID file
    }
  }
}

function startGateway(): void {
  // Kill any existing gateway from a previous run/hot-reload
  killExistingGateway();

  console.log(
    `[openclaw-gateway] Starting OpenClaw gateway on port ${GATEWAY_PORT}...`
  );
  console.log(
    `[openclaw-gateway] Auth: ${GATEWAY_AUTH}, Bind: ${GATEWAY_BIND}`
  );

  gatewayProcess = spawn(
    openclawBin,
    [
      "gateway",
      "run",
      "--port",
      String(GATEWAY_PORT),
      "--auth",
      GATEWAY_AUTH,
      "--bind",
      GATEWAY_BIND,
      "--force",
      "--compact",
      "--allow-unconfigured",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR || undefined,
      },
    }
  );

  if (gatewayProcess.pid) {
    writeFileSync(PID_FILE, String(gatewayProcess.pid));
    console.log(`[openclaw-gateway] Gateway PID: ${gatewayProcess.pid}`);
  }

  gatewayProcess.on("error", (err) => {
    console.error("[openclaw-gateway] Failed to start gateway:", err);
    cleanup();
    process.exit(1);
  });

  gatewayProcess.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`[openclaw-gateway] Gateway exited with code ${code}`);
    } else if (signal !== null) {
      console.log(`[openclaw-gateway] Gateway killed by signal ${signal}`);
    }
    cleanup();
    if (!isShuttingDown) {
      // Auto-restart after a brief delay if not intentional shutdown.
      // MEMORY GUARD: wait for RAM to free up before spawning, otherwise
      // a low-RAM crash would immediately respawn into another low-RAM
      // crash — the "spawn storm" that took down the whole app.
      console.log("[openclaw-gateway] Gateway crashed, restarting in 3s...");
      setTimeout(() => {
        if (!isShuttingDown) {
          waitForMemory().then(() => startGateway());
        }
      }, 3000);
    }
  });
}

function cleanup(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore
  }
  gatewayProcess = null;
}

function shutdown(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (gatewayProcess && !gatewayProcess.killed) {
    console.log("[openclaw-gateway] Shutting down gateway...");
    gatewayProcess.kill("SIGTERM");

    // Force kill after 5 seconds if it hasn't stopped
    setTimeout(() => {
      if (gatewayProcess && !gatewayProcess.killed) {
        console.log("[openclaw-gateway] Force killing gateway...");
        gatewayProcess.kill("SIGKILL");
      }
      cleanup();
      process.exit(0);
    }, 5000);
  } else {
    cleanup();
    process.exit(0);
  }
}

// Handle process signals for graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start the gateway
startGateway();
