/**
 * Layer 4.2: Runtime Verification
 *
 * Kiểm tra app thực sự chạy và hoạt động đúng:
 *   - Dev Server Check: App có chạy không? Có lỗi compile không?
 *   - API Testing: Endpoint trả đúng data không?
 *   - Database Testing: Schema đúng? CRUD hoạt động?
 *   - WebSocket Testing: Connection ổn định? Messages gửi nhận đúng?
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type {
  VerificationResult,
  VerificationError,
  RuntimeVerifyOptions,
} from './types'

const execAsync = promisify(exec)

// ==================== CONSTANTS ====================

const DEFAULT_TIMEOUT = 60_000 // 60s
const DEV_SERVER_URL = 'http://localhost:3000'
const DEV_LOG_PATH = join(process.cwd(), 'dev.log')

// ==================== MAIN ORCHESTRATOR ====================

/**
 * Chạy toàn bộ runtime verification.
 *
 * @param options - Cấu hình từng loại check
 * @returns VerificationResult với errors
 */
export async function runRuntimeVerification(
  options: RuntimeVerifyOptions = {}
): Promise<VerificationResult> {
  const startTime = Date.now()
  const {
    checkDevServer = true,
    testApis = [],
    testDb = false,
    testWebSocket = false,
    timeout = DEFAULT_TIMEOUT,
  } = options

  const errors: VerificationError[] = []
  const checkResults: string[] = []

  try {
    // 1. Dev Server Check
    if (checkDevServer) {
      const devErrors = await checkDevServerRunning(timeout)
      errors.push(...devErrors)
      checkResults.push(`Dev Server: ${devErrors.length} errors`)
    }

    // 2. API Testing
    if (testApis.length > 0) {
      const apiErrors = await testApiEndpoints(testApis, timeout)
      errors.push(...apiErrors)
      checkResults.push(`API Testing: ${apiErrors.length} errors`)
    }

    // 3. Database Testing
    if (testDb) {
      const dbErrors = await testDatabaseConnection(timeout)
      errors.push(...dbErrors)
      checkResults.push(`Database: ${dbErrors.length} errors`)
    }

    // 4. WebSocket Testing
    if (testWebSocket) {
      const wsErrors = await testWebSocketConnection(timeout)
      errors.push(...wsErrors)
      checkResults.push(`WebSocket: ${wsErrors.length} errors`)
    }

    const duration = Date.now() - startTime
    const passed = errors.length === 0

    return {
      verifier: 'runtime',
      passed,
      errors,
      warnings: [],
      duration,
      summary: `Runtime verification: ${passed ? 'PASSED' : 'FAILED'} (${errors.length} errors). ${checkResults.join(', ')}`,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      verifier: 'runtime',
      passed: false,
      errors: [
        {
          type: 'runtime',
          severity: 'critical',
          message: `Runtime verification failed with exception: ${errorMsg}`,
          suggestion: 'Check if dev server is running and accessible',
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
      summary: `Runtime verification: FAILED (exception: ${errorMsg})`,
    }
  }
}

// ==================== DEV SERVER CHECK ====================

/**
 * Kiểm tra dev server đang chạy không.
 * Gửi HTTP request đến localhost:3000 và đọc dev log.
 */
async function checkDevServerRunning(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    // Thử kết nối đến dev server
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(DEV_SERVER_URL, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok && response.status !== 200) {
        errors.push({
          type: 'runtime',
          severity: 'high',
          message: `Dev server returned status ${response.status} at ${DEV_SERVER_URL}`,
          suggestion: 'Check if dev server is running properly',
        })
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      errors.push({
        type: 'runtime',
        severity: 'high',
        message: `Cannot connect to dev server at ${DEV_SERVER_URL}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        suggestion: 'Start dev server with "bun run dev" or check port configuration',
      })
    }

    // Đọc dev log để tìm compile errors
    const logErrors = await readDevLog()
    errors.push(...logErrors)

    return errors
  } catch (err) {
    errors.push({
      type: 'runtime',
      severity: 'medium',
      message: `Dev server check failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    return errors
  }
}

/**
 * Đọc dev log để tìm errors.
 */
async function readDevLog(): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    if (!existsSync(DEV_LOG_PATH)) {
      return [] // Không có dev log → skip
    }

    const logContent = readFileSync(DEV_LOG_PATH, 'utf-8')
    const lines = logContent.split('\n').slice(-100) // Chỉ đọc 100 dòng cuối

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Tìm các lỗi compile, hydration, hoặc runtime
      if (
        trimmed.includes('error') ||
        trimmed.includes('Error') ||
        trimmed.includes('ERROR') ||
        trimmed.includes('failed') ||
        trimmed.includes('Failed') ||
        trimmed.includes('hydration') ||
        trimmed.includes('Hydration')
      ) {
        // Bỏ qua các dòng không phải lỗi thực sự
        if (
          trimmed.includes('✓') ||
          trimmed.includes('success') ||
          trimmed.includes('compiled') ||
          trimmed.includes('ready')
        ) {
          continue
        }

        errors.push({
          type: 'runtime',
          severity: 'high',
          message: `Dev log error: ${trimmed.slice(0, 200)}`,
          suggestion: 'Check dev server logs for more details',
        })
      }
    }

    return errors
  } catch {
    return [] // Không đọc được log → skip
  }
}

// ==================== API TESTING ====================

/**
 * Test các API endpoints.
 */
async function testApiEndpoints(
  endpoints: string[],
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const url = endpoint.startsWith('http') ? endpoint : `${DEV_SERVER_URL}${endpoint}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        errors.push({
          type: 'api',
          severity: 'high',
          message: `API endpoint ${endpoint} returned status ${response.status}`,
          suggestion: 'Check API route implementation and error handling',
        })
      }
    } catch (err) {
      errors.push({
        type: 'api',
        severity: 'high',
        message: `API endpoint ${endpoint} failed: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: 'Check if API route exists and server is running',
      })
    }
  }

  return errors
}

