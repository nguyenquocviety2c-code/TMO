# Technical Blueprint — Fix AI Agent Platform Issues

> Dựa trên: `docs/ISSUES_REPORT.md`  
> Mục tiêu: Khắc phục toàn bộ lỗi CRITICAL, HIGH và cải thiện kiến trúc.

---

## 1. KIẾN TRÚC FILE

### 1.1 File cần CHỈNH SỬA (MODIFY)

| STT | File | Lý do |
|-----|------|-------|
| 1 | `src/app/api/opencode/execute/route.ts` | Fix command injection qua `cwd` và `command`, thay `execSync` bằng `execAsync` |
| 2 | `src/app/api/openclaw/bridge/route.ts` | Thêm auth check + zod validate `args` + rate limiting |
| 3 | `src/lib/code-team/tool-executor.ts` | Fix shell metacharacter regex, cập nhật whitelist, hợp nhất dual path |
| 4 | `src/lib/code-team/workflow-engine.ts` | Fix `parseToolCallsFromOutput` thiếu tool names, cache mentalModel |
| 5 | `src/lib/llm.ts` | Thêm native function calling support cho `callLLMForAgent()` |
| 6 | `src/lib/custom-tool-registry.ts` | Chặn fs/child_process import trong sandbox |
| 7 | `src/app/api/opencode/mcp/route.ts` | Implement MCP protocol server thực sự |

### 1.2 File cần TẠO MỚI (CREATE)

| STT | File | Mục đích |
|-----|------|----------|
| 1 | `src/lib/security/command-validator.ts` | Module tập trung validate command (whitelist, regex, path traversal) |
| 2 | `src/lib/security/path-guard.ts` | Path traversal protection reusable |
| 3 | `src/lib/browser/local-browser.ts` | Local Playwright fallback khi Gateway Bridge down |
| 4 | `src/lib/mcp/mcp-server.ts` | MCP protocol implementation (tool-list, tool-invoke) |
| 5 | `src/lib/mcp/mcp-types.ts` | Type definitions cho MCP protocol |
| 6 | `src/tests/security/command-validator.test.ts` | Unit tests cho command validation |
| 7 | `src/tests/browser/local-browser.test.ts` | Unit tests cho local browser fallback |

### 1.3 File cần XÓA hoặc DEPRECATED (DELETE/DEPRECATED)

| STT | File/Danh mục | Hành động |
|-----|---------------|-----------|
| 1 | `opencode` action:write trong tool-executor | Deprecate dần, chuyển sang `file_write` |
| 2 | `opencode` action:read trong tool-executor | Deprecate dần, chuyển sang `file_read` |

---

## 2. GIẢI THUẬT & STATE

### 2.1 Module `command-validator.ts` (Mới)

```typescript
// src/lib/security/command-validator.ts
export function validateCommand(command: string): { valid: boolean; error?: string }
export function validateCwd(cwd: string): { valid: boolean; resolvedPath?: string; error?: string }
export function sanitizeCommand(command: string): string
export const ALLOWED_COMMANDS: string[] // Whitelist
export const BLOCKED_PATTERNS: RegExp[] // Regex chặn shell injection
```

**State:** Không lưu state, pure functions.  
**Giải thuật:**
1. `validateCommand`: Check against whitelist → Check blocked patterns (thêm `\n`, `<`, `\r`) → Return result
2. `validateCwd`: `path.resolve()` + `startsWith(process.cwd())` → Return resolved path hoặc error
3. `sanitizeCommand`: Thay thế blocked characters bằng empty string

### 2.2 Module `path-guard.ts` (Mới)

```typescript
// src/lib/security/path-guard.ts
export function isPathWithinProject(filePath: string): boolean
export function resolveProjectPath(filePath: string): string
```

**State:** Không lưu state.  
**Giải thuật:** Dùng `path.resolve()` + `startsWith()` để đảm bảo file nằm trong project root.

### 2.3 Sửa `opencode/execute/route.ts`

```typescript
// POST handler
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { command, sessionId, cwd } = body
  
  // NÊN: Validate input đầu tiên
  const commandValidation = validateCommand(command)
  if (!commandValidation.valid) return errorResponse(...)
  
  const cwdValidation = validateCwd(cwd)
  if (!cwdValidation.valid) return errorResponse(...)
  
  // Thay execSync bằng execAsync (promisified exec)
  const { execAsync } = await import('child_process')
  const result = await execAsync(command, { cwd: cwdValidation.resolvedPath })
  
  // Return kết quả
}
```

**State:** Không lưu state, chỉ validate + execute.  
**Giải thuật:** Validate input → Execute async → Return result.

