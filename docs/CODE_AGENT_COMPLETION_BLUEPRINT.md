# Technical Blueprint — Hoàn thiện Code Agent Platform

> Mục tiêu: Đưa Theopusflashlite đạt chuẩn coding agent hoàn chỉnh (như Cline / Claude Code / OpenCode)
> cho cả 2 chế độ: **Single Agent** (Omega) và **Code Team** (APEX/CORTEX/BOLT/SENTINEL/CATALYST).
>
> Tài liệu này được thiết kế để **Act Mode thực thi tuần tự từng Task** — mỗi Task liệt kê rõ
> file cần đọc (context tối thiểu), file cần tạo/sửa, và tiêu chí nghiệm thu (Acceptance Criteria).

---

## PHẦN 1 — KIẾN TRÚC FILE

### 1.1 File CHỈNH SỬA (Modified)

| # | Đường dẫn | Lý do sửa |
|---|---|---|
| M1 | `src/components/ui/resizable.tsx` | `react-resizable-panels` v4 đổi API (`PanelGroup` → `Group`, `PanelResizeHandle` → `Separator` hoặc named exports mới) |
| M2 | `src/lib/ingestion/pdf-parser.ts` | Sửa ESM import `pdf-parse` (bỏ `.default`) |
| M3 | `src/app/api/ingestion/process/route.ts` | Sửa ~40 lỗi TS: `null` vs `undefined`, `documentId` scope, `ProcessingStepRecord`, import pdf-parse |
| M4 | `src/app/api/smolab/chat/route.ts` | Khai báo type tường minh cho biến agent (đang là `null` literal → property access thành `never`) |
| M5 | `src/lib/qdrant.ts` | `vectors_count` → `points_count`/`indexed_vectors_count` theo Qdrant client mới; index signature cho payload types |
| M6 | `src/app/api/setup/qdrant/route.ts` | Đồng bộ với M5 + sửa arity `Expected 2 arguments` |
| M7 | `src/lib/llm.ts` | Fix Prisma generic types; **truyền `tools` xuyên suốt fallback path** (`callLLM → tryNvidia → tryProviderWithSlotKey`) |
| M8 | `src/lib/neo4j.ts` | Fix spread on non-object + null-check `driver` |
| M9 | `src/lib/embeddings.ts`, `src/lib/agent-memory.ts`, `src/lib/gateway-tool-registry.ts`, `src/lib/opencode-knowledge-context.ts` | Fix lỗi TS lẻ (index signature, `never[]`, optional score) |
| M10 | `mini-services/opencode-server/server.ts` | Fix Hono middleware type + thêm `bun-types` reference |
| M11 | `mini-services/gateway-bridge/index.ts` | Thêm `seq?: number` vào `WSFrame` + bun-types |
| M12 | `src/app/api/opencode/execute/route.ts` | Bỏ `execSync` → dùng ProcessManager (async spawn, streaming) |
| M13 | `src/lib/security/command-validator.ts` | Nâng cấp v2: risk-tier thay vì hard-block; cross-platform (Windows PowerShell) |
| M14 | `src/lib/execution/file-operator.ts` | Resolve path theo **active workspace** thay vì `process.cwd()`; tích hợp DiffManager (propose thay vì ghi thẳng) |
| M15 | `src/lib/code-team/tool-executor.ts` | Nối tools mới: `run_command`(ProcessManager), `propose_edit`/`apply_edit`(DiffManager), `repo_map`, `code_search`, `git_*` |
| M16 | `src/lib/code-team/workflow-engine.ts` | Nhúng: FS-checkpoint trước mỗi write-step, EventStore persist SSE, verify-fix loop sau G2/G3 |
| M17 | `src/lib/code-team/agents.ts` | Thêm tools mới vào permission từng agent; đọc model override từ DB (không hardcode cứng) |
| M18 | `src/lib/opencode.ts` | Timeout cấu hình được theo loại operation (read: 15s, exec/build: 300s) |
| M19 | `src/lib/state-management/checkpoint-manager.ts` | Liên kết workflow-checkpoint ↔ fs-checkpoint (lưu `fsCheckpointId`) |
| M20 | `prisma/schema.prisma` | Thêm models: `Workspace`, `PendingEdit`, `FsCheckpoint`, `WorkflowEventLog`, `AgentModelOverride` |
| M21 | `src/app/page.tsx` | (Phase 3) Tách dần thành components — chỉ sửa phần import/render, logic chuyển ra file mới |
| M22 | `package.json` | Thêm `@types/bun`; script `test`, `check` (`tsc --noEmit && eslint`); devDep `ts-morph` (Phase 2) |
| M23 | `src/app/api/code-team/workflow/route.ts` | Hỗ trợ `?lastSeq=` để SSE replay từ EventStore |

