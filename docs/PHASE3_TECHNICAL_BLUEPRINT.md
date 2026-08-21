# Technical Blueprint — Phase 3: Hoàn thiện Code Agent Platform

> Dựa trên `CODE_AGENT_COMPLETION_BLUEPRINT.md` Phase 3 (Task 15–18)
> Plan mode: DeepSeek V4 Pro → Act mode: Kimi K2.6

---

## SECTION A — FILE ARCHITECTURE

### A.1 Files TO CREATE

| # | Đường dẫn | Mục đích |
|---|-----------|----------|
| N1 | `src/lib/communication/event-store.ts` | Persist + replay SSE events vào DB (WorkflowEventLog) |
| N2 | `src/app/api/agents/model-config/route.ts` | GET/PUT model override per agent |
| N3 | `src/components/code-team/CodeTeamTab.tsx` | Tách tab Code Team từ page.tsx |

### A.2 Files TO MODIFY

| # | Đường dẫn | Thay đổi |
|---|-----------|----------|
| M23 | `src/app/api/code-team/workflow/route.ts` | Hỗ trợ `?lastSeq=` để SSE replay từ EventStore |
| M17 | `src/lib/code-team/agent-resolver.ts` | Đọc `AgentModelOverride` từ DB trước khi fallback hardcoded |
| M18 | `src/lib/opencode.ts` | Timeout cấu hình được theo loại operation (read: 15s, exec/build: 300s); retry 1 lần cho network error; health-check cache |
| M21 | `src/app/page.tsx` | Tách tab Code Team ra component riêng, giảm ≥2000 dòng |
| M22 | `package.json` | Thêm script `e2e:code-team` |
| - | `src/lib/llm.ts` | Thêm mode `LLM_MOCK=1` cho e2e test |

### A.3 Files TO READ (context)

| # | Đường dẫn | Lý do |
|---|-----------|-------|
| C1 | `src/app/api/code-team/workflow/route.ts` | Hiểu cấu trúc SSE stream hiện tại |
| C2 | `src/lib/code-team/workflow-engine.ts` | Hiểu emit pattern, WorkflowEvent types |
| C3 | `src/lib/code-team/agent-resolver.ts` | Hiểu resolveAgent flow để thêm ModelOverride |
| C4 | `src/lib/code-team/agents.ts` | Biết hardcoded model definitions |
| C5 | `src/lib/opencode.ts` | Hiểu opencodeFetch pattern hiện tại |
| C6 | `src/app/page.tsx` | Xác định vùng Code Team tab để tách |
| C7 | `prisma/schema.prisma` | Xác nhận model AgentModelOverride đã có |

---

## SECTION B — ALGORITHMS & STATE

### B.1 EventStore (`src/lib/communication/event-store.ts`)

```ts
// State: Map<sessionId, number> — seq counters, khởi tạo từ MAX(seq) trong DB
const seqCounters: Map<string, number> = new Map()

appendEvent(sessionId: string, event: WorkflowEvent): Promise<number /*seq*/>
// 1. seq = (seqCounters.get(sessionId) ?? await db.workflowEventLog.findFirst({orderBy:{seq:'desc'}}).seq) + 1
// 2. seqCounters.set(sessionId, seq)
// 3. db.workflowEventLog.create({data:{sessionId, seq, type: event.type, payload: JSON.stringify(event)}})
//    → fire-and-forget: lỗi DB chỉ console.warn, không throw
// 4. return seq

getEventsSince(sessionId: string, afterSeq: number): Promise<StoredEvent[]>
// SELECT * FROM WorkflowEventLog WHERE sessionId = ? AND seq > ? ORDER BY seq ASC

// StoredEvent = WorkflowEventLog record với payload đã parse
```

**Data flow:**
- **Write:** workflow-engine `safeEmit` → EventStore.appendEvent (fire-and-forget) → SSE emit
- **Read:** client reconnect với `?lastSeq=N` → route handler gọi getEventsSince → replay events trước khi stream live

### B.2 SSE Replay (M23 — `src/app/api/code-team/workflow/route.ts`)

```ts
// POST handler thay đổi:
// 1. Đọc query param `lastSeq` từ URL (nếu client reconnect)
// 2. Nếu lastSeq >= 0: gọi eventStore.getEventsSince(sessionId, lastSeq)
//    → emit từng event đã lưu trước khi bắt đầu stream live
// 3. Stream live: wrap emit để vừa appendEventStore vừa gửi SSE
// 4. Heartbeat vẫn giữ nguyên

// Wrap emit function:
const rawEmit = (event: WorkflowEvent) => { /* gửi SSE như cũ */ }
const emit = (event: WorkflowEvent) => {
  eventStore.appendEvent(sessionId, event).catch(() => {}) // fire-and-forget
  rawEmit(event)
}
```

### B.3 Model Config Per Agent (M17 — `src/lib/code-team/agent-resolver.ts`)

```ts
// Trong resolveAgent(), giữa Step 1 (DB lookup) và Step 2 (hardcoded fallback):
// Thêm Step 1.5: Check AgentModelOverride

// Nếu DB agent tồn tại:
//   → đọc AgentModelOverride.findUnique({where:{agentName}})
//   → nếu có override: ghi đè provider/model từ override
//   → return với source='database' + model từ override

// Nếu dùng hardcoded:
//   → đọc AgentModelOverride.findUnique({where:{agentName}})
//   → nếu có override: ghi đè provider/model từ override
//   → lazy seed với model từ override (nếu có)

// API route: GET/PUT /api/agents/model-config
// GET: trả về tất cả AgentModelOverride records
// PUT: upsert AgentModelOverride { agentName, provider, model }
```

