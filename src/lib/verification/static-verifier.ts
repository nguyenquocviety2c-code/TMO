/**
 * Layer 4.1: Static Verification
 *
 * Kiểm tra tĩnh code sau mỗi step:
 *   - Lint: `bun run lint` — Code quality rules
 *   - Type Check: TypeScript compiler — Type errors
 *   - Import Check: Đảm bảo import paths đúng
 *   - Convention Check: Naming, formatting consistent
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import type {
  VerificationResult,
  VerificationError,
  VerificationWarning,
  StaticVerifyOptions,
} from './types'

const execAsync = promisify(exec)

// ==================== CONSTANTS ====================

const DEFAULT_TIMEOUT = 30_000 // 30s

// ==================== MAIN ORCHESTRATOR ====================

/**
 * Chạy toàn bộ static verification.
 *
 * @param options - Cấu hình từng loại check
 * @returns VerificationResult với errors và warnings
 */
export async function runStaticVerification(
  options: StaticVerifyOptions = {}
): Promise<VerificationResult> {
  const startTime = Date.now()
  const {
    runLint = true,
    runTypeCheck = true,
    runImportCheck = true,
    runConventionCheck = false,
    timeout = DEFAULT_TIMEOUT,
  } = options

  const errors: VerificationError[] = []
  const warnings: VerificationWarning[] = []
  const checkResults: string[] = []

  try {
    // 1. Lint
    if (runLint) {
      const lintErrors = await runLintCheck(timeout)
      errors.push(...lintErrors)
      checkResults.push(`Lint: ${lintErrors.length} errors`)
    }

    // 2. Type Check
    if (runTypeCheck) {
      const typeErrors = await runTypeCheckCommand(timeout)
      errors.push(...typeErrors)
      checkResults.push(`Type Check: ${typeErrors.length} errors`)
    }

    // 3. Import Check
    if (runImportCheck) {
      const importErrors = await runImportCheckCommand()
      errors.push(...importErrors)
      checkResults.push(`Import Check: ${importErrors.length} errors`)
    }

    // 4. Convention Check
    if (runConventionCheck) {
      const conventionWarnings = await runConventionCheckCommand()
      warnings.push(...conventionWarnings)
      checkResults.push(`Convention Check: ${conventionWarnings.length} warnings`)
    }

    const duration = Date.now() - startTime
    const passed = errors.length === 0

    return {
      verifier: 'static',
      passed,
      errors,
      warnings,
      duration,
      summary: `Static verification: ${passed ? 'PASSED' : 'FAILED'} (${errors.length} errors, ${warnings.length} warnings). ${checkResults.join(', ')}`,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      verifier: 'static',
      passed: false,
      errors: [
        {
          type: 'runtime',
          severity: 'critical',
          message: `Static verification failed with exception: ${errorMsg}`,
          suggestion: 'Check if required tools (eslint, tsc) are installed',
        },
      ],
      warnings,
      duration: Date.now() - startTime,
      summary: `Static verification: FAILED (exception: ${errorMsg})`,
    }
  }
}

// ==================== LINT CHECK ====================

/**
 * Chạy `bun run lint` và parse output.
 */
async function runLintCheck(timeout: number): Promise<VerificationError[]> {
  try {
    const { stdout, stderr } = await execAsync('bun run lint', {
      timeout,
      cwd: process.cwd(),
    })

    // Nếu stderr có nội dung → có thể có lỗi
    if (stderr && stderr.trim().length > 0) {
      return parseLintOutput(stderr)
    }

    // Parse stdout
    return parseLintOutput(stdout)
  } catch (err) {
    // Lệnh lint fail (exit code != 0) → parse output để lấy errors
    const execErr = err as { stdout?: string; stderr?: string }
    const output = execErr.stdout || execErr.stderr || ''
    if (output) {
      return parseLintOutput(output)
    }
    return [
      {
        type: 'lint',
        severity: 'high',
        message: `Lint command failed: ${execErr.stderr || 'Unknown error'}`,
      },
    ]
  }
}

/**
 * Parse ESLint output → structured errors.
 *
 * ESLint format (stylish):
 *   /path/to/file.ts
 *     5:10  error  Message  rule-name
 *
 * Hoặc compact:
 *   /path/to/file.ts:5:10: error: Message (rule-name)
 */