### 2.4 Sửa `openclaw/bridge/route.ts`

```typescript
// GET + POST handlers
// Thêm: import { getServerSession } from 'next-auth'
// Thêm: import { z } from 'zod'

const invokeSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
})

export async function POST(req: NextRequest) {
  // 1. Auth check
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  
  // 2. Rate limiting (in-memory đơn giản hoặc redis)
  // ...
  
  // 3. Validate args
  const body = await req.json()
  const parsed = invokeSchema.parse(body)
  
  // 4. Proxy to bridge
  // ...
}
```

**State:** Rate limiter (in-memory Map: userId → timestamp[]).  
**Giải thuật:** Auth → Rate limit → Validate → Proxy.

### 2.5 Sửa `tool-executor.ts`

```typescript
// Shell metacharacter regex mở rộng:
const SHELL_METACHARACTERS = /[;|&`$><\n\r]/

// Whitelist mở rộng:
const ALLOWED_PREFIXES = [
  'npm run', 'npm test', 'npm lint', '_td(',
  'bun run', 'tsc', 'eslint', 'echo', 'ls', 'wc',
  'rg', 'which', 'pwd', 'prisma', 'git status',
  'git diff', 'git log', 'node -p', 'python -c',
  'curl -s', 'docker ps', 'pnpm', 'npx', 'yarn',
]

// parseToolCallsFromOutput pattern 2 mở rộng:
const validToolNames = [
  'opencode', 'knowledge_search', 'knowledge_graph',
  'knowledge_write', 'tavily', 'serper', 'jina',
  'file_read', 'file_write', 'file_edit', 'file_multi_edit',
  'verify_static', 'verify_runtime', 'verify_visual',
  'verify_integration', 'browser',
]
```

### 2.6 Module `local-browser.ts` (Mới)

```typescript
// src/lib/browser/local-browser.ts
import { chromium, Browser, Page } from 'playwright'

let browser: Browser | null = null

export async function getLocalBrowser(): Promise<Browser>
export async function navigate(url: string): Promise<Page>
export async function click(page: Page, selector: string): Promise<void>
export async function type(page: Page, selector: string, text: string): Promise<void>
export async function screenshot(page: Page): Promise<Buffer>
export async function scroll(page: Page, direction: 'up' | 'down'): Promise<void>
export async function closeBrowser(): Promise<void>

// Fallback logic trong tool-executor.ts:
//   if (bridgeDown) return executeLocalBrowserAction()
```

**State:** Singleton browser instance (lazy init, reuse).  
**Giải thuật:** Initialize lazily → Expose actions → Cache page per session.

### 2.7 Module `mcp-server.ts` (Mới)

```typescript
// src/lib/mcp/mcp-server.ts
export interface MCPTool {
  name: string
  description: string
  parameters: z.ZodSchema
  execute: (args: unknown) => Promise<unknown>
}

export async function listTools(): Promise<MCPTool[]>
export async function invokeTool(name: string, args: unknown): Promise<unknown>
export async function registerTool(tool: MCPTool): Promise<void>
```

**State:** In-memory tool registry (`Map<string, MCPTool>`).  
**Giải thuật:** Register → Validate args với zod → Execute → Return.

### 2.8 Sửa `workflow-engine.ts` — `callLLMForAgent`

```typescript
// Cập nhật callLLMForAgent để hỗ trợ native function calling
export interface LLMFunctionCall {
  name: string
  arguments: Record<string, unknown>
}

export async function callLLMForAgent(
  prompt: string,
  options: LLMOptions,
  tools?: ToolDefinition[]
): Promise<LLMResult> {
  // Nếu tools được truyền → use native function calling API
  // Nếu không → fallback về text parsing (backward compatible)
}
```

**State:** Không lưu state trong hàm.  
**Giải thuật:** Check xem provider có support function calling → Nếu có, gọi API với `tools` parameter → Parse `tool_calls` từ response.

---

## 3. TEST PLAN

### 3.1 Unit Tests (Jest/Vitest)

| Mô-đun | Test Case | Input | Expected Output |
|--------|-----------|-------|-----------------|
| `command-validator` | Whitelist pass | `npm run build` | `{ valid: true }` |
| `command-validator` | Whitelist fail | `rm -rf /` | `{ valid: false }` |
| `command-validator` | Newline bypass | `npm run build\nrm -rf /` | `{ valid: false }` |
| `command-validator` | Input redirect | `cat < /etc/passwd` | `{ valid: false }` |
| `path-guard` | Path within project | `src/lib/test.ts` | `{ valid: true }` |
| `path-guard` | Path traversal | `../../../etc/passwd` | `{ valid: false }` |
| `local-browser` | Navigate + screenshot | `http://localhost:3000` | Buffer (screenshot) |
| `local-browser` | Click + type | Selector, text | No error |