**Dọn dẹp:** xóa `src/lib/code-team/workflow-engine.ts.bak`, `tsc-output.txt` (thêm vào `.gitignore`).

### 1.2 File TẠO MỚI (New)

```
src/lib/workspace/
├── workspace-manager.ts        # Quản lý multi-workspace (CRUD + active workspace)
└── types.ts

src/lib/execution/
├── process-manager.ts          # Spawn async, streaming output, long-running process, kill
└── diff-manager.ts             # Propose/approve/reject edits, unified diff

src/lib/state-management/
└── fs-checkpoint.ts            # Shadow-git snapshot/restore filesystem

src/lib/context/
├── repo-map.ts                 # AST symbol tree (TS Compiler API / ts-morph)
├── code-indexer.ts             # Embedding index code → Qdrant `theopus_code_chunks`
└── types.ts

src/lib/git/
└── git-manager.ts              # Branch per task, commit per checkpoint, revert

src/lib/verification/
└── verify-fix-loop.ts          # Vòng lặp khép kín: verify → parse → fix → re-verify

src/lib/communication/
└── event-store.ts              # Persist + replay SSE events

src/app/api/workspace/route.ts              # GET/POST/PATCH workspace
src/app/api/code-team/edits/route.ts        # GET pending edits / POST approve|reject
src/app/api/code-team/checkpoints/route.ts  # GET list / POST restore
src/app/api/code-team/processes/route.ts    # GET list / POST kill (managed processes)
src/app/api/agents/model-config/route.ts    # GET/PUT model override per agent

src/components/code-team/
├── DiffReviewPanel.tsx          # Diff viewer + Approve/Reject per file
├── TerminalPanel.tsx            # Streaming terminal output (SSE)
├── WorkspaceSelector.tsx        # Chọn / thêm workspace
└── CheckpointTimeline.tsx       # Timeline checkpoint + nút Restore

# Tests
src/lib/security/__tests__/command-validator.test.ts
src/lib/execution/__tests__/diff-manager.test.ts
src/lib/execution/__tests__/process-manager.test.ts
src/lib/state-management/__tests__/fs-checkpoint.test.ts
src/lib/workspace/__tests__/workspace-manager.test.ts
src/lib/context/__tests__/repo-map.test.ts
src/lib/code-team/__tests__/worklog.test.ts
scripts/e2e-code-team.sh
```

---

## PHẦN 2 — GIẢI THUẬT & STATE

### 2.1 Database State (prisma/schema.prisma — bổ sung)

```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  rootPath  String   @unique   // đường dẫn tuyệt đối, đã validate
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model PendingEdit {
  id          String   @id @default(cuid())
  sessionId   String                    // liên kết CodeTeamSession
  filePath    String                    // relative với workspace root
  oldContent  String                    // snapshot trước edit ("" nếu file mới)
  newContent  String
  diff        String                    // unified diff (render UI)
  status      String   @default("pending") // pending|approved|rejected|applied|failed
  agentName   String                    // agent đề xuất (BOLT/SENTINEL/...)
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
  @@index([sessionId, status])
}

model FsCheckpoint {
  id          String   @id @default(cuid())
  sessionId   String
  workspaceId String
  commitHash  String                    // commit trong shadow repo
  label       String                    // vd: "before G2-B step 3"
  createdAt   DateTime @default(now())
  @@index([sessionId])
}

model WorkflowEventLog {
  id        String   @id @default(cuid())
  sessionId String
  seq       Int                          // tăng dần per session
  type      String                       // WorkflowEvent.type
  payload   String                       // JSON stringified
  createdAt DateTime @default(now())
  @@unique([sessionId, seq])
}

model AgentModelOverride {
  id        String   @id @default(cuid())
  agentName String   @unique             // APEX / CORTEX / ...
  provider  String
  model     String
  updatedAt DateTime @updatedAt
}
```

### 2.2 Runtime State (in-memory, module-level)

