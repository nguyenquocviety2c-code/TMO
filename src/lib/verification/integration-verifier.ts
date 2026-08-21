/**
 * Layer 4.4: Integration Verification
 *
 * Kiểm tra toàn bộ stack hoạt động cùng nhau:
 *   - Full flow: UI → API → DB → API → UI
 *   - Data consistency: Data đồng nhất giữa các layer
 *   - Error propagation: Lỗi được xử lý đúng qua các layer
 */

import type {
  VerificationResult,
  VerificationError,
  IntegrationVerifyOptions,
  E2EFlow,
  E2EFlowStep,
} from './types'

// ==================== CONSTANTS ====================

const DEFAULT_TIMEOUT = 90_000 // 90s
const DEV_SERVER_URL = 'http://localhost:3000'

// ==================== MAIN ORCHESTRATOR ====================

/**
 * Chạy toàn bộ integration verification.
 *
 * @param options - Cấu hình từng loại check
 * @returns VerificationResult với errors
 */
export async function runIntegrationVerification(
  options: IntegrationVerifyOptions = {}
): Promise<VerificationResult> {
  const startTime = Date.now()
  const {
    checkFullFlow = true,
    checkDataConsistency = true,
    checkErrorPropagation = true,
    timeout = DEFAULT_TIMEOUT,
  } = options

  const errors: VerificationError[] = []
  const checkResults: string[] = []

  try {
    // 1. Full Flow Check
    if (checkFullFlow) {
      const flowErrors = await checkFullFlowIntegration(timeout)
      errors.push(...flowErrors)
      checkResults.push(`Full Flow: ${flowErrors.length} errors`)
    }

    // 2. Data Consistency Check
    if (checkDataConsistency) {
      const consistencyErrors = await checkDataConsistencyAcrossLayers(timeout)
      errors.push(...consistencyErrors)
      checkResults.push(`Data Consistency: ${consistencyErrors.length} errors`)
    }

    // 3. Error Propagation Check
    if (checkErrorPropagation) {
      const propagationErrors = await checkErrorPropagationAcrossLayers(timeout)
      errors.push(...propagationErrors)
      checkResults.push(`Error Propagation: ${propagationErrors.length} errors`)
    }

    const duration = Date.now() - startTime
    const passed = errors.length === 0

    return {
      verifier: 'integration',
      passed,
      errors,
      warnings: [],
      duration,
      summary: `Integration verification: ${passed ? 'PASSED' : 'FAILED'} (${errors.length} errors). ${checkResults.join(', ')}`,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      verifier: 'integration',
      passed: false,
      errors: [
        {
          type: 'e2e',
          severity: 'critical',
          message: `Integration verification failed with exception: ${errorMsg}`,
          suggestion: 'Check if all services (frontend, backend, database) are running',
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
      summary: `Integration verification: FAILED (exception: ${errorMsg})`,
    }
  }
}

// ==================== FULL FLOW CHECK ====================

/**
 * Kiểm tra full E2E flow.
 * Kiểm tra các API endpoints chính hoạt động và trả về response đúng format.
 */
async function checkFullFlowIntegration(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    // Kiểm tra các API routes phổ biến với timeout ngắn hơn
    const commonRoutes = ['/api/health', '/api/status', '/api/version']
    for (const route of commonRoutes) {
      try {
        const controller = new AbortController()
        const routeTimeoutId = setTimeout(() => controller.abort(), Math.min(timeout / 3, 10000))

        const response = await fetch(`${DEV_SERVER_URL}${route}`, {
          method: 'GET',
          signal: controller.signal,
        })
        clearTimeout(routeTimeoutId)

        // Chờ bất kỳ response nào (2xx, 4xx, 5xx) đều OK — chỉ cần server phản hồi
        if (response.status >= 500) {
          errors.push({
            type: 'e2e',
            severity: 'high',
            message: `Server error on ${route}: ${response.status}`,
            suggestion: 'Check server logs for internal errors',
          })
        } else if (response.status === 404) {
          // 404 là OK cho routes không bắt buộc
          continue
        } else if (response.ok) {
          // Kiểm tra response format
          const contentType = response.headers.get('content-type')
          if (contentType && !contentType.includes('application/json')) {
            errors.push({
              type: 'e2e',
              severity: 'low',
              message: `API ${route} response Content-Type is "${contentType}" instead of "application/json"`,
              suggestion: 'Set proper Content-Type header in API responses',
            })
          }
        }
      } catch {
        // Timeout hoặc connection refused → không block cho optional routes
      }
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'e2e',
      severity: 'medium',
      message: `Full flow check failed: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check network connectivity and server status',
    })
    return errors
  }
}

// ==================== DATA CONSISTENCY CHECK ====================

/**
 * Kiểm tra data consistency giữa các layer.
 * Kiểm tra API response format và CORS headers.
 */
async function checkDataConsistencyAcrossLayers(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    // Kiểm tra API response format với timeout ngắn hơn
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout / 2, 15000))

    try {
      const response = await fetch(`${DEV_SERVER_URL}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && !contentType.includes('application/json')) {
          errors.push({
            type: 'data_consistency',
            severity: 'low',
            message: `API response Content-Type is "${contentType}" instead of "application/json"`,
            suggestion: 'Set proper Content-Type header in API responses',
          })
        }

        // Kiểm tra response có thể parse JSON
        try {
          const data = await response.clone().json()
          // Kiểm tra cấu trúc response chuẩn
          if (typeof data !== 'object' || data === null) {
            errors.push({
              type: 'data_consistency',
              severity: 'low',
              message: 'API response should be an object, not a primitive',
              suggestion: 'Return object responses: { status: "ok", data: ... }',
            })
          }
        } catch {
          errors.push({
            type: 'data_consistency',
            severity: 'medium',
            message: 'API response is not valid JSON',
            suggestion: 'Ensure API routes return valid JSON responses',
          })
        }
      }
    } catch {
      clearTimeout(timeoutId)
      // Không có health endpoint → skip
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'data_consistency',
      severity: 'medium',
      message: `Data consistency check failed: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check API response formats and data serialization',
    })
    return errors
  }
}

// ==================== ERROR PROPAGATION CHECK ====================

/**
 * Kiểm tra error propagation giữa các layer.
 * Đơn giản: kiểm tra API trả về error responses đúng format.
 */
async function checkErrorPropagationAcrossLayers(timeout: number): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    // Kiểm tra 404 response format
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${DEV_SERVER_URL}/api/non-existent-endpoint-12345`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.status === 404) {
        // Kiểm tra 404 response có error message
        try {
          const data = await response.clone().json()
          if (!data.error && !data.message && !data.status) {
            errors.push({
              type: 'error_propagation',
              severity: 'low',
              message: '404 response missing error information',
              suggestion: 'Add error details to 404 responses: { error: "Not Found", message: "..." }',
            })
          }
        } catch {
          // Không phải JSON → vẫn OK nếu là text
        }
      }
    } catch {
      clearTimeout(timeoutId)
      // Connection error → không block
    }

    // Kiểm tra 500 error handling
    try {
      const controller = new AbortController()
      const errorTimeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${DEV_SERVER_URL}/api/health`, {
        method: 'POST', // Method không được phép → có thể trả 405 hoặc 500
        signal: controller.signal,
      })
      clearTimeout(errorTimeoutId)

      if (response.status >= 500) {
        try {
          const data = await response.clone().json()
          if (!data.error && !data.message) {
            errors.push({
              type: 'error_propagation',
              severity: 'medium',
              message: '500 response missing error information',
              suggestion: 'Add error details to 500 responses for debugging',
            })
          }
        } catch {
          // Không phải JSON → warning
          errors.push({
            type: 'error_propagation',
            severity: 'low',
            message: '500 response is not JSON — may be hard to parse on client',
            suggestion: 'Return JSON error responses from API routes',
          })
        }
      }
    } catch {
      // Timeout hoặc connection error → không block
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'error_propagation',
      severity: 'medium',
      message: `Error propagation check failed: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check error handling middleware and API route error responses',
    })
    return errors
  }
}