**State:**
- `AgentModelOverride` table trong Prisma — persistent
- Không cần cache riêng vì resolveAgent đã có resolveCache 5 phút

### B.4 Timeout Theo Operation (M18 — `src/lib/opencode.ts`)

```ts
// opencodeFetch(path, options, timeoutMs?: number)
// Thay vì hardcode 15s:
// - Tham số thứ 3: timeoutMs (optional)
// - Default: 15_000 (read operations)
// - Exec/build: 300_000 (5 phút)

// Health-check cache:
const healthCache = { online: boolean, checkedAt: number }
// TTL: 30s — tránh gọi /health liên tục

// Retry:
async function opencodeFetchWithRetry(path, options, timeoutMs, maxRetries=1)
// Nếu lỗi network (fetch throw, không phải HTTP 4xx/5xx) → retry 1 lần sau 500ms
```

**Timeout mapping:**
| Operation type | Timeout |
|----------------|---------|
| `/health`, `/info`, `/sessions`, `/files/*`, `/lsp/*`, `/tools`, `/mcp/*`, `/terminal` | 15s (default) |
| `/execute` | 300s |

### B.5 Tách page.tsx (M21 — `src/app/page.tsx` + `src/components/code-team/CodeTeamTab.tsx`)

```tsx
// CodeTeamTab.tsx — component độc lập chứa TOÀN BỘ logic tab Code Team
// Props: không cần — tự gọi API, tự quản lý state
// Export: default function CodeTeamTab()

// page.tsx thay đổi:
// 1. Xóa TOÀN BỘ code liên quan đến tab Code Team (state, handler, JSX)
// 2. Import CodeTeamTab từ '@/components/code-team/CodeTeamTab'
// 3. Trong TabsContent value="code-team": <CodeTeamTab />
```

**State chuyển từ page.tsx vào CodeTeamTab:**
- `codeTeamMessages`, `codeTeamLoading`, `codeTeamSessionId`, `codeTeamWorkflowStatus`
- `chatMode`, `selectedTeam`, `smolabAgents`, `selectedAgentId`
- Tất cả handler: `startCodeTeamWorkflow`, `handleCodeTeamAssess`, `approveEdit`, `rejectEdit`
- SSE connection management

### B.6 LLM_MOCK mode (cho e2e test)

```ts
// Trong src/lib/llm.ts, thêm ở đầu hàm callLLM:
// if (process.env.LLM_MOCK === '1') {
//   return mockLLMResponse(messages, tools)
// }

// mockLLMResponse:
// - Nếu có tool_call yêu cầu write_file → trả tool_call viết file HTML đơn giản
// - Sau 1-2 tool calls → trả text completion "hoàn thành"
```

---

## SECTION C — SEQUENTIAL TASK DECOMPOSITION

### Task 15: EventStore + SSE Replay
- **Files:** CREATE `src/lib/communication/event-store.ts`, MODIFY `src/app/api/code-team/workflow/route.ts`
- **Implements:** B.1, B.2
- **Acceptance:** 
  1. EventStore.appendEvent ghi được vào DB
  2. GET /api/code-team/workflow?lastSeq=0 replay được events cũ
  3. Ngắt kết nối giữa workflow → reconnect → nhận đủ events đã miss

### Task 16: Model Config Per Agent
- **Files:** CREATE `src/app/api/agents/model-config/route.ts`, MODIFY `src/lib/code-team/agent-resolver.ts`
- **Implements:** B.3
- **Acceptance:**
  1. PUT /api/agents/model-config cập nhật được model override
  2. resolveAgent đọc override và dùng model mới
  3. GET /api/agents/model-config trả về danh sách override

### Task 17: Timeout Theo Operation + Hardening OpenCode Client
- **Files:** MODIFY `src/lib/opencode.ts`
- **Implements:** B.4
- **Acceptance:**
  1. opencodeFetch('/execute', ..., 300000) không timeout sau 15s
  2. Health-check cache TTL 30s hoạt động
  3. Retry 1 lần khi network error

### Task 18: Tách page.tsx + E2E
- **Files:** CREATE `src/components/code-team/CodeTeamTab.tsx`, MODIFY `src/app/page.tsx`, MODIFY `package.json`, CREATE `scripts/e2e-code-team.sh`, MODIFY `src/lib/llm.ts`
- **Implements:** B.5, B.6
- **Acceptance:**
  1. CodeTeamTab render đúng, không console error
  2. page.tsx giảm ≥2000 dòng
  3. `bun run check` pass
  4. `LLM_MOCK=1 bun run e2e:code-team` pass

---

## SECTION D — ACCEPTANCE CRITERIA (Whole Phase 3)

1. **EventStore hoạt động:** events được persist, replay không trùng lặp
2. **Model override hoạt động:** đổi model qua API → workflow dùng model mới
3. **Timeout phân biệt:** read 15s, exec 300s, retry network error
4. **page.tsx tách được:** CodeTeamTab độc lập, page.tsx giảm ≥2000 dòng
5. **E2E test pass:** mock LLM → workflow chạy end-to-end
6. **`bun run check` = 0 lỗi** sau toàn bộ Phase 3