| State | Vị trí | Kiểu | Ghi chú |
|---|---|---|---|
| `activeWorkspaceCache` | workspace-manager | `{ ws: Workspace; ts: number } \| null` | TTL 10s, tránh query DB mỗi file-op |
| `managedProcesses` | process-manager | `Map<string, ManagedProcess>` | `{ id, pid, command, child: ChildProcess, buffer: RingBuffer, status }` |
| `seqCounters` | event-store | `Map<sessionId, number>` | Khởi tạo từ `MAX(seq)` DB khi cold start |
| `repoMapCache` | repo-map | file `.theopus/repomap.json` | Invalidate theo mtime tổng hợp |
| `approvalWaiters` | diff-manager | `Map<editId, {resolve, reject, timer}>` | Cho chế độ blocking-approval trong workflow |

### 2.3 Hàm cốt lõi & chữ ký

#### A. WorkspaceManager (`src/lib/workspace/workspace-manager.ts`)

```ts
getActiveWorkspace(): Promise<Workspace>
// Trả workspace isActive=true. Nếu chưa có → tự tạo default (process.cwd()).

setActiveWorkspace(id: string): Promise<Workspace>
// Transaction: tắt isActive cũ, bật mới, xóa cache.

addWorkspace(rootPath: string, name?: string): Promise<Workspace>
// Validate: path tồn tại + là directory + KHÔNG nằm trong danh sách cấm
// (system dirs, chính project app trừ khi user xác nhận explicit=true).

resolveInWorkspace(relPath: string): Promise<string>
// path.resolve(ws.rootPath, relPath) + guard: kết quả PHẢI startsWith(ws.rootPath).
// → THAY THẾ resolveAndValidatePath() trong file-operator.ts.
```

#### B. ProcessManager (`src/lib/execution/process-manager.ts`)

```ts
interface RunOptions {
  command: string
  cwd?: string              // default: active workspace root
  timeoutMs?: number        // default 120_000
  env?: Record<string,string>
  onChunk?: (stream: 'stdout'|'stderr', data: string) => void  // streaming → SSE
  shell?: 'auto'|'powershell'|'bash'   // 'auto': theo process.platform
}
interface ProcessResult {
  success: boolean; exitCode: number|null
  stdout: string; stderr: string
  durationMs: number; timedOut: boolean
}

runCommand(opts: RunOptions): Promise<ProcessResult>
// Giải thuật: spawn(shell, args, {cwd, env}) — KHÔNG BAO GIỜ execSync.
// - Windows: spawn('powershell.exe', ['-NoProfile','-Command', cmd])
// - Unix:    spawn('bash', ['-c', cmd])
// - Gom output vào RingBuffer (cap 1MB), forward từng chunk qua onChunk.
// - Timeout → kill tree (taskkill /T trên Windows, process group trên Unix), timedOut=true.

startProcess(opts: RunOptions & { name: string }): Promise<{ processId: string }>
// Long-running (dev server...): đăng ký vào managedProcesses, KHÔNG await exit.

killProcess(processId: string): Promise<boolean>
listProcesses(): ManagedProcessInfo[]
readProcessOutput(processId: string, fromByte?: number): { data: string; nextByte: number }
```

#### C. CommandValidator v2 (`src/lib/security/command-validator.ts`)

```ts
type RiskTier = 'safe' | 'caution' | 'dangerous'
interface CommandAssessment { tier: RiskTier; reasons: string[]; normalizedCommand: string }

assessCommand(command: string): CommandAssessment
// Giải thuật (thay whitelist hard-block):
// 1. Tokenize theo separators (&&, ||, ;, |) → đánh giá TỪNG sub-command, lấy tier CAO NHẤT.
// 2. safe:    read-only + build/test tools (ls/dir, cat/Get-Content, git status|diff|log,
//             tsc, eslint, bun/npm run build|test|lint, prisma generate...)
// 3. caution: ghi/cài đặt (npm install, git commit|push, mkdir, mv, prisma db push, redirects > >>)
// 4. dangerous: rm -rf / Remove-Item -Recurse ngoài workspace, curl|sh, sudo, format,
//             registry edit, sửa file ngoài workspace root, env var exfiltration ($env:, printenv | curl)
// LƯU Ý: cho phép metacharacters — vì đã đánh giá từng sub-command và cwd bị khóa trong workspace.

// Policy thực thi (trong tool-executor):
//   safe      → chạy luôn
//   caution   → emit SSE 'approval_needed' → chờ user approve (timeout 5' → reject)
//               autoApprove=true (YOLO mode) → chạy luôn
//   dangerous → từ chối, trả lý do cho agent tự điều chỉnh
```