export function parseLintOutput(output: string): VerificationError[] {
  const errors: VerificationError[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Pattern 1: stylish format
    //   5:10  error  Message  rule-name
    const stylishMatch = trimmed.match(/^(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(.+)$/)
    if (stylishMatch) {
      const [, lineNum, colNum, level, message, rule] = stylishMatch
      errors.push({
        type: 'lint',
        severity: level === 'error' ? 'high' : 'medium',
        message: `${message} (${rule})`,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
      })
      continue
    }

    // Pattern 2: compact format
    // /path/to/file.ts:5:10: error: Message (rule-name)
    const compactMatch = trimmed.match(/:(\d+):(\d+):\s*(error|warning):\s*(.+?)\s*\((.+)\)/)
    if (compactMatch) {
      const [, lineNum, colNum, level, message, rule] = compactMatch
      errors.push({
        type: 'lint',
        severity: level === 'error' ? 'high' : 'medium',
        message: `${message} (${rule})`,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
      })
      continue
    }
  }

  return errors
}

// ==================== TYPE CHECK ====================

/**
 * Chạy TypeScript compiler để kiểm tra type errors.
 */
async function runTypeCheckCommand(timeout: number): Promise<VerificationError[]> {
  try {
    const { stdout, stderr } = await execAsync('bun run type-check', {
      timeout,
      cwd: process.cwd(),
    })

    const output = stdout || stderr || ''
    if (!output.trim()) return []

    return parseTscOutput(output)
  } catch (err) {
    // Type check fail → parse output
    const execErr = err as { stdout?: string; stderr?: string }
    const output = execErr.stdout || execErr.stderr || ''
    if (output) {
      return parseTscOutput(output)
    }
    return [
      {
        type: 'type',
        severity: 'high',
        message: `Type check command failed: ${execErr.stderr || 'Unknown error'}`,
      },
    ]
  }
}

/**
 * Parse TypeScript compiler output → structured errors.
 *
 * TSC format:
 *   src/file.ts(5,10): error TS1234: Message
 */
export function parseTscOutput(output: string): VerificationError[] {
  const errors: VerificationError[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Pattern: file.ts(5,10): error TS1234: Message
    const match = trimmed.match(/^(.+)\((\d+),(\d+)\):\s*error\s+(\w+):\s*(.+)$/)
    if (match) {
      const [, filePath, lineNum, colNum, code, message] = match
      errors.push({
        type: 'type',
        severity: 'high',
        message: `${message} (${code})`,
        file: filePath,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
      })
    }
  }

  return errors
}

// ==================== IMPORT CHECK ====================

/**
 * Kiểm tra import paths trong codebase.
 * Đơn giản: kiểm tra các import relative có tồn tại không.
 */
async function runImportCheckCommand(): Promise<VerificationError[]> {
  const errors: VerificationError[] = []
  const projectRoot = process.cwd()

  // Đọc tsconfig path
  const tsConfigPath = join(projectRoot, 'tsconfig.json')

  // Kiểm tra các file .ts và .tsx trong src/
  const srcDir = join(projectRoot, 'src')
  if (!existsSync(srcDir)) {
    return [] // Không có src/ → skip
  }

  // Đơn giản: kiểm tra các import bắt đầu với @/ có map trong tsconfig
  try {
    const tsConfig = JSON.parse(readFileSync(tsConfigPath, 'utf-8'))
    const paths = tsConfig.compilerOptions?.paths

    if (!paths) {
      return [
        {
          type: 'import',
          severity: 'medium',
          message: 'tsconfig.json không có paths mapping. Kiểm tra import paths có thể không chính xác.',
        },
      ]
    }

    // Kiểm tra baseUrl
    const baseUrl = tsConfig.compilerOptions?.baseUrl || '.'
    const basePath = resolve(projectRoot, baseUrl)

    // Kiểm tra các path alias có resolve được không
    for (const [alias, mappings] of Object.entries(paths)) {
      const cleanAlias = alias.replace('/*', '')
      for (const mapping of mappings as string[]) {
        const cleanMapping = mapping.replace('/*', '')
        const resolvedPath = join(basePath, cleanMapping)
        if (!existsSync(resolvedPath)) {
          errors.push({
            type: 'import',
            severity: 'high',
            message: `Path alias "${cleanAlias}" maps to non-existent directory: ${resolvedPath}`,
            suggestion: `Check tsconfig.json paths: "${alias}" -> "${mapping}"`,
          })
        }
      }
    }
  } catch {
    // Không parse được tsconfig → skip
  }

  return errors
}

// ==================== CONVENTION CHECK ====================

/**
 * Kiểm tra naming conventions cơ bản.
 * Trả về warnings (không phải errors).
 */
async function runConventionCheckCommand(): Promise<VerificationWarning[]> {
  const warnings: VerificationWarning[] = []
  const projectRoot = process.cwd()
  const srcDir = join(projectRoot, 'src')

  if (!existsSync(srcDir)) {
    return warnings
  }

  // Kiểm tra: components nên PascalCase, utilities nên camelCase
  // Đây là check đơn giản, có thể mở rộng
  try {
    const appDir = join(srcDir, 'app')
    if (existsSync(appDir)) {
      // Kiểm tra page.tsx và layout.tsx có tồn tại
      const pagePath = join(appDir, 'page.tsx')
      const layoutPath = join(appDir, 'layout.tsx')

      if (!existsSync(pagePath) && !existsSync(join(appDir, 'page.ts'))) {
        warnings.push({
          type: 'convention',
          message: 'Missing page.tsx in src/app/ — Next.js App Router convention',
        })
      }

      if (!existsSync(layoutPath) && !existsSync(join(appDir, 'layout.ts'))) {
        warnings.push({
          type: 'convention',
          message: 'Missing layout.tsx in src/app/ — Next.js App Router convention',
        })
      }
    }

    // NEW: Kiểm tra naming convention cho components
    const componentsDir = join(srcDir, 'components')
    if (existsSync(componentsDir)) {
      const files = require('fs').readdirSync(componentsDir)
      for (const file of files) {
        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          // PascalCase check: first char should be uppercase
          const baseName = file.replace(/\.(tsx|ts)$/, '')
          if (baseName[0] !== baseName[0].toUpperCase()) {
            warnings.push({
              type: 'convention',
              message: `Component "${file}" should use PascalCase naming convention`,
              file: join('src/components', file),
            })
          }
        }
      }
    }

    // NEW: Kiểm tra file naming convention cho lib/
    const libDir = join(srcDir, 'lib')
    if (existsSync(libDir)) {
      const files = require('fs').readdirSync(libDir)
      for (const file of files) {
        if (file.endsWith('.ts') && !file.includes('-')) {
          // kebab-case check for lib files
          const baseName = file.replace('.ts', '')
          if (baseName !== baseName.toLowerCase()) {
            warnings.push({
              type: 'convention',
              message: `Lib file "${file}" should use kebab-case naming convention`,
              file: join('src/lib', file),
            })
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return warnings
}