### 3.2 Integration Tests

| Test | Setup | Kiểm tra |
|------|-------|----------|
| Bridge auth rejected | Request không có session | 401 Unauthorized |
| Bridge rate limit | 100 requests / 1 min | 429 Too Many Requests |
| Bridge args validation | `args` không phải object | 400 Bad Request |
| Command execution | `POST /api/opencode/execute` với `command: 'ls'` | Output chứa file list |
| Command injection blocked | `command: 'ls; rm -rf /'` | Error + không execute |
| MCP tool list | `GET /api/opencode/mcp` | JSON list tools |
| MCP tool invoke | `POST .../invoke` với valid args | Tool result |
| Workflow tool parsing | Agent emit `file_write()` | Parser nhận diện được |

### 3.3 E2E Tests

| Test | Flow |
|------|------|
| Full workflow | User request → TL analyze → G1 design → G2-A code → G2-B review → TL verify |
| Bridge down fallback | Stop Bridge service → Browser tool vẫn work qua Playwright fallback |
| Pause & resume | Workflow pause → User clarification → Resume từ điểm pause |

---

## 4. PHÂN RÃ TASK (Task Decomposition)

> Mỗi task đủ nhỏ để Act Mode hoàn thành trong 1 pass.  
> **QUY TẮC:** Task N+1 chỉ bắt đầu sau khi Task N pass gate check (lint+typecheck).

### Task 1: Security — Command Validation Module
**File cần:** Tạo `src/lib/security/command-validator.ts`  
**Phụ thuộc:** Không có  
**Mô tả:**
- Xây dựng `validateCommand()`, `validateCwd()`, `sanitizeCommand()`
- Whitelist ~20 prefixes
- Regex chặn: `;`, `|`, `&&`, `||`, `$(`, `${`, `>`, `>>`, `<`, `\n`, `\r`
- Unit tests đầy đủ

**Gate check:**
- `bun run lint` → 0 errors
- `bun test src/tests/security/command-validator.test.ts` → all pass

---

### Task 2: Security — Fix `/api/opencode/execute` Command Injection
**File cần:** Sửa `src/app/api/opencode/execute/route.ts`  
** phụ thuộc:** Task 1 (command-validator)  
**Mô tả:**
- Import `validateCommand`, `validateCwd`
- Thêm `validateCommand()` trước khi chạy command
- Validate `cwd` bằng `validateCwd()`
- Thay `execSync()` bằng `execAsync()` (promisified)
- Giữ backward compatibility với OpenCode server

**Gate check:**
- `bun run lint` → 0 errors
- Test API với curl:
  - `curl -X POST .../execute -d '{"command":"ls"}'` → 200 + output
  - `curl -X POST .../execute -d '{"command":"rm -rf /"}'` → 400 error

---

### Task 3: Security — Fix `/api/openclaw/bridge` Auth + Validation + Rate Limit
**File cần:** Sửa `src/app/api/openclaw/bridge/route.ts`  
**phụ thuộc:** Không có (độc lập)  
**Mô tả:**
- Thêm `getServerSession(authOptions)` check → 401 nếu chưa login
- Thêm zod schema cho `{ name, args }`
- Thêm in-memory rate limiter (Map: userId → timestamps[])
- Test với curl (auth fail, rate limit hit, valid invoke)

**Gate check:**
- `bun run lint` → 0 errors
- Test API routes với curl → đúng status code

---

### Task 4: Tool Executor — Fix Shell Regex + Whitelist + parseToolCallsFromOutput
**File cần:** Sửa `src/lib/code-team/tool-executor.ts`  
**phụ thuộc:** Không có (đ modular change)  
**Mô tả:**
- Update `SHELL_METACHARACTERS` regex: thêm `\n`, `<`, `\r`
- Update `ALLOWED_PREFIXES`: thêm `node -p`, `python -c`, `curl -s`, `docker ps`, `pnpm`, `npx`, `yarn`
- Update `parseToolCallsFromOutput()` Pattern 2: thêm `file_read`, `file_write`, `file_edit`, `file_multi_edit`, `verify_*`

**Gate check:**
- `bun run lint` → 0 errors
- `tsc --noEmit` → 0 type errors

---

### Task 5: Browser Fallback — Local Playwright Browser
**File cần:** Tạo `src/lib/browser/local-browser.ts`  
**phụ thuộc:** Không có (độc lập)  
**Mô tả:**
- Singleton Playwright browser (lazy init)
- Implement: `navigate()`, `click()`, `type()`, `screenshot()`, `scroll()`, `closeBrowser()`
- Thêm logic fallback trong `tool-executor.ts`: nếu Bridge fail → `executeLocalBrowserAction()`