#### D. DiffManager (`src/lib/execution/diff-manager.ts`)

```ts
proposeEdit(input: {
  sessionId: string; filePath: string; newContent: string; agentName: string
}): Promise<PendingEdit>
// 1. oldContent = read file (hoặc "" nếu chưa tồn tại)
// 2. diff = createUnifiedDiff(oldContent, newContent, filePath)  // thuật toán Myers (lib `diff`)
// 3. Ghi PendingEdit(status=pending), emit SSE 'edit_proposed' { editId, filePath, diff }
// 4. Nếu reviewMode='blocking' → đăng ký approvalWaiters, await promise (user approve/reject/timeout)
// 5. Nếu reviewMode='auto' (YOLO) → gọi luôn applyEdit()

applyEdit(editId: string): Promise<FileOperationResult>
// PRE: tạo FsCheckpoint (nếu chưa có checkpoint cho step hiện tại)
// → writeFile qua workspace-resolved path → status='applied'

approveEdit(editId): Promise<void>   // → applyEdit + resolve waiter
rejectEdit(editId, reason?): Promise<void>  // → status='rejected' + reject waiter
listPendingEdits(sessionId): Promise<PendingEdit[]>
```

#### E. FsCheckpoint — Shadow Git (`src/lib/state-management/fs-checkpoint.ts`)

```ts
initShadowRepo(workspaceRoot: string): Promise<void>
// git init --separate-git-dir vào <workspaceRoot>/.theopus/shadow-git
// worktree = workspaceRoot; ghi .theopus/ vào exclude; KHÔNG đụng .git của user.
// Chạy git qua ProcessManager với env GIT_DIR/GIT_WORK_TREE tường minh.

createCheckpoint(sessionId: string, label: string): Promise<FsCheckpoint>
// git add -A && git commit --allow-empty -m "<label>" (shadow) → lưu commitHash vào DB

restoreCheckpoint(checkpointId: string): Promise<void>
// git checkout <hash> -- .  +  git clean -fd (trong shadow context)
// → emit SSE 'checkpoint_restored'

diffSinceCheckpoint(checkpointId: string): Promise<string>  // git diff <hash> HEAD
```

#### F. RepoMap (`src/lib/context/repo-map.ts`)

```ts
interface RepoMapOptions { maxFiles?: number /*500*/; include?: string[]; exclude?: string[] }
interface FileSymbols { path: string; symbols: { kind: string; name: string; line: number }[] }

buildRepoMap(root: string, opts?: RepoMapOptions): Promise<FileSymbols[]>
// 1. Walk tree (bỏ node_modules, .next, .git, .theopus, theo .gitignore)
// 2. Với .ts/.tsx/.js/.jsx: dùng ts.createSourceFile → duyệt AST lấy
//    exported functions/classes/interfaces/consts + React components.
//    File khác: chỉ ghi path + size.
// 3. Cache .theopus/repomap.json — key = hash(danh sách path + mtime). 

renderRepoMap(map: FileSymbols[], tokenBudget: number): string
// Ranking: file được nhắc trong userRequest > file trung tâm (nhiều symbol được import) > còn lại.
// Cắt theo tokenBudget (ước lượng 4 chars/token). Output dạng cây thư mục + symbols.
// → Được inject vào prompt của TL và G1 (buildContextForAgent trong worklog.ts).
```

#### G. CodeIndexer (`src/lib/context/code-indexer.ts`)

```ts
indexWorkspace(workspaceId: string): Promise<{ files: number; chunks: number }>
// Chunk theo symbol boundary (từ RepoMap AST) — mỗi function/class = 1 chunk (fallback: 60 dòng/chunk,
// overlap 10). Embed qua src/lib/embeddings.ts → upsert Qdrant collection `theopus_code_chunks`
// payload: { workspaceId, filePath, startLine, endLine, symbolName, mtime }.
// Incremental: chỉ re-embed file có mtime đổi; xóa points của file đã delete.

searchCode(query: string, topK = 8): Promise<CodeSearchResult[]>
// Đăng ký thành tool `code_search` trong tool-executor cho mọi agent.
```

#### H. VerifyFixLoop (`src/lib/verification/verify-fix-loop.ts`)