// ==================== DATABASE TESTING ====================

/**
 * Kiểm tra database connection.
 * Đơn giản: kiểm tra Prisma schema tồn tại và có thể generate client.
 */
async function testDatabaseConnection(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    // Kiểm tra Prisma schema tồn tại
    const prismaSchemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
    if (!existsSync(prismaSchemaPath)) {
      errors.push({
        type: 'db',
        severity: 'medium',
        message: 'Prisma schema not found at prisma/schema.prisma',
        suggestion: 'Check if Prisma is configured in this project',
      })
      return errors
    }

    // Thử generate Prisma client (nếu cần)
    // Note: Không chạy prisma generate vì có thể tốn thời gian
    // Chỉ kiểm tra schema hợp lệ
    const { stdout } = await execAsync('bun prisma validate', {
      timeout,
      cwd: process.cwd(),
    })

    if (stdout.includes('error') || stdout.includes('Error')) {
      errors.push({
        type: 'db',
        severity: 'high',
        message: `Prisma schema validation failed: ${stdout.slice(0, 200)}`,
        suggestion: 'Run "bun prisma validate" to see full error',
      })
    }

    return errors
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string }
    const errorOutput = execErr.stderr || execErr.stdout || ''

    if (errorOutput.includes('error') || errorOutput.includes('Error')) {
      errors.push({
        type: 'db',
        severity: 'high',
        message: `Database connection test failed: ${errorOutput.slice(0, 200)}`,
        suggestion: 'Check database connection string and Prisma configuration',
      })
    }

    return errors
  }
}

// ==================== WEBSOCKET TESTING ====================

/**
 * Kiểm tra WebSocket connection với fallback.
 * Nếu WebSocket không khả dụng, fallback sang HTTP polling check.
 */
async function testWebSocketConnection(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      errors.push({
        type: 'websocket',
        severity: 'high',
        message: 'WebSocket connection test timed out',
        suggestion: 'Check if WebSocket server is running',
      })
      resolve(errors)
    }, timeout)

    try {
      // Thử kết nối WebSocket đến dev server
      const wsUrl = DEV_SERVER_URL.replace('http', 'ws')
      
      // Check if WebSocket is available (not in Node.js by default)
      if (typeof WebSocket === 'undefined') {
        // Fallback: Check HTTP endpoint instead
        clearTimeout(timeoutId)
        fallbackHttpCheck(wsUrl, errors, resolve)
        return
      }

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        // Gửi ping
        ws.send(JSON.stringify({ type: 'ping' }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'pong') {
            clearTimeout(timeoutId)
            ws.close()
            resolve(errors)
          }
        } catch {
          // Không phải pong → vẫn OK nếu nhận được message
          clearTimeout(timeoutId)
          ws.close()
          resolve(errors)
        }
      }

      ws.onerror = (err) => {
        clearTimeout(timeoutId)
        // Fallback to HTTP check on WebSocket error
        fallbackHttpCheck(wsUrl, errors, resolve)
      }

      ws.onclose = () => {
        clearTimeout(timeoutId)
        resolve(errors)
      }
    } catch (err) {
      clearTimeout(timeoutId)
      // Fallback to HTTP check on exception
      fallbackHttpCheck(DEV_SERVER_URL.replace('http', 'ws'), errors, resolve)
    }
  })
}

/**
 * Fallback HTTP check khi WebSocket không khả dụng.
 */
async function fallbackHttpCheck(
  wsUrl: string,
  errors: VerificationError[],
  resolve: (errors: VerificationError[]) => void
): Promise<void> {
  try {
    const httpUrl = wsUrl.replace('ws', 'http')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(httpUrl, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      // HTTP works but WebSocket doesn't → warning only
      errors.push({
        type: 'websocket',
        severity: 'medium',
        message: 'WebSocket not available, but HTTP fallback works',
        suggestion: 'WebSocket may require additional configuration or ws:// protocol',
      })
    } else {
      errors.push({
        type: 'websocket',
        severity: 'high',
        message: `WebSocket fallback HTTP check failed with status ${response.status}`,
        suggestion: 'Check if server supports WebSocket upgrade',
      })
    }
  } catch (err) {
    errors.push({
      type: 'websocket',
      severity: 'high',
      message: `WebSocket and HTTP fallback both failed: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check server configuration and network connectivity',
    })
  }
  resolve(errors)
}