**Gate check:**
- `bun run lint` → 0 errors
- (Optional) Test nếu Playwright đã install

---

### Task 6: MCP Protocol Implementation
**File cần:** Sửa `src/app/api/opencode/mcp/route.ts`, tạo `src/lib/mcp/mcp-server.ts`, `src/lib/mcp/mcp-types.ts`  
**phụ thuộc:** Không có  
**Mô tả:**
- `src/lib/mcp/mcp-types.ts`: Interface `MCPTool`, `MCPRequest`, `MCPResponse`
- `src/lib/mcp/mcp-server.ts`: Register, list, invoke tools với zod validation
- `src/app/api/opencode/mcp/route.ts`: Expose GET (list) và POST (invoke)

**Gate check:**
- `bun run lint` → 0 errors
- Test API với curl → list tools + invoke sample tool

---

### Task 7: Custom Tool Sandbox — Block FS Access
**File cần:** Sửa `src/lib/custom-tool-registry.ts`  
**phụ thuộc:** Không có  
**Mô tả:**
- Trước khi `require()` trong sandbox: blacklist modules `fs`, `child_process`, `path`, `os`
- Thêm try/catch nếu require thất bại
- Test custom tool không thể đọc file

**Gate check:**
- `bun run lint` → 0 errors

---

### Task 8: Workflow Engine — Cache mentalModel + Fix parseToolCalls
**File cần:** Sửa `src/lib/code-team/workflow-engine.ts`  
**phụ thuộc:** Task 4 (parseToolCallsFromOutput update)  
**Mô tả:**
- Cập nhật `parseToolCallsFromOutput()` để match đủ tools (đã làm ở Task 4)
- Cache `mentalModel` từ Layer 1 → reuse trong Layer 2 (thêm `ctx.mentalModelCache`)
- (Optional) Persist `pausedWorkflows` vào SQLite DB thay vì in-memory Map

**Gate check:**
- `bun run lint` → 0 errors
- `tsc --noEmit` → 0 type errors

---

### Task 9: LLM — Native Function Calling Support
**File cần:** Sửa `src/lib/llm.ts`  
**phụ thuộc:** Không có  
**Mô tả:**
- Cập nhật `callLLMForAgent()` để accept `tools?: ToolDefinition[]`
- Nếu `tools` được truyền → dùng OpenAI-compatible function calling API
- Nếu không → fallback về text parsing (backward compatible)
- Trả về `LLMResult` với `toolCalls?: LLMFunctionCall[]`

**Gate check:**
- `bun run lint` → 0 errors
- `tsc --noEmit` → 0 type errors

---

### Task 10: E2E Integration Test & Final Validation
**File cần:** Cập nhật `scripts/e2e-test.sh`, thêm test scripts  
**phụ thuộc:** Tất cả tasks trên  
**Mô tả:**
- Chạy `bun run lint` + `tsc --noEmit` → confirm 0 errors
- Chạy `bun test` → all tests pass
- Chạy `scripts/e2e-test.sh` → verify end-to-end
- Kiểm tra từng API route bằng curl
- Confirm không có regression

**Gate check:**
- Full Quality Gate pass (§9 trong .clinerules)

---

## TỔNG KẾT

| Task | Độ ưu tiên | File tạo mới | File sửa | Mô tả ngắn |
|------|-----------|--------------|----------|-----------|
| 1 | P0 | `command-validator.ts` | — | Security: Validate commands |
| 2 | P0 | — | `opencode/execute/route.ts` | Security: Fix command injection |
| 3 | P0 | — | `openclaw/bridge/route.ts` | Security: Auth + validation |
| 4 | P1 | — | `tool-executor.ts` | Fix regex + whitelist + parser |
| 5 | P1 | `local-browser.ts` | `tool-executor.ts` | Browser fallback |
| 6 | P1 | `mcp-server.ts`, `mcp-types.ts` | `opencode/mcp/route.ts` | MCP protocol |
| 7 | P1 | — | `custom-tool-registry.ts` | Sandbox FS block |
| 8 | P2 | — | `workflow-engine.ts` | Cache + parser fix |
| 9 | P2 | — | `llm.ts` | Native function calling |
| 10 | P2 | Tests | — | E2E validation |

**Nguyên tắc quan trọng:**
- Mỗi task ≤ 5 files touched
- Task N phải pass Gate Check trước khi Task N+1 bắt đầu
- Không động vào `package.json`, `tsconfig.json`, `next.config.ts` (theo .clinerules §2)