```ts
runVerifyFixLoop(input: {
  sessionId: string
  maxIterations?: number        // default 3
  verifiers?: ('static'|'runtime')[]
  emit: SSEEmitter
}): Promise<{ passed: boolean; iterations: number; remainingErrors: ParsedError[] }>
// LẶP tối đa maxIterations:
//   1. static: runCommand('bunx tsc --noEmit') + runCommand('bunx eslint . --format json')
//   2. parseErrors() → ParsedError { file, line, col, code, message } (regex tsc + JSON eslint)
//   3. errors.length === 0 → passed=true, DỪNG
//   4. groupBy(file) → chọn tối đa 5 file lỗi nhiều nhất
//   5. Dispatch fix-step tới SENTINEL (G2-B): prompt = errors + nội dung file (đọc đúng range ±20 dòng)
//      → agent trả edit → proposeEdit (auto-approve trong fix-loop, đã có checkpoint bọc ngoài)
//   6. Re-verify. Nếu số lỗi KHÔNG GIẢM sau 1 vòng → DỪNG sớm (tránh loop vô hạn), escalate lên TL.
```

#### I. EventStore (`src/lib/communication/event-store.ts`)

```ts
appendEvent(sessionId: string, event: WorkflowEvent): Promise<number /*seq*/>
// seq = ++seqCounters.get(sessionId); ghi WorkflowEventLog. Fire-and-forget (không block workflow),
// lỗi DB chỉ console.warn.

getEventsSince(sessionId: string, afterSeq: number): Promise<StoredEvent[]>
// SSE route: client gửi ?lastSeq=N → server replay events > N trước khi stream live.
// Wrap emit trong workflow-engine:  emit = (ev) => { appendEvent(...); rawEmit(ev) }
```

#### J. GitManager (`src/lib/git/git-manager.ts`) — git THẬT của user (khác shadow git)

```ts
isGitRepo(root): Promise<boolean>
ensureTaskBranch(sessionId): Promise<string>   // tạo/checkout `theopus/task-<sessionId-8>`, chỉ khi user bật gitMode
commitProgress(sessionId, message): Promise<string|null>  // commit các file applied edits
getStatus(root): Promise<GitStatus>
// Mọi lệnh chạy qua ProcessManager (tier caution → cần approve trừ khi gitMode auto).
```

### 2.4 Luồng dữ liệu tổng hợp (write path)

```
Agent (LLM tool_call: write_file/edit_file)
  → tool-executor.executeTool()
    → diff-manager.proposeEdit()          [state: PendingEdit(pending) + SSE edit_proposed]
      → (reviewMode=blocking) chờ user → /api/code-team/edits POST approve
        → fs-checkpoint.createCheckpoint() [state: FsCheckpoint + shadow commit]
        → file-operator.writeFile()        [path resolve qua workspace-manager]
        → PendingEdit(applied) + SSE edit_applied
  → tool result trả về ReAct loop → agent tiếp tục
Sau nhóm G2/G3 → verify-fix-loop → (pass) → TL verify → workflow_done
```

---

## PHẦN 3 — PHƯƠNG ÁN TEST

**Nguyên tắc:** dùng `bun:test` (đã có sẵn Bun). Unit test cho logic thuần (không cần LLM/DB thật);
integration test dùng temp dir + SQLite test db; e2e bằng script mock LLM.

### 3.1 Unit tests (thuần, chạy nhanh, chạy trong CI)

| Test file | Đối tượng | Case chính |
|---|---|---|
| `security/__tests__/command-validator.test.ts` | `assessCommand` | safe: `tsc --noEmit`, `git status`; caution: `npm install x`, `echo a > b.txt`, chuỗi `a && b` lấy tier cao nhất; dangerous: `rm -rf /`, `curl x \| sh`, `Remove-Item -Recurse C:\`; Windows commands (`Get-Content`, `dir`) |
| `execution/__tests__/diff-manager.test.ts` | `createUnifiedDiff`, state machine | diff đúng format; file mới (old="") ; approve→applied; reject→không ghi file; double-approve idempotent |
| `code-team/__tests__/worklog.test.ts` | `findBalancedJson`, `parseWorklogFromOutput` | JSON lồng nhau, JSON kèm text rác, markdown fence |
| `context/__tests__/repo-map.test.ts` | `buildRepoMap`, `renderRepoMap` | fixture mini-project (3 file TS) → đúng symbols; tokenBudget nhỏ → output bị cắt đúng ranking; cache invalidation khi mtime đổi |
| `workspace/__tests__/workspace-manager.test.ts` | `resolveInWorkspace` | chặn `../../etc/passwd`; chặn absolute path ngoài root; cho phép nested path hợp lệ |

### 3.2 Integration tests (temp dir, không mock)

| Test | Cách test |
|---|---|
| `process-manager.test.ts` | `runCommand('echo hello')` cross-platform → stdout đúng; timeout 100ms với lệnh sleep → `timedOut=true`, process bị kill; `startProcess` + `killProcess` → process biến mất khỏi `listProcesses()` |
| `fs-checkpoint.test.ts` | tmp dir → `initShadowRepo` → ghi file A → checkpoint 1 → sửa A + thêm B → `restoreCheckpoint(1)` → A về nội dung cũ, B bị xóa; verify `.git` của user (nếu có) không bị đụng |
| `event-store` (gộp vào checkpoint test suite) | append 5 events → `getEventsSince(2)` trả đúng 3 events theo thứ tự seq |

### 3.3 E2E (`scripts/e2e-code-team.sh`)

1. Set `LLM_MOCK=1` → `llm.ts` trả kịch bản cố định (tool_call viết 1 file HTML, rồi text kết thúc).
2. Gọi `POST /api/code-team/workflow` với request "tạo trang hello world" trên workspace tạm.
3. Assert: SSE nhận đủ chuỗi `workflow_start → edit_proposed → edit_applied → workflow_done`;
   file tồn tại trong workspace tạm; `WorkflowEventLog` có bản ghi; reconnect với `?lastSeq=0` replay đủ events.

### 3.4 Không test (không đáng chi phí)

- Chất lượng output LLM thật (non-deterministic) — chỉ test plumbing với mock.
- UI pixel-level — chỉ smoke test render (Phase 3, tùy chọn).

**CI gate:** `bun run check` = `tsc --noEmit && eslint . && bun test` — bắt buộc pass từ sau Task 6.

---

## PHẦN 4 — PHÂN RÃ TASK (Act Mode thực thi tuần tự)

> Mỗi Task độc lập về ngữ cảnh: chỉ cần đọc các file trong mục *Context*. Hoàn thành → verify → mới sang task kế.

### PHASE 0 — Ổn định nền (P0)

**Task 1 — Fix lỗi TS nhóm "dependency API đổi"**
- *Context:* `tsc-output.txt`, `src/components/ui/resizable.tsx`, `src/lib/ingestion/pdf-parser.ts`, `node_modules/react-resizable-panels/dist/*.d.ts` (đọc exports)
- *Việc:* Sửa M1, M2 + 4 chỗ import pdf-parse trong `src/app/api/ingestion/process/route.ts`; thêm `@types/bun` (M22 phần types).
- *Nghiệm thu:* `bunx tsc --noEmit` không còn lỗi ở 3 nhóm file trên.

**Task 2 — Fix lỗi TS nhóm "lib core"** (`qdrant.ts`, `llm.ts`, `neo4j.ts`, `embeddings.ts`, `agent-memory.ts`, `gateway-tool-registry.ts`, `opencode-knowledge-context.ts`)
- *Context:* `tsc-output.txt` + từng file khi sửa (đọc theo range dòng lỗi, không đọc cả file `llm.ts` 2.265 dòng).
- *Việc:* M5, M7 (phần types), M8, M9. **Quan trọng:** trong M7 sửa luôn việc truyền `options.tools` qua `tryNvidia`/fallback path.
- *Nghiệm thu:* `bunx tsc --noEmit` sạch lỗi trong `src/lib/`; smoke test 1 call LLM có tools qua fallback (mock fetch).

**Task 3 — Fix lỗi TS nhóm "API routes + mini-services"**
- *Context:* `tsc-output.txt` + từng route theo range dòng lỗi.
- *Việc:* M3, M4, M6, M10, M11 + các route còn lại (`memory`, `openclaw/knowledge/query`, `opencode/*`, `setup/neo4j`, `skills`, `sync-neo4j`, `smolab/chat`).
- *Nghiệm thu:* `bunx tsc --noEmit` chỉ còn lỗi trong `src/app/page.tsx` và `skills/`.

**Task 4 — Fix `page.tsx` + dọn dẹp**
- *Context:* `src/app/page.tsx` (đọc theo range dòng lỗi từ tsc-output).
- *Việc:* Sửa ~20 lỗi TS (chủ yếu `useState<T | null>(null)` thiếu generic); xóa `.bak`, `tsc-output.txt`, cập nhật `.gitignore`; loại `skills/` khỏi `tsconfig` include (skills là runtime assets, không phải source app).
- *Nghiệm thu:* `bunx tsc --noEmit` = **0 lỗi**. `bun run build` thành công.

### PHASE 1 — Nền tảng thực thi (Workspace / Process / Diff / Checkpoint)

**Task 5 — WorkspaceManager + Prisma models**
- *Context:* `prisma/schema.prisma`, `src/lib/paths.ts`, `src/lib/db.ts`
- *Việc:* M20 (toàn bộ 5 models), tạo `src/lib/workspace/{workspace-manager.ts,types.ts}` theo §2.3.A, tạo `src/app/api/workspace/route.ts`, `bun run db:push`. Viết `workspace-manager.test.ts`.
- *Nghiệm thu:* test pass; GET/POST /api/workspace hoạt động; default workspace tự tạo.

**Task 6 — ProcessManager + CommandValidator v2**
- *Context:* `src/lib/security/command-validator.ts`, `src/app/api/opencode/execute/route.ts`, §2.3.B–C
- *Việc:* Tạo `process-manager.ts`; viết lại validator theo risk-tier (M13); sửa execute route bỏ `execSync` (M12); tạo `/api/code-team/processes/route.ts`. Viết 2 test files tương ứng. Thêm script `check` vào package.json — **CI gate bật từ đây**.
- *Nghiệm thu:* tests pass trên Windows (PowerShell) — `runCommand('echo hi')`, timeout-kill, long-running process kill được.

**Task 7 — DiffManager + API edits**
- *Context:* `src/lib/execution/file-operator.ts`, `src/lib/execution/types.ts`, §2.3.D, §2.4
- *Việc:* Thêm dep `diff` (npm); tạo `diff-manager.ts`; sửa `file-operator.ts` resolve qua workspace (M14); tạo `/api/code-team/edits/route.ts`. Viết `diff-manager.test.ts`.
- *Nghiệm thu:* test pass; propose→approve ghi file đúng chỗ trong workspace; reject không ghi.

**Task 8 — FsCheckpoint (shadow git)**
- *Context:* `src/lib/state-management/checkpoint-manager.ts`, §2.3.E
- *Việc:* Tạo `fs-checkpoint.ts`; nối vào `applyEdit` (checkpoint trước lần ghi đầu của mỗi step); liên kết M19; tạo `/api/code-team/checkpoints/route.ts`. Viết `fs-checkpoint.test.ts`.
- *Nghiệm thu:* integration test pass: sửa/thêm file → restore → trạng thái cũ khôi phục nguyên vẹn.

**Task 9 — Nối vào tool-executor + workflow-engine**
- *Context:* `src/lib/code-team/tool-executor.ts` (phần switch executeTool), `src/lib/code-team/workflow-engine.ts` (phần runAgentStep + emit), `src/lib/code-team/agents.ts`
- *Việc:* M15 (tools: `run_command`, `write_file`→proposeEdit, `edit_file`→proposeEdit, `kill_process`), M16 (checkpoint mỗi write-step; policy caution-approval qua SSE `approval_needed`), M17 (cấp tools mới cho BOLT/SENTINEL/CATALYST; APEX nhận approval routing). Thêm config `reviewMode: 'blocking'|'auto'` vào WorkflowConfig.
- *Nghiệm thu:* chạy workflow mock (LLM_MOCK) end-to-end: đề xuất edit → approve qua API → file ghi + checkpoint tạo.

**Task 10 — UI: DiffReviewPanel + TerminalPanel + WorkspaceSelector + CheckpointTimeline**
- *Context:* `src/app/page.tsx` (chỉ vùng render Code Team tab), `src/components/ui/*` sẵn có
- *Việc:* Tạo 4 components mới trong `src/components/code-team/` (logic tự chứa, gọi API đã tạo), mount vào page.tsx (M21 mức tối thiểu). SSE client xử lý events mới: `edit_proposed`, `approval_needed`, `checkpoint_restored`.
- *Nghiệm thu:* thao tác được từ UI: xem diff, approve/reject, xem terminal streaming, đổi workspace, restore checkpoint.

### PHASE 2 — Trí tuệ codebase

**Task 11 — RepoMap**
- *Context:* §2.3.F, `src/lib/code-team/worklog.ts` (hàm buildContextForAgent)
- *Việc:* Thêm dep `ts-morph` (hoặc dùng `typescript` sẵn có); tạo `context/repo-map.ts` + `types.ts`; inject `renderRepoMap` vào context của TL & G1; đăng ký tool `repo_map`. Viết `repo-map.test.ts` với fixture.
- *Nghiệm thu:* test pass; prompt TL chứa repo map ≤ tokenBudget.

**Task 12 — CodeIndexer + tool `code_search`**
- *Context:* `src/lib/embeddings.ts`, `src/lib/qdrant.ts`, §2.3.G
- *Việc:* Tạo `code-indexer.ts`; collection `theopus_code_chunks`; index incremental theo mtime; đăng ký tool `code_search` trong tool-executor cho mọi agent; API trigger index khi đổi workspace.
- *Nghiệm thu:* index workspace demo → `searchCode('hàm xử lý diff')` trả đúng chunk của diff-manager; degrade êm khi Qdrant offline (trả [] + warning).

**Task 13 — VerifyFixLoop**
- *Context:* `src/lib/verification/{verification-pipeline.ts,static-verifier.ts,types.ts}`, §2.3.H
- *Việc:* Tạo `verify-fix-loop.ts` (parser lỗi tsc/eslint + dispatch fix tới SENTINEL); gắn vào workflow-engine sau nhóm G2 và trước TL final verify; guard "lỗi không giảm → dừng + escalate".
- *Nghiệm thu:* seed 1 file lỗi type cố ý trong workspace test + mock LLM trả fix đúng → loop pass sau ≤2 vòng; seed fix sai → dừng sớm, escalate, không loop vô hạn.

**Task 14 — GitManager**
- *Context:* §2.3.J, `src/lib/execution/process-manager.ts`
- *Việc:* Tạo `git/git-manager.ts`; option `gitMode` trong WorkflowConfig (off | branch | branch+commit); tool `git_status`/`git_commit` cho TL.
- *Nghiệm thu:* workspace có git → workflow tạo branch `theopus/task-*`, commit sau mỗi checkpoint; workspace không git → bỏ qua êm.

### PHASE 3 — Hoàn thiện

**Task 15 — EventStore + SSE replay**
- *Context:* §2.3.I, `src/app/api/code-team/workflow/route.ts`, workflow-engine (phần emit)
- *Việc:* Tạo `event-store.ts`; wrap emitter; M23 (`?lastSeq=`); UI client tự reconnect với lastSeq.
- *Nghiệm thu:* ngắt client giữa workflow → reconnect → nhận đủ events đã miss, không trùng lặp.

**Task 16 — Model config per agent**
- *Context:* `src/lib/code-team/agents.ts`, `src/lib/code-team/agent-resolver.ts`
- *Việc:* M17 phần override: agent-resolver đọc `AgentModelOverride` trước khi fallback hardcode; tạo `/api/agents/model-config/route.ts`; UI dropdown model trong settings.
- *Nghiệm thu:* đổi model APEX qua API → workflow kế tiếp dùng model mới (verify qua token-usage log).

**Task 17 — Timeout theo operation + hardening opencode client**
- *Context:* `src/lib/opencode.ts`
- *Việc:* M18: `opencodeFetch(path, options, timeoutMs)` — read 15s, exec/build 300s; retry 1 lần cho lỗi network; health-check cache.
- *Nghiệm thu:* lệnh build dài >15s không còn bị abort.

**Task 18 — Tách page.tsx (incremental) + E2E**
- *Context:* `src/app/page.tsx` theo từng vùng tab
- *Việc:* Tách tối thiểu tab Code Team ra `src/components/code-team/CodeTeamTab.tsx` (các tab khác để đợt sau); viết `scripts/e2e-code-team.sh` (§3.3) + mode `LLM_MOCK=1` trong llm.ts.
- *Nghiệm thu:* `bun run check` xanh; e2e script pass; page.tsx giảm ≥2.000 dòng.

---

## PHỤ LỤC — Quy ước cho Act Mode

1. **Trước mỗi Task:** chỉ đọc file trong mục *Context* (đọc theo range dòng khi file lớn).
2. **Sau mỗi Task:** chạy `bunx tsc --noEmit` (+ `bun test` từ Task 6) — pass mới chuyển task.
3. **Không refactor ngoài phạm vi task** — kể cả khi thấy code xấu (ghi chú vào worklog.md thay vì sửa).
4. **Ghi worklog:** append kết quả mỗi task vào `worklog.md` theo format hiện có (Task ID, Work Log, Stage Summary).
5. **Rollback:** mỗi task = 1 commit git riêng để revert độc lập.
