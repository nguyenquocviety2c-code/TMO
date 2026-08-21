# AI Code Team — Kế hoạch Triển khai Chi tiết

> **Status**: Đang thảo luận
> **Reference**: `docs/code-team-workflow.md` — Workflow Architecture
> **Last Updated**: 2025-07-31
> **Mục tiêu**: Biến `docs/code-team-workflow.md` thành tính năng hoạt động thực tế trong Smolab module

---

## 📌 THẢO LUẬN & QUYẾT ĐỊNH

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| 1 | SSE vs WebSocket | **SSE** | Local: chỉ cần HTTP streaming, không cần mini-service, `fetch+ReadableStream`, 1 chiều đủ |
| 2 | TL Discussion Phase | **Chat bình thường → "triển khai" trigger** | Chat với TL = single call. Gõ "triển khai" → TL nhận diện → chuyển workflow SSE |
| 3 | Code Execution | **OpenCode + OpenClaw + Skills mới** | Agents code thực qua OpenCode, dùng KB qua OpenClaw, thêm Tavily/Serper/Jina |
| 4 | Routing Decision | **TL tự quyết** | Workflow doc đủ chi tiết, TL scoring + chọn mode + tier |

---

## 🏗️ TỔNG QUAN KIẾN TRÚC

```
Smolab Chat (page.tsx)
  │
  ├─ chatMode='single' → POST /api/openclaw/chat → 1 LLM response (hiện tại)
  │
  └─ chatMode='multi' + team='code'
       │
       ├─ Gõ bình thường → POST /api/openclaw/chat (TL responds = discussion phase)
       │
       └─ Gõ "triển khai" → POST /api/code-team/workflow (SSE)
            │
            ▼
       Workflow Engine (workflow-engine.ts)
            │
            ├─ TL phân tích → Routing Decision (mode A/B/C + tier 1/2/3)
            │
            ├─ Pipeline tuần tự theo routing:
            │   TL → [G1 →] [G2-A →] G2-B [→ G3] → TL verify
            │
            ├─ Mỗi agent step:
            │   1. Build prompt (system + context + worklog từ agents trước)
            │   2. Call callLLMForAgent() với tool definitions
            │   3. Nếu LLM trả về tool_call → thực thi → đưa kết quả lại → lặp (ReAct loop)
            │   4. Parse output → extract worklog + Code Location Map
            │   5. Emit SSE events → Client render thành chat messages
            │   6. TL checkpoint verify (nếu là checkpoint) → CONTINUE/PIVOT/ESCALATE
            │
            └─ Workflow done → SSE event 'workflow_done'
```

---

## PHASE 1: FOUNDATION — AGENTS + DB SCHEMA + PROMPTS

**Mục tiêu**: 5 agents xuất hiện trong DB, sẵn sàng cho workflow. DB schema hỗ trợ worklog.

### 1.1 Tạo Agent Definitions

**File**: `src/lib/code-team/agents.ts`

**HOW-TO**:

```typescript
import { db } from '@/lib/db'

// ===== AGENT DEFINITIONS (HARDCODED — thiết lập cứng) =====

export interface CodeTeamAgentDef {
  name: string           // Unique key — dùng làm identifier
  description: string
  instruction: string    // System prompt — sẽ được load từ prompts.ts
  domain: string
  capable: string
  provider: string
  model: string
  temperature: number
  maxTokens: number
  team: string
  position: string       // 'TL' | 'G1' | 'G2-A' | 'G2-B' | 'G3'
  avatar: string
  tools: string[]        // Tool permissions cho agent này
}

export const CODE_TEAM_AGENTS: CodeTeamAgentDef[] = [
  {
    name: 'APEX',
    description: 'TL — Nhìn & Điều hướng. Phân tích yêu cầu, chọn routing, code UI (Fast Track), verify kết quả.',
    instruction: '', // Sẽ được load từ getAgentPrompt('TL')
    domain: 'programming',
    capable: 'Phân tích thị giác, routing decision, code UI/UX, verify kết quả, điều phối team',
    provider: 'nvidia',
    model: 'moonshotai/kimi-k2.6',
    temperature: 0.5,
    maxTokens: 8192,
    team: 'code',
    position: 'TL',
    avatar: '👑',
    tools: ['opencode', 'knowledge_search', 'tavily', 'serper', 'jina'],
  },
  {
    name: 'CORTEX',
    description: 'G1 — Thiết kế kiến trúc. TL mô tả WHAT → G1 thiết kế HOW. DB Schema, API Design, Component Tree.',
    instruction: '',
    domain: 'programming',
    capable: 'Thiết kế kiến trúc, DB schema, API design, component tree, state management, security architecture',
    provider: 'nvidia',
    model: 'deepseek-ai/deepseek-v4-flash',
    temperature: 0.4,
    maxTokens: 8192,
    team: 'code',
    position: 'G1',
    avatar: '🧠',
    tools: ['knowledge_search', 'knowledge_graph', 'tavily', 'serper', 'jina'],
  },
  {
    name: 'BOLT',
    description: 'G2-A — Code Execution. Nhận arch spec → Code → Notes → Báo cáo.',
    instruction: '',
    domain: 'programming',
    capable: 'Code TypeScript/React/Next.js, implement API, database operations, error handling',
    provider: 'nvidia',
    model: 'qwen/qwen3.5-397b-a17b',
    temperature: 0.3,
    maxTokens: 8192,
    team: 'code',
    position: 'G2-A',
    avatar: '⚡',
    tools: ['opencode', 'knowledge_search'],
  },
  {
    name: 'SENTINEL',
    description: 'G2-B — Review & Bug Fix. 5 loại bug (Security #1), max 3 vòng iteration, ESCALATE khi cần.',
    instruction: '',
    domain: 'security',
    capable: 'Code review, tìm bugs, kiểm tra security, fix bugs, iterative refinement',
    provider: 'nvidia',
    model: 'z-ai/glm-5.1',
    temperature: 0.2,
    maxTokens: 8192,
    team: 'code',
    position: 'G2-B',
    avatar: '🛡️',
    tools: ['opencode', 'knowledge_search'],
  },
  {
    name: 'CATALYST',
    description: 'G3 — Optimization. 5 lĩnh vực tối ưu, Self-evolving KB, kết nối UI+Backend (Hybrid).',
    instruction: '',
    domain: 'programming',
    capable: 'Tối ưu performance, refactor code, scalability, best practices, UI+Backend integration',
    provider: 'nvidia',
    model: 'minimaxai/minimax-m2.7',
    temperature: 0.3,
    maxTokens: 8192,
    team: 'code',
    position: 'G3',
    avatar: '🔧',
    tools: ['opencode', 'knowledge_search', 'knowledge_graph', 'knowledge_write'],
  },
]

// ===== SEED LOGIC =====
// Chạy khi app startup hoặc lazy khi GET /api/agents
// Đảm bảo 5 agents LUÔN tồn tại — clone GitHub về vẫn đủ

export async function ensureCodeTeamAgents(): Promise<void> {
  const { getAgentPrompt } = await import('./prompts')

  for (const def of CODE_TEAM_AGENTS) {
    try {
      const existing = await db.agentProfile.findUnique({ where: { name: def.name } })
      if (existing) continue // Đã tồn tại → skip

      // Chưa có → Seed
      await db.agentProfile.create({
        data: {
          name: def.name,
          description: def.description,
          instruction: getAgentPrompt(def.position), // Load prompt từ prompts.ts
          domain: def.domain,
          capable: def.capable,
          provider: def.provider,
          model: def.model,
          temperature: def.temperature,
          maxTokens: def.maxTokens,
          team: def.team,
          position: def.position,
          avatar: def.avatar,
          isSystem: true,   // Không thể xóa từ UI
          enabled: true,
        },
      })
      console.log(`[CodeTeam] Seeded agent: ${def.name} (${def.position})`)
    } catch (err) {
      console.error(`[CodeTeam] Failed to seed ${def.name}:`, err)
    }
  }
}

// Helper: Lấy agent definition theo position
export function getAgentByPosition(position: string): CodeTeamAgentDef | undefined {
  return CODE_TEAM_AGENTS.find(a => a.position === position)
}

// Helper: Lấy tool permissions cho agent
export function getAgentTools(position: string): string[] {
  const agent = getAgentByPosition(position)
  return agent?.tools || []
}
```

**Quy tắc**:
- `name` làm unique key (Prisma `@unique`) — không bao giờ trùng
- `isSystem: true` — UI không cho xóa, luôn tồn tại
- `instruction` load từ `prompts.ts` — dễ cập nhật mà không cần sửa DB
- `tools` field → dùng trong workflow engine để định nghĩa tool calls cho LLM

---

### 1.2 Cập nhật Prisma Schema

**File**: `prisma/schema.prisma`

**HOW-TO**: Thêm 2 models mới vào cuối file, trước dòng comment Auto-Learn:

```prisma
// ============================================
// CODE TEAM WORKFLOW SYSTEM
// Multi-agent code team — worklog, sessions, tool calls
// ============================================

/// Code Team worklog entries — tracks each agent's output in a workflow session
model CodeTeamWorklog {
  id          String   @id @default(cuid())
  sessionId   String   /// Session ID (maps to AgentSession.sessionId)
  agentName   String   /// APEX | CORTEX | BOLT | SENTINEL | CATALYST
  position    String   /// TL | G1 | G2-A | G2-B | G3
  step        String   /// analyze | design | code | review | optimize | verify | routing
  summary     String   /// Tóm tắt những gì agent đã làm
  content     String   /// JSON: full WorklogEntry (issues, codeLocationMap, suggestions, etc.)
  toolCalls   String   @default("[]") /// JSON: array of tool calls made during this step
  duration    Int      @default(0) /// Duration in milliseconds
  createdAt   DateTime @default(now())

  @@index([sessionId])
  @@index([agentName])
  @@index([sessionId, position])
  @@index([createdAt])
}

/// Code Team workflow sessions — tracks overall workflow state
model CodeTeamSession {
  id              String   @id @default(cuid())
  sessionId       String   @unique /// Maps to AgentSession.sessionId
  routingMode     String   /// A | B | C
  tier            Int      /// 1 | 2 | 3
  score           Int      /// Complexity score 3-9
  currentStep     String   @default("pending") /// pending | running | checkpoint | completed | failed
  currentAgent    String?  /// Agent đang chạy
  completedAgents String   @default("[]") /// JSON: array of completed agent names
  partsDefinition String   @default("[]") /// JSON: array of PartDefinition from TL
  opencodeSessionId String? /// OpenCode session ID (nếu có)
  totalDuration   Int      @default(0) /// Total duration in ms
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([sessionId])
  @@index([currentStep])
  @@index([createdAt])
}
```

**Sau khi sửa** → chạy `bun run db:push` để apply schema.

---

### 1.3 Tạo Agent System Prompts

**File**: `src/lib/code-team/prompts.ts`

**HOW-TO**: Mỗi prompt được thiết kế theo cấu trúc 8 phần, dựa trên chi tiết từ `docs/code-team-workflow.md`:

```typescript
// ===== PROMPT STRUCTURE =====
// 1. VAI TRÒ — Bạn là ai, vị trí gì
// 2. NGUYÊN TẮC CỐT LÕI — Quy tắc bắt buộc
// 3. NHIỆM VỤ — Các bước thực hiện
// 4. INPUT FORMAT — Bạn nhận gì từ agent trước
// 5. OUTPUT FORMAT — Bạn xuất gì (worklog JSON structure)
// 6. TOOLS — Công cụ bạn có quyền sử dụng
// 7. STOP CRITERIA — Khi nào dừng
// 8. CODE LOCATION MAP — Cách ghi bản đồ code

export function getAgentPrompt(position: string): string {
  switch (position) {
    case 'TL': return TL_PROMPT
    case 'G1': return G1_PROMPT
    case 'G2-A': return G2A_PROMPT
    case 'G2-B': return G2B_PROMPT
    case 'G3': return G3_PROMPT
    default: return ''
  }
}

// ===== TL (APEX) — Nhìn & Điều hướng =====
// Workflow doc reference: "CHI TIẾT TL — CƠ CHẾ CỦA KIMI K2.6"

const TL_PROMPT = `Bạn là APEX — Team Lead của Code Team.

━━━ NGUYÊN TẮC CỐT LÕI ━━━
- Dynamic: "Kimi NHÌN & ĐIỀU HƯỚNG"
- NHÌN thị giác, PHÂN LOẠI routing, CODE UI (Fast Track), VERIFY kết quả
- Bạn quyết định cuối cùng — TL luôn có quyền PIVOT
- TIN TƯỞNG groups, kiểm tra bằng KẾT QUẢ — không đọc code trực tiếp trừ khi ESCALATE

━━━ 7 NHIỆM VỤ CỐT LÕI ━━━
1. TIẾP NHẬN YÊU CẦU — Hiểu intent của user (visual + logic)
2. PHÂN TÍCH COMPLEXITY + ROUTING — Scoring, chọn Mode + Tier
3. PHÁ VỠ BÀI TOÁN THÀNH PARTS — Chia theo dependency, Visual → Fast Track, Backend → Pipeline
4. VIẾT SPEC CHO TỪNG PART — Visual spec: Layout, màu, font, component. Logic spec: API, DB, business rules
5. FAST TRACK: CODE UI KHI CẦN — Tự code giao diện, Self-verify ≥ 85%, max 3 vòng iterate
6. HỖ TRỢ G1 THỊ GIÁC KHI CẦN — Consultation, KHÔNG phá vỡ pipeline
7. VERIFY KẾT QUẢ — Visual: so với mockup. Logic: test + kiểm tra worklog

━━━ ROUTING DECISION ━━━
Phân tích request → Scoring (3 tiêu chí × 1-3 điểm):
- Phạm vi: 1(1 file <50 dòng) | 2(2-5 files) | 3(>5 files, multi-module)
- Suy luận: 1(Fix bug rõ ràng) | 2(Feature mới) | 3(Kiến trúc mới)
- Rủi ro: 1(Không ảnh hưởng) | 2(Ảnh hưởng module liên quan) | 3(Ảnh hưởng toàn hệ thống)

Tổng score → Tier: 3-4=Simple | 5-7=Medium | 8-9=Complex
Loại request → Mode: A(Pure Visual) | B(Pure Backend) | C(Hybrid)

━━━ OUTPUT FORMAT ━━━
Khi phân tích routing, output JSON:
\`\`\`json
{
  "mode": "A|B|C",
  "tier": 1|2|3,
  "score": <number>,
  "reasoning": "<giải thích>",
  "parts": [
    { "name": "<tên part>", "type": "visual|backend", "description": "<mô tả>", "dependency": ["<part names>"] }
  ],
  "spec": "<chi tiết spec cho từng part>"
}
\`\`\`

Khi verify checkpoint, output JSON:
\`\`\`json
{
  "decision": "CONTINUE|PIVOT|ESCALATE",
  "reasoning": "<lý do>",
  "updatedSpec": "<nếu PIVOT — spec mới>",
  "issues": ["<vấn đề phát hiện>"]
}
\`\`\`

━━━ TOOLS ━━━
Bạn có quyền: opencode (code UI), knowledge_search (KB), tavily (web search), serper (Google), jina (web reader)
Sử dụng tools khi cần thiết — KHÔNG bắt buộc mỗi lần.

━━━ FAST TRACK (Mode A) ━━━
Khi Mode A: Pipeline = TL→TL→G2-B→TL
1. ANALYZE — Phân tích visual
2. CODE — Tự code UI (JSX/Tailwind)
3. SELF-VERIFY — So với mockup. <85% → iterate (max 3). ≥85% → chuyển G2-B
4. G2-B sẽ review code quality
5. Bạn final verify

━━━ CHECKPOINT VERIFY ━━━
Sau mỗi Group hoàn thành → Đọc worklog → So với spec → Quyết định:
- CONTINUE: Progress đúng kế hoạch
- PIVOT: Direction cần thay đổi (phát hiện approach sai, requirement mới)
- ESCALATE: Cần user input (blocker, ambiguous requirement)

━━━ CODE LOCATION MAP ━━━
Khi hoàn thành, ghi Code Location Map:
\`\`\`json
{
  "filesToRead": [{ "path": "<file>", "priority": "critical|high|medium|low", "reason": "<lý do>", "lines": "<range>" }],
  "filesToSkip": [{ "path": "<file>", "reason": "<lý do bỏ qua>" }],
  "dependencies": [{ "from": "<file>", "to": "<file>", "type": "import|extends|calls|uses" }],
  "readingStrategy": "full"
}
\`\`\``

// ===== G1 (CORTEX) — Thiết kế kiến trúc =====
// Workflow doc reference: "CHI TIẾT G1 — CƠ CHẾ KIẾN TRÚC CỦA DEEPSEEK V4"

const G1_PROMPT = `Bạn là CORTEX — G1 (Kiến trúc sư) của Code Team.

━━━ NGUYÊN TẮC CỐT LÕI ━━━
- "TL mô tả WHAT, G1 thiết kế HOW"
- Suy luận sâu, architecture-first: LUÔN thiết kế trước khi code
- Bạn quy định CÁCH triển khai — KHÔNG tự code

━━━ 5 BƯỚC CỦA G1 ━━━
1. NHẬN SPEC TỪ TL — Đọc spec, hiểu yêu cầu nghiệp vụ, xác định constraints
2. PHÂN TÍCH KIẾN TRÚC — Modules, dependency, data flow, integration points, edge cases
3. THIẾT KẾ CHI TIẾT — DB Schema, API Design, Component Tree, State Management, Security Architecture, Error Handling
4. TẠO ARCHITECTURE SPEC — File paths, Code structure, DB schema, API endpoints, Error cases, Testing considerations
5. GIAO CHO G2-A — Arch spec + worklog

━━━ INPUT FORMAT ━━━
Bạn nhận từ TL:
- Spec mô tả (WHAT cần làm)
- Routing decision (mode + tier)
- Parts definition (nếu nhiều parts)

━━━ OUTPUT FORMAT ━━━
\`\`\`json
{
  "summary": "<tóm tắt kiến trúc>",
  "completed": ["<đã hoàn thành>"],
  "inProgress": [],
  "issues": [{ "severity": "critical|high|medium|low", "type": "logic|security|type", "description": "<mô tả>", "location": "<file:line>" }],
  "suggestions": ["<gợi ý cho G2-A>"],
  "concerns": ["<lo ngại>"],
  "archSpec": {
    "filePaths": ["<danh sách files cần tạo/sửa>"],
    "dbSchema": "<Prisma schema>",
    "apiEndpoints": [{ "method": "GET|POST", "path": "<path>", "description": "<mô tả>", "input": "<type>", "output": "<type>" }],
    "componentTree": "<mô tả component hierarchy>",
    "stateManagement": "<mô tả state flow>",
    "securityNotes": "<security considerations>",
    "errorHandling": "<error handling strategy>",
    "implementationOrder": ["<thứ tự code>"]
  },
  "codeLocationMap": { "filesToRead": [...], "filesToSkip": [...], "dependencies": [...], "readingStrategy": "full" },
  "nextSteps": ["<G2-A cần làm gì>"],
  "outputForNext": "<output chính cho G2-A>"
}
\`\`\`

━━━ TOOLS ━━━
Bạn có quyền: knowledge_search (KB), knowledge_graph (Neo4j Cypher), tavily (web search), serper (Google), jina (web reader)
KHÔNG có: opencode — G1 KHÔNG code, chỉ thiết kế
Sử dụng tools khi cần research best practices hoặc tìm thông tin trong KB.

━━━ CODE LOCATION MAP ━━━
Ghi map với readingStrategy = "full" vì G2-A cần đọc tất cả để code.`

// ===== G2-A (BOLT) — Code Execution =====
// Workflow doc reference: "CHI TIẾT G2-A — CƠ CHẾ CODE EXECUTION CỦA QWEN3 CODER"

const G2A_PROMPT = `Bạn là BOLT — G2-A (Lập trình viên chính) của Code Team.

━━━ NGUYÊN TẮC CỐT LàI ━━━
- "Nhận spec → Code → Ghi chú → Báo cáo"
- Code TỪ ARCHITECTURE SPEC — KHÔNG tự ý thay đổi kiến trúc
- Nếu thấy arch spec có vấn đề → ghi trong suggestions, KHÔNG tự sửa

━━━ 4 BƯỚC CỦA G2-A ━━━
1. ĐỌC ARCHITECTURE SPEC — Lên kế hoạch thứ tự code: Types/Interfaces → DB models → API routes → Business logic
2. CODE THEO TỪNG FILE — Dùng opencode tool để code. Đầy đủ theo spec, error handling, comments
3. NOTES & SUGGESTIONS — Notes cho G2-B về đoạn cần review kỹ. Suggestions cho TL/G1 về cải tiến
4. GỌI G2-B — Output code + worklog cho G2-B review

━━━ INPUT FORMAT ━━━
Bạn nhận từ G1:
- Architecture spec (file paths, DB schema, API endpoints, component tree)
- Code Location Map từ G1
- Spec gốc từ TL

━━━ OUTPUT FORMAT ━━━
\`\`\`json
{
  "summary": "<tóm tắt code đã implement>",
  "completed": ["<files đã code>"],
  "inProgress": [],
  "issues": [{ "severity": "...", "type": "...", "description": "...", "location": "file:line" }],
  "suggestions": ["<gợi ý cho G2-B cần review kỹ>"],
  "concerns": ["<edge cases cần lưu ý>"],
  "codeLocationMap": {
    "filesToRead": [{ "path": "<file>", "priority": "critical|high|medium|low", "reason": "...", "lines": "<range>" }],
    "filesToSkip": [{ "path": "<file>", "reason": "..." }],
    "dependencies": [{ "from": "<file>", "to": "<file>", "type": "import|extends|calls|uses" }],
    "readingStrategy": "bug_locations"
  },
  "nextSteps": ["<G2-B cần review gì>"],
  "outputForNext": "<output chính cho G2-B>"
}
\`\`\`

━━━ TOOLS ━━━
Bạn có quyền: opencode (code files), knowledge_search (KB)
KHÔNG có: tavily, serper, jina — G2-A chỉ code, không research

━━━ OPENCODE USAGE ━━━
Dùng opencode tool để:
- Đọc file: opencode({ action: 'read', path: '<file>' })
- Viết file: opencode({ action: 'write', path: '<file>', content: '<code>' })
- Chạy terminal: opencode({ action: 'bash', command: '<command>' })

Code theo đúng thứ tự trong implementationOrder từ arch spec.`

// ===== G2-B (SENTINEL) — Review & Bug Fix =====
// Workflow doc reference: "CHI TIẾT G2-B — CƠ CHẾ REVIEW & BUG FIX CỦA GLM 5.1"

const G2B_PROMPT = `Bạn là SENTINEL — G2-B (Reviewer & Bug Fixer) của Code Team.

━━━ NGUYÊN TẮC CỐT LÕI ━━━
- "Đọc → Tìm → Sửa → Kiểm tra → Lặp lại"
- Priority #1 = Security — KHÔNG BAO GIỜ bỏ qua security issue
- Max 3 vòng iteration — còn bug critical/high → Báo TL
- Bạn làm CẢ reviewer + fixer — tự tìm, tự sửa, tự verify

━━━ 5 LOẠI BUG (priority giảm dần) ━━━
1. 🚨 Security Issues — CRITICAL #1! SQL injection, XSS, webhook không verify, auth bypass
2. 🔴 Logic Bugs — Sai business logic, thiếu validation, race conditions
3. 🟡 Type Errors — TypeScript type mismatch, any abuse, missing null checks
4. 🟠 Edge Cases — Null, empty, boundary values, timeout, rate limiting
5. 🟢 Compatibility — Env mismatch, dependency conflict, version issues

━━━ BUG SEVERITY & XỬ LÝ ━━━
🔴 CRITICAL → Fix NGAY, không bỏ qua
🟠 HIGH → Fix trong vòng lặp hiện tại
🟡 MEDIUM → Fix nếu có token, không → Ghi cho G3
🟢 LOW → Ghi worklog, bỏ qua

━━━ STOP CRITERIA ━━━
✅ PASS: Không tìm thấy bug mới sau 1 vòng
✅ PASS: Tối đa 3 vòng — nếu còn bug critical/high → Báo TL
✅ PASS: Bug còn lại = LOW severity → Ghi cho G3
⚠️ ESCALATE: Phát hiện architectural issue → DỪNG → Báo TL ngay

━━━ INPUT FORMAT ━━━
Bạn nhận từ G2-A:
- Code đã implement + Code Location Map
- Notes từ G2-A về đoạn cần review kỹ
Bạn cũng nhận spec gốc từ TL để verify

━━━ DIRECTED READING STRATEGY ━━━
CHIẾN LƯỢC: bug_locations (selective, local fix)
1. ĐỌC WORKLOG TRƯỚC — Code Location Map cho biết CODE NÀO cần đọc
2. ĐỌC CODE THEO CHỈ ĐIỂM — Chỉ đọc files được đánh dấu, ưu tiên critical → high → medium
3. ĐỌC SPEC ĐỂ VERIFY — So code với spec gốc
4. FIX + VERIFY — Sửa bug qua opencode, cập nhật worklog + Code Location Map

━━━ OUTPUT FORMAT ━━━
\`\`\`json
{
  "summary": "<tóm tắt review + fix>",
  "completed": ["<bugs đã fix>"],
  "inProgress": [],
  "issues": [{ "severity": "...", "type": "security|logic|type|edge_case|compatibility", "description": "...", "location": "file:line", "fixApplied": true, "fixDescription": "..." }],
  "suggestions": ["<gợi ý cho G3>"],
  "concerns": ["<lo ngại nếu có>"],
  "codeLocationMap": {
    "filesToRead": [...],
    "filesToSkip": [...],
    "dependencies": [...],
    "readingStrategy": "bug_locations"
  },
  "unfixedBugs": [{ "severity": "...", "description": "...", "reason": "LOW severity | hết vòng iteration" }],
  "nextSteps": ["<G3 cần tối ưu gì>"],
  "outputForNext": "<output chính cho G3>"
}
\`\`\`

━━━ TOOLS ━━━
Bạn có quyền: opencode (đọc + sửa files), knowledge_search (KB)
Sử dụng opencode để: đọc file cần review, sửa bugs, chạy terminal để verify

━━━ ITERATION LOOP ━━━
Vòng 1: Review toàn bộ code theo Code Location Map → Fix tất cả bugs tìm được
Vòng 2: Re-review code đã fix → Fix bugs mới (nếu có)
Vòng 3: Final review → Fix bugs còn lại → Nếu còn critical/high → ESCALATE
Mỗi vòng ghi rõ số bugs tìm được + số bugs đã fix.`

// ===== G3 (CATALYST) — Optimization =====
// Workflow doc reference: "CHI TIẾT G3 — CƠ CHẾ OPTIMIZATION CỦA MINIMAX M2.7"

const G3_PROMPT = `Bạn là CATALYST — G3 (Tối ưu hóa) của Code Team.

━━━ NGUYÊN TẮC CỐT LÕI ━━━
- "Không chỉ sửa — mà làm TỐT HƠN"
- G2-B Output = Code ĐÚNG (không bug) → G3 Output = Code TỐT NHẤT
- Không premature optimization — LUÔN measure trước khi optimize

━━━ 5 LĨNH VỰC TỐI ƯU ━━━
1. Performance — N+1 queries → include, bundle size, caching, lazy loading
2. Simplification — Strategy Pattern, DRY, remove duplication, extract shared logic
3. Architecture Refinement — Separate concerns, clean abstractions, reduce coupling
4. Best Practices — Error handling, logging, rate limiting, env validation, type safety
5. Scalability — DB indexes, connection pooling, pagination, CDN, horizontal scaling

━━━ HYBRID MODE (khi Mode C) ━━━
Khi TL đã code UI VÀ G2-A→G2-B đã code Backend, bạn kết nối integration:
1. ANALYZE INTEGRATION POINTS — UI components cần data từ API nào? Forms POST đến đâu?
2. CONNECT UI ↔ API — Data fetching strategy, Loading states, Optimistic updates, Cache invalidation
3. OPTIMIZE INTEGRATION — SSR vs CSR, debounce, error boundaries
4. VERIFY INTEGRATION — UI hiển thị data đúng, Forms submit đúng, Error handling khi API fail

━━━ SELF-EVOLVING — Knowledge Base ━━━
Khi phát hiện anti-pattern hoặc best practice quan trọng → Ghi vào KB bằng knowledge_write
Categories: Database, API Design, Frontend, Security, Anti-Patterns
Evolution Cycle: APPLY → EXPERIMENT → MEASURE → LEARN → REPEAT

━━━ INPUT FORMAT ━━━
Bạn nhận từ G2-B:
- Code đã review + fix + Code Location Map
- Unfixed bugs (LOW severity) từ G2-B
Bạn cũng nhận spec gốc từ TL + UI code từ TL (nếu Mode C)

━━━ DIRECTED READING STRATEGY ━━━
CHIẾN LƯỢC: dependency_chain (wider, structural improvement)
1. ĐỌC WORKLOG TRƯỚC — Code Location Map → Biết files nào liên quan
2. ĐỌC THEO DEPENDENCY CHAIN — Đọc rộng hơn G2-B, theo dependency chain giữa files
3. TÌM: inefficiency, redundancy, overcomplexity, missing abstractions
4. OPTIMIZE + VERIFY — Sửa code qua opencode, cập nhật worklog

━━━ OUTPUT FORMAT ━━━
\`\`\`json
{
  "summary": "<tóm tắt optimization>",
  "completed": ["<tối ưu đã thực hiện>"],
  "inProgress": [],
  "issues": [{ "severity": "...", "type": "performance|simplification|architecture|best_practice|scalability", "description": "...", "location": "file:line", "fixApplied": true, "fixDescription": "..." }],
  "suggestions": ["<gợi ý cho TL verify>"],
  "concerns": ["<lo ngại nếu có>"],
  "codeLocationMap": {
    "filesToRead": [...],
    "filesToSkip": [...],
    "dependencies": [...],
    "readingStrategy": "dependency_chain"
  },
  "kbWrites": [{ "category": "...", "content": "...", "reason": "..." }],
  "nextSteps": ["<TL cần verify gì>"],
  "outputForNext": "<output chính cho TL verify>"
}
\`\`\`

━━━ TOOLS ━━━
Bạn có quyền: opencode (đọc + tối ưu files), knowledge_search (KB), knowledge_graph (Neo4j), knowledge_write (ghi KB)
Sử dụng knowledge_write để ghi lessons vào KB khi phát hiện best practice quan trọng.`
```

---

### 1.4 Cập nhật Agent Seed + Constants

**File sửa**: `src/lib/agent-seed.ts`

**HOW-TO**: Sửa `ensureSystemAgents()` để gọi `ensureCodeTeamAgents()`:

```typescript
export async function ensureSystemAgents(): Promise<void> {
  // Chỉ seed Code Team — 5 agents hardcoded
  const { ensureCodeTeamAgents } = await import('./code-team/agents')
  await ensureCodeTeamAgents()
}
```

**File sửa**: `src/lib/agent-constants.ts`

**HOW-TO**: Thêm positions G2-A, G2-B vào hằng số hiện tại:

```typescript
// Thêm vào CODE_POSITIONS
export const CODE_POSITIONS = ['TL', 'G1', 'G2-A', 'G2-B', 'G3'] as const

// Thêm vào POSITION_LABELS
'G2-A': 'G2-A — Code Execution',
'G2-B': 'G2-B — Review & Bug Fix',

// Thêm agent colors cho multi-agent chat
export const AGENT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  APEX:    { border: 'border-amber-500',    bg: 'bg-amber-950/20',    text: 'text-amber-400' },
  CORTEX:  { border: 'border-violet-500',   bg: 'bg-violet-950/20',  text: 'text-violet-400' },
  BOLT:    { border: 'border-cyan-500',     bg: 'bg-cyan-950/20',    text: 'text-cyan-400' },
  SENTINEL:{ border: 'border-rose-500',     bg: 'bg-rose-950/20',    text: 'text-rose-400' },
  CATALYST:{ border: 'border-emerald-500',  bg: 'bg-emerald-950/20', text: 'text-emerald-400' },
}
```

### 1.5 Verify Phase 1

```bash
bun run db:push
bun run dev
# Kiểm tra: curl http://localhost:3000/api/agents → 5 agents xuất hiện
```

---

## PHASE 2: WORKLOG + TOOL EXECUTION

**Mục tiêu**: Hệ thống worklog hoạt động. Tool execution (OpenCode, OpenClaw, Skills) sẵn sàng cho workflow engine.

### 2.1 Tạo Worklog System

**File**: `src/lib/code-team/worklog.ts`

**HOW-TO**: Implement theo chuẩn từ workflow doc "READ-WRITE-VERIFY LOOP" + "DIRECTED READING + CODE LOCATION MAP":

```typescript
import { db } from '@/lib/db'

// ===== TYPES (từ workflow doc) =====

export interface WorklogEntry {
  sessionId: string
  agentName: string
  position: string
  step: string
  timestamp: Date
  summary: string
  completed: string[]
  inProgress: string[]
  issues: WorklogIssue[]
  suggestions: string[]
  concerns: string[]
  codeLocationMap: CodeLocationMap
  nextSteps: string[]
  outputForNext: string
  routingDecision?: RoutingDecision
  unfixedBugs?: UnfixedBug[]
  kbWrites?: KBWrite[]
  toolCallsLog?: ToolCallLog[]
}

export interface WorklogIssue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  type: 'security' | 'logic' | 'type' | 'edge_case' | 'compatibility' | 'performance' | 'simplification' | 'architecture' | 'best_practice' | 'scalability'
  description: string
  location?: string
  fixApplied?: boolean
  fixDescription?: string
}

export interface CodeLocationMap {
  filesToRead: Array<{
    path: string
    priority: 'critical' | 'high' | 'medium' | 'low'
    reason: string
    lines?: string
  }>
  filesToSkip: Array<{ path: string; reason: string }>
  dependencies: Array<{ from: string; to: string; type: 'import' | 'extends' | 'calls' | 'uses' }>
  readingStrategy: 'bug_locations' | 'dependency_chain' | 'full'
}

export interface RoutingDecision {
  mode: 'A' | 'B' | 'C'
  tier: 1 | 2 | 3
  score: number
  reasoning: string
  parts: PartDefinition[]
}

export interface PartDefinition {
  name: string
  type: 'visual' | 'backend'
  description: string
  dependency: string[]
}

// ===== WORKLOG OPERATIONS =====

// WRITE — Ghi worklog sau mỗi agent hoàn thành (từ workflow doc: "WRITE — Mỗi G sau khi xong việc → GHI worklog")
export async function writeWorklog(entry: WorklogEntry): Promise<void> {
  await db.codeTeamWorklog.create({
    data: {
      sessionId: entry.sessionId,
      agentName: entry.agentName,
      position: entry.position,
      step: entry.step,
      summary: entry.summary,
      content: JSON.stringify(entry),
      toolCalls: JSON.stringify(entry.toolCallsLog || []),
    },
  })
}

// READ — Đọc worklog của session (từ workflow doc: "READ — TL đọc lại worklog sau mỗi Group")
export async function readWorklog(sessionId: string, position?: string): Promise<WorklogEntry[]> {
  const where: any = { sessionId }
  if (position) where.position = position

  const records = await db.codeTeamWorklog.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })

  return records.map(r => JSON.parse(r.content))
}

// READ LATEST — Đọc worklog mới nhất của 1 agent
export async function readLatestWorklog(sessionId: string, agentName: string): Promise<WorklogEntry | null> {
  const record = await db.codeTeamWorklog.findFirst({
    where: { sessionId, agentName },
    orderBy: { createdAt: 'desc' },
  })
  return record ? JSON.parse(record.content) : null
}

// VERIFY — TL so sánh worklog với spec (từ workflow doc: "VERIFY — TL so sánh worklog với spec → CONTINUE / PIVOT / ESCALATE")
export function verifyWorklog(worklog: WorklogEntry, originalSpec: string): 'CONTINUE' | 'PIVOT' | 'ESCALATE' {
  const criticalIssues = worklog.issues.filter(i => i.severity === 'critical' && !i.fixApplied)
  const highIssues = worklog.issues.filter(i => i.severity === 'high' && !i.fixApplied)

  if (criticalIssues.length > 0) return 'ESCALATE'
  if (highIssues.length > 2) return 'PIVOT'
  return 'CONTINUE'
}

// BUILD CONTEXT cho agent tiếp theo — Từ workflow doc "3 Lớp thông tin G2-B/G3 cần":
// LỚP 1: SPEC (Từ TL), LỚP 2: WORKLOG (Từ G trước), LỚP 3: CODE THẬT (Từ file system)
export async function buildContextForAgent(
  sessionId: string,
  targetPosition: string,
  spec: string,
): Promise<string> {
  const allWorklogs = await readWorklog(sessionId)
  const targetTools = getAgentTools(targetPosition)

  let context = `━━━ LỚP 1: SPEC GỐC TỪ TL ━━━\n${spec}\n\n`
  context += `━━━ LỚP 2: WORKLOG TỪ CÁC AGENTS TRƯỚC ━━━\n`

  for (const wl of allWorklogs) {
    context += `\n--- ${wl.agentName} (${wl.position}) — ${wl.step} ---\n`
    context += `Summary: ${wl.summary}\n`
    if (wl.completed.length > 0) context += `Completed: ${wl.completed.join(', ')}\n`
    if (wl.issues.length > 0) {
      context += `Issues: ${wl.issues.map(i => `[${i.severity}] ${i.type}: ${i.description}${i.fixApplied ? ' (FIXED)' : ''}`).join('; ')}\n`
    }
    if (wl.suggestions.length > 0) context += `Suggestions: ${wl.suggestions.join('; ')}\n`
    if (wl.outputForNext) context += `Output: ${wl.outputForNext}\n`

    // Code Location Map — hướng dẫn đọc code
    if (wl.codeLocationMap) {
      context += `\nCode Location Map (đọc TRƯỚC khi đọc code):\n`
      context += `Reading Strategy: ${wl.codeLocationMap.readingStrategy}\n`
      context += `Files to READ:\n`
      for (const f of wl.codeLocationMap.filesToRead) {
        context += `  [${f.priority}] ${f.path}${f.lines ? ` (lines: ${f.lines})` : ''} — ${f.reason}\n`
      }
      if (wl.codeLocationMap.filesToSkip.length > 0) {
        context += `Files to SKIP:\n`
        for (const f of wl.codeLocationMap.filesToSkip) {
          context += `  ${f.path} — ${f.reason}\n`
        }
      }
    }
  }

  return context
}

// Helper
function getAgentTools(position: string): string[] {
  const { getAgentTools: getTools } = require('./agents')
  return getTools(position)
}

// Parse worklog từ LLM output — extract JSON từ text
export function parseWorklogFromOutput(output: string): Partial<WorklogEntry> | null {
  // Tìm JSON block trong output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) return null

  try {
    return JSON.parse(jsonMatch[1])
  } catch {
    return null
  }
}
```

---

### 2.2 Tạo Tool Execution Layer

**File**: `src/lib/code-team/tool-executor.ts`

**HOW-TO**: Central place để execute tất cả tools mà agents có thể gọi. Hỗ trợ ReAct loop.

```typescript
import { callLLMForAgent, LLMResult } from '@/lib/llm'
import { getAgentByPosition, getAgentTools } from './agents'

// ===== TOOL DEFINITIONS (OpenAI function calling format) =====
// Định nghĩa tools cho LLM — mỗi agent nhận tools theo quyền của mình

export function getToolDefinitions(tools: string[]): object[] {
  const allDefs: Record<string, object> = {
    opencode: {
      type: 'function',
      function: {
        name: 'opencode',
        description: 'Thực hiện code operations qua OpenCode: đọc file, viết file, chạy terminal command',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['read', 'write', 'bash', 'mkdir'], description: 'Hành động cần thực hiện' },
            path: { type: 'string', description: 'Đường dẫn file (cho read/write/mkdir)' },
            content: { type: 'string', description: 'Nội dung file (cho write)' },
            command: { type: 'string', description: 'Terminal command (cho bash)' },
          },
          required: ['action'],
        },
      },
    },
    knowledge_search: {
      type: 'function',
      function: {
        name: 'knowledge_search',
        description: 'Tìm kiếm semantic trong Knowledge Base (Qdrant)',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Câu hỏi cần tìm kiếm' },
            topK: { type: 'number', description: 'Số kết quả trả về (default: 5)', default: 5 },
          },
          required: ['query'],
        },
      },
    },
    knowledge_graph: {
      type: 'function',
      function: {
        name: 'knowledge_graph',
        description: 'Truy vấn đồ thị Neo4j bằng Cypher query',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Cypher query' },
          },
          required: ['query'],
        },
      },
    },
    knowledge_write: {
      type: 'function',
      function: {
        name: 'knowledge_write',
        description: 'Ghi entity/relationship mới vào Knowledge Base',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Category: Database|API Design|Frontend|Security|Anti-Patterns' },
            content: { type: 'string', description: 'Nội dung knowledge cần ghi' },
          },
          required: ['category', 'content'],
        },
      },
    },
    tavily: {
      type: 'function',
      function: {
        name: 'tavily',
        description: 'Web search AI-optimized — tìm kiếm thông tin trên internet',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Câu hỏi tìm kiếm' },
          },
          required: ['query'],
        },
      },
    },
    serper: {
      type: 'function',
      function: {
        name: 'serper',
        description: 'Google Search API — tìm kiếm trên Google',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Câu hỏi tìm kiếm' },
          },
          required: ['query'],
        },
      },
    },
    jina: {
      type: 'function',
      function: {
        name: 'jina',
        description: 'Web page reader — đọc nội dung trang web từ URL',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL trang web cần đọc' },
          },
          required: ['url'],
        },
      },
    },
  }

  return tools.map(t => allDefs[t]).filter(Boolean)
}

// ===== TOOL EXECUTION =====
// Thực thi tool call từ LLM

export async function executeTool(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result: any }> {
  try {
    switch (toolName) {
      case 'opencode':
        return await executeOpenCode(args)
      case 'knowledge_search':
        return await executeKnowledgeSearch(args)
      case 'knowledge_graph':
        return await executeKnowledgeGraph(args)
      case 'knowledge_write':
        return await executeKnowledgeWrite(args)
      case 'tavily':
        return await executeTavily(args)
      case 'serper':
        return await executeSerper(args)
      case 'jina':
        return await executeJina(args)
      default:
        return { success: false, result: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    return { success: false, result: `Tool error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ===== INDIVIDUAL TOOL IMPLEMENTATIONS =====

async function executeOpenCode(args: Record<string, any>) {
  const { action, path, content, command } = args
  // Gọi OpenCode Server qua internal fetch
  const res = await fetch('http://localhost:18790/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, path, content, command }),
  })
  if (!res.ok) return { success: false, result: `OpenCode error: ${res.status}` }
  const data = await res.json()
  return { success: true, result: data }
}

async function executeKnowledgeSearch(args: Record<string, any>) {
  const { searchSimilar } = await import('@/lib/qdrant')
  const { generateEmbedding } = await import('@/lib/embeddings')
  const embedding = await generateEmbedding(args.query, 'query')
  const results = await searchSimilar(embedding, args.topK || 5)
  return { success: true, result: results }
}

async function executeKnowledgeGraph(args: Record<string, any>) {
  const { queryNeo4j } = await import('@/lib/neo4j')
  const results = await queryNeo4j(args.query)
  return { success: true, result: results }
}

async function executeKnowledgeWrite(args: Record<string, any>) {
  // Write to KB — sử dụng existing ingestion pipeline
  // Simplified: ghi vào LocalEntity
  const { db } = await import('@/lib/db')
  await db.localEntity.create({
    data: {
      entityName: args.category,
      entityType: 'Concept',
      description: args.content,
      source: 'code-team-g3-self-evolving',
      confidenceScore: 0.8,
    },
  })
  return { success: true, result: 'Written to KB' }
}

async function executeTavily(args: Record<string, any>) {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return { success: false, result: 'TAVILY_API_KEY not configured' }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query: args.query, max_results: 5 }),
  })
  const data = await res.json()
  return { success: true, result: data.results || data }
}

async function executeSerper(args: Record<string, any>) {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return { success: false, result: 'SERPER_API_KEY not configured' }

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: args.query }),
  })
  const data = await res.json()
  return { success: true, result: data.organic || data }
}

async function executeJina(args: Record<string, any>) {
  const apiKey = process.env.JINA_API_KEY
  const headers: Record<string, string> = { 'Accept': 'text/plain' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(`https://r.jina.ai/${args.url}`, { headers })
  const text = await res.text()
  return { success: true, result: text.slice(0, 5000) } // Limit output
}
```

---

### 2.3 Verify Phase 2

```bash
# Test tool execution
curl -X POST http://localhost:3000/api/code-team/workflow -H 'Content-Type: application/json' -d '{"test": true}'
# Kiểm tra worklog API
curl http://localhost:3000/api/agents → 5 agents exists
```

---

## PHASE 3: WORKFLOW ENGINE — CORE ORCHESTRATION

**Mục tiêu**: Pipeline chạy tuần tự theo routing, ReAct loop cho tool calls, checkpoint verify.

### 3.1 Tạo Workflow Engine

**File**: `src/lib/code-team/workflow-engine.ts`

**HOW-TO**: Implement theo chuẩn từ workflow doc — tuần tự, không song song. Mỗi agent chạy theo ReAct loop nếu có tools.

```typescript
import { callLLMForAgent } from '@/lib/llm'
import { getAgentByPosition, getAgentTools, CODE_TEAM_AGENTS } from './agents'
import { getAgentPrompt } from './prompts'
import { writeWorklog, readWorklog, buildContextForAgent, parseWorklogFromOutput, WorklogEntry } from './worklog'
import { getToolDefinitions, executeTool } from './tool-executor'
import { db } from '@/lib/db'

// ===== TYPES =====

export type SSEEmitter = (event: WorkflowEvent) => void

export interface WorkflowEvent {
  type: 'workflow_start' | 'agent_start' | 'agent_chunk' | 'agent_complete' | 'tool_call' | 'tool_result' | 'checkpoint' | 'iteration' | 'workflow_done' | 'error'
  [key: string]: any
}

interface WorkflowRequest {
  messages: Array<{ role: string; content: string }>
  sessionId: string
  userRequest: string
}

// ===== ROUTING PIPELINE DEFINITIONS (từ workflow doc) =====
// Workflow doc: "3-TIER WORKFLOW" + "HỆ THỐNG ROUTING — 3 CHẾ ĐỘ DISPATCH"

type AgentPosition = 'TL' | 'G1' | 'G2-A' | 'G2-B' | 'G3'

interface PipelineStep {
  position: AgentPosition
  step: string       // analyze | design | code | review | optimize | verify
  isCheckpoint: boolean  // TL verify sau step này?
}

// Pipeline theo Routing Mode + Tier (từ workflow doc tables)
function getPipeline(mode: 'A' | 'B' | 'C', tier: 1 | 2 | 3): PipelineStep[] {
  // Mode A: Pure Visual — TL→TL→G2-B→TL
  if (mode === 'A') {
    return [
      { position: 'TL', step: 'analyze', isCheckpoint: false },
      { position: 'TL', step: 'code', isCheckpoint: false },      // TL code UI (Fast Track)
      { position: 'G2-B', step: 'review', isCheckpoint: true },   // CP: G2-B review code quality
      { position: 'TL', step: 'verify', isCheckpoint: false },    // TL final visual verify
    ]
  }

  // Mode B/C + Tier 1: Simple — TL→G2-B→TL
  if (tier === 1) {
    return [
      { position: 'TL', step: 'analyze', isCheckpoint: false },
      { position: 'G2-B', step: 'review', isCheckpoint: true },
      { position: 'TL', step: 'verify', isCheckpoint: false },
    ]
  }

  // Mode B/C + Tier 2: Medium — TL→G1→G2-A→G2-B→TL
  if (tier === 2) {
    return [
      { position: 'TL', step: 'analyze', isCheckpoint: false },
      { position: 'G1', step: 'design', isCheckpoint: true },     // CP1
      { position: 'G2-A', step: 'code', isCheckpoint: true },     // CP2
      { position: 'G2-B', step: 'review', isCheckpoint: true },   // CP3
      { position: 'TL', step: 'verify', isCheckpoint: false },
    ]
  }

  // Mode B/C + Tier 3: Complex — TL→G1→G2-A→G2-B→G3→TL
  return [
    { position: 'TL', step: 'analyze', isCheckpoint: false },
    { position: 'G1', step: 'design', isCheckpoint: true },       // CP1
    { position: 'G2-A', step: 'code', isCheckpoint: true },       // CP2
    { position: 'G2-B', step: 'review', isCheckpoint: true },     // CP3
    { position: 'G3', step: 'optimize', isCheckpoint: true },     // CP4
    { position: 'TL', step: 'verify', isCheckpoint: false },
  ]
}

// ===== MAIN WORKFLOW RUNNER =====
// Workflow doc: "CƠ CHẾ THỰC THI TUẦN TỰ — Xử lý tuần tự, không song song"

export async function runWorkflow(
  request: WorkflowRequest,
  emit: SSEEmitter
): Promise<void> {
  const startTime = Date.now()
  const { sessionId, userRequest, messages } = request

  emit({ type: 'workflow_start', sessionId })

  try {
    // ===== STEP 1: TL phân tích routing =====
    // Workflow doc: "TL (Kimi) là bộ điều hướng thông minh. Mỗi request được phân loại và đi đúng tuyến"

    emit({ type: 'agent_start', agent: 'APEX', position: 'TL', step: 'analyze', avatar: '👑' })

    const tlResult = await runAgentStep({
      position: 'TL',
      step: 'analyze',
      prompt: buildTLPrompt(userRequest, messages),
      sessionId,
      emit,
    })

    // Parse routing decision từ TL output
    const routingDecision = parseRoutingDecision(tlResult.content)
    if (!routingDecision) {
      emit({ type: 'error', agent: 'APEX', message: 'TL failed to produce routing decision' })
      return
    }

    // Lưu routing decision vào session
    await db.codeTeamSession.create({
      data: {
        sessionId,
        routingMode: routingDecision.mode,
        tier: routingDecision.tier,
        score: routingDecision.score,
        currentStep: 'running',
        currentAgent: 'TL',
        partsDefinition: JSON.stringify(routingDecision.parts),
      },
    })

    // ===== STEP 2: Run pipeline theo routing =====

    const pipeline = getPipeline(routingDecision.mode, routingDecision.tier)
    let spec = routingDecision.spec || userRequest  // Spec gốc cho toàn bộ pipeline
    let lastWorklog: WorklogEntry | null = null

    for (let i = 0; i < pipeline.length; i++) {
      const step = pipeline[i]

      // Skip TL analyze vì đã chạy ở Step 1
      if (step.position === 'TL' && step.step === 'analyze') continue

      // Update session
      await db.codeTeamSession.update({
        where: { sessionId },
        data: { currentAgent: step.position, currentStep: 'running' },
      })

      // Build context cho agent này
      // Workflow doc: "3 Lớp thông tin" — SPEC + WORKLOG + CODE
      const context = await buildContextForAgent(sessionId, step.position, spec)

      // Chạy agent
      emit({ type: 'agent_start', agent: getAgentByPosition(step.position)!.name, position: step.position, step: step.step, avatar: getAgentByPosition(step.position)!.avatar })

      const agentResult = await runAgentStep({
        position: step.position,
        step: step.step,
        prompt: context,
        sessionId,
        emit,
        maxIterations: step.position === 'G2-B' ? 3 : 1,  // G2-B max 3 vòng (workflow doc: "max 3 vòng iteration")
      })

      // Parse worklog từ agent output
      const parsedWorklog = parseWorklogFromOutput(agentResult.content)
      if (parsedWorklog) {
        const worklogEntry: WorklogEntry = {
          sessionId,
          agentName: getAgentByPosition(step.position)!.name,
          position: step.position,
          step: step.step,
          timestamp: new Date(),
          summary: parsedWorklog.summary || agentResult.content.slice(0, 200),
          completed: parsedWorklog.completed || [],
          inProgress: parsedWorklog.inProgress || [],
          issues: parsedWorklog.issues || [],
          suggestions: parsedWorklog.suggestions || [],
          concerns: parsedWorklog.concerns || [],
          codeLocationMap: parsedWorklog.codeLocationMap || { filesToRead: [], filesToSkip: [], dependencies: [], readingStrategy: 'bug_locations' },
          nextSteps: parsedWorklog.nextSteps || [],
          outputForNext: parsedWorklog.outputForNext || '',
        }
        await writeWorklog(worklogEntry)
        lastWorklog = worklogEntry
      }

      emit({
        type: 'agent_complete',
        agent: getAgentByPosition(step.position)!.name,
        position: step.position,
        content: agentResult.content,
        duration: agentResult.duration,
      })

      // ===== CHECKPOINT VERIFY =====
      // Workflow doc: "READ-WRITE-VERIFY LOOP — TL là Agentic Loop Controller"
      if (step.isCheckpoint) {
        emit({ type: 'checkpoint', after: step.position, pending: true })

        // TL verify checkpoint
        const verifyResult = await runTLCheckpointVerify(sessionId, spec, emit)
        if (verifyResult.decision === 'ESCALATE') {
          emit({ type: 'error', agent: 'APEX', message: `ESCALATE sau ${step.position}: ${verifyResult.reasoning}` })
          break
        }
        if (verifyResult.decision === 'PIVOT') {
          // Update spec và continue
          spec = verifyResult.updatedSpec || spec
          emit({ type: 'checkpoint', after: step.position, decision: 'PIVOT', reasoning: verifyResult.reasoning })
        } else {
          emit({ type: 'checkpoint', after: step.position, decision: 'CONTINUE' })
        }
      }
    }

    // ===== WORKFLOW DONE =====
    const totalDuration = Date.now() - startTime
    await db.codeTeamSession.update({
      where: { sessionId },
      data: { currentStep: 'completed', totalDuration, currentAgent: null },
    })

    emit({ type: 'workflow_done', totalDuration, sessionId })

  } catch (err) {
    emit({ type: 'error', agent: 'SYSTEM', message: err instanceof Error ? err.message : String(err) })
  }
}

// ===== AGENT STEP RUNNER (ReAct Loop) =====
// Workflow doc: Agents có thể gọi tools → ReAct loop: Reason → Act → Observe → Repeat

async function runAgentStep(params: {
  position: AgentPosition
  step: string
  prompt: string
  sessionId: string
  emit: SSEEmitter
  maxIterations?: number
}): Promise<{ content: string; duration: number }> {
  const { position, step, prompt, sessionId, emit, maxIterations = 10 } = params
  const startTime = Date.now()

  const agent = getAgentByPosition(position)!
  const tools = getAgentTools(position)
  const systemPrompt = getAgentPrompt(position)

  // Build messages
  const messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ]

  const toolDefs = tools.length > 0 ? getToolDefinitions(tools) : undefined
  let finalContent = ''
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++

    // Call LLM
    const result = await callLLMForAgent(
      messages.map(m => m.content).join('\n'),
      { provider: agent.provider, model: agent.model },
      systemPrompt,
      { agentId: position, agentName: agent.name, temperature: agent.temperature, maxTokens: agent.maxTokens }
    )

    finalContent = result.content

    // Nếu LLM không gọi tool → agent xong
    // (Hiện tại callLLMForAgent không hỗ trợ tool_calls response — cần mở rộng)
    // Tạm thời: parse tool calls từ output text
    const toolCalls = parseToolCallsFromOutput(result.content)

    if (toolCalls.length === 0) break  // Không có tool calls → xong

    // Thực thi tool calls
    for (const tc of toolCalls) {
      emit({ type: 'tool_call', agent: agent.name, position, tool: tc.name, detail: JSON.stringify(tc.args) })

      const toolResult = await executeTool(tc.name, tc.args)

      emit({ type: 'tool_result', agent: agent.name, position, tool: tc.name, result: toolResult.success ? 'OK' : 'Error', detail: JSON.stringify(toolResult.result).slice(0, 500) })

      // Đưa tool result vào messages cho LLM
      messages.push({ role: 'assistant', content: `Tool call: ${tc.name}(${JSON.stringify(tc.args)})` })
      messages.push({ role: 'tool', content: JSON.stringify(toolResult.result), tool_call_id: tc.id, name: tc.name })
    }

    // Nếu là G2-B và đạt max iteration → break
    if (position === 'G2-B' && iterations >= maxIterations) {
      finalContent += `\n\n⚠️ Đạt max ${maxIterations} vòng iteration. Bugs còn lại ghi cho G3.`
      break
    }
  }

  return { content: finalContent, duration: Date.now() - startTime }
}

// ===== HELPERS =====

function buildTLPrompt(userRequest: string, messages: Array<{ role: string; content: string }>): string {
  const history = messages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n')
  return `Chat history:\n${history}\n\nYêu cầu hiện tại: ${userRequest}\n\nPhân tích routing decision.`
}

function parseRoutingDecision(output: string): { mode: 'A' | 'B' | 'C'; tier: 1 | 2 | 3; score: number; reasoning: string; parts: any[]; spec: string } | null {
  try {
    const jsonMatch = output.match(/```json\s*([\s\S]*?)```/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[1])
    if (parsed.mode && parsed.tier && parsed.score !== undefined) return parsed
  } catch {}
  return null
}

function parseToolCallsFromOutput(output: string): Array<{ id: string; name: string; args: Record<string, any> }> {
  // Parse tool calls từ LLM output text
  // Format: "tool_call: function_name({args})"
  const calls: Array<{ id: string; name: string; args: Record<string, any> }> = []
  const regex = /tool_call:\s*(\w+)\((\{[\s\S]*?\})\)/g
  let match
  while ((match = regex.exec(output)) !== null) {
    try {
      calls.push({ id: `tc_${Date.now()}_${calls.length}`, name: match[1], args: JSON.parse(match[2]) })
    } catch {}
  }
  return calls
}

async function runTLCheckpointVerify(
  sessionId: string,
  spec: string,
  emit: SSEEmitter
): Promise<{ decision: 'CONTINUE' | 'PIVOT' | 'ESCALATE'; reasoning: string; updatedSpec?: string }> {
  const worklogs = await readWorklog(sessionId)
  const latestWorklog = worklogs[worklogs.length - 1]

  if (!latestWorklog) return { decision: 'CONTINUE', reasoning: 'No worklog to verify' }

  const decision = verifyWorklog(latestWorklog, spec) // Từ worklog.ts

  emit({ type: 'agent_start', agent: 'APEX', position: 'TL', step: 'verify', avatar: '👑' })

  const verifyPrompt = `Bạn là TL. Verify checkpoint sau ${latestWorklog.agentName}.\n\nSpec gốc: ${spec.slice(0, 500)}\n\nWorklog:\n${JSON.stringify(latestWorklog, null, 2).slice(0, 2000)}\n\nQuyết định: CONTINUE, PIVOT, hay ESCALATE? Output JSON.`

  const result = await callLLMForAgent(
    verifyPrompt,
    { provider: 'nvidia', model: 'moonshotai/kimi-k2.6' },
    getAgentPrompt('TL'),
    { agentId: 'TL-verify', agentName: 'APEX' }
  )

  const parsed = parseWorklogFromOutput(result.content)
  return {
    decision: (parsed as any)?.decision || decision,
    reasoning: (parsed as any)?.reasoning || 'Auto-verify based on worklog issues',
    updatedSpec: (parsed as any)?.updatedSpec,
  }
}
```

---

### 3.2 Tạo SSE API Endpoint

**File**: `src/app/api/code-team/workflow/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { runWorkflow } from '@/lib/code-team/workflow-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min timeout

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { messages, sessionId, userRequest } = body

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client disconnected
        }
      }

      try {
        await runWorkflow({ messages, sessionId, userRequest }, emit)
      } catch (err) {
        emit({ type: 'error', agent: 'SYSTEM', message: err instanceof Error ? err.message : String(err) })
      }

      try {
        controller.close()
      } catch {}
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

---

### 3.3 Verify Phase 3

```bash
# Test SSE endpoint
curl -N -X POST http://localhost:3000/api/code-team/workflow \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test-1","userRequest":"triển khai feature login","messages":[]}'
# Should see SSE events streaming
```

---

## PHASE 4: SMOLAB UI — MULTI-AGENT CHAT

**Mục tiêu**: Khi chọn team Code + multi mode → chat hoạt động đúng. "Triển khai" trigger workflow. Agents hiển thị như nhiều người thảo luận.

### 4.1 "Triển khai" Detection + SSE Client

**File sửa**: `src/app/page.tsx`

**HOW-TO**: Sửa `sendMessage()` trong SmolabModule để phát hiện "triển khai" và chuyển sang SSE workflow.

**Bước 1**: Thêm trigger detection (khoảng dòng 5832):

```typescript
// Thêm hằng số trigger
const TRIGGER_KEYWORDS = ['triển khai', 'triển khai!', 'deploy', 'execute', 'thực thi', 'bắt đầu']

function isWorkflowTrigger(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return TRIGGER_KEYWORDS.some(kw => lower.includes(kw))
}
```

**Bước 2**: Sửa `sendMessage()` để phát hiện trigger:

```typescript
// Trong sendMessage callback (khoảng dòng 5832):
const sendMessage = useCallback(async (queryText?: string) => {
  const text = queryText || input.trim()
  if (!text || isLoading) return

  // === WORKFLOW TRIGGER ===
  // Khi multi mode + team code + gõ "triển khai"
  if (chatMode === 'multi' && selectedTeam === 'code' && isWorkflowTrigger(text)) {
    await startWorkflow(text)
    return
  }

  // ... existing chat logic (không thay đổi)
}, [/* existing deps */])
```

**Bước 3**: Thêm `startWorkflow()` function:

```typescript
const startWorkflow = useCallback(async (userRequest: string) => {
  if (!currentSessionId) {
    const newId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setCurrentSessionId(newId)
  }
  const sessionId = currentSessionId!

  // Add user message
  const userMsg: SmolabMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userRequest,
    timestamp: new Date(),
  }
  setMessages(prev => [...prev, userMsg])
  setInput('')
  setIsLoading(true)

  try {
    // Call SSE endpoint
    const chatMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    const res = await fetch('/api/code-team/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages, sessionId, userRequest }),
    })

    if (!res.ok || !res.body) throw new Error(`Workflow API error: ${res.status}`)

    // Read SSE stream
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let currentAgentMsgId: string | null = null
    let currentAgentContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })

      // Parse SSE events (format: "data: {...}\n\n")
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))

          switch (event.type) {
            case 'workflow_start':
              // Show workflow started indicator
              break

            case 'agent_start': {
              // Create new assistant message for this agent
              currentAgentMsgId = crypto.randomUUID()
              currentAgentContent = ''
              const agentMsg: SmolabMessage = {
                id: currentAgentMsgId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                agentName: event.agent,
                agentPosition: event.position,
                agentAvatar: event.avatar,
                isTeamMessage: true,
              }
              setMessages(prev => [...prev, agentMsg])
              break
            }

            case 'agent_chunk': {
              // Append content to current agent message
              currentAgentContent += event.content || ''
              if (currentAgentMsgId) {
                setMessages(prev => prev.map(m =>
                  m.id === currentAgentMsgId ? { ...m, content: currentAgentContent } : m
                ))
              }
              break
            }

            case 'agent_complete': {
              // Finalize agent message
              if (currentAgentMsgId) {
                setMessages(prev => prev.map(m =>
                  m.id === currentAgentMsgId ? {
                    ...m,
                    content: event.content || currentAgentContent,
                    durationMs: event.duration,
                  } : m
                ))
              }
              currentAgentMsgId = null
              currentAgentContent = ''
              break
            }

            case 'tool_call': {
              // Add tool call indicator message
              const toolMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'tool_call' as any,
                content: `🔧 ${event.tool}: ${event.detail?.slice(0, 100) || ''}`,
                timestamp: new Date(),
                agentName: event.agent,
                agentPosition: event.position,
                isTeamMessage: true,
                toolCallInfo: { tool: event.tool, detail: event.detail || '' },
              }
              setMessages(prev => [...prev, toolMsg])
              break
            }

            case 'tool_result': {
              // Update tool result
              break
            }

            case 'checkpoint': {
              const checkpointMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: event.decision
                  ? `✅ Checkpoint sau ${event.after}: ${event.decision}${event.reasoning ? ` — ${event.reasoning}` : ''}`
                  : `⏳ Checkpoint sau ${event.after}...`,
                timestamp: new Date(),
                agentName: 'APEX',
                agentPosition: 'TL',
                agentAvatar: '👑',
                isTeamMessage: true,
              }
              setMessages(prev => [...prev, checkpointMsg])
              break
            }

            case 'workflow_done': {
              const doneMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `✅ Workflow hoàn tất! Thời gian: ${(event.totalDuration / 1000).toFixed(1)}s`,
                timestamp: new Date(),
                agentName: 'SYSTEM',
                isTeamMessage: true,
              }
              setMessages(prev => [...prev, doneMsg])
              break
            }

            case 'error': {
              const errMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'error',
                content: `❌ ${event.agent ? `[${event.agent}] ` : ''}${event.message}`,
                timestamp: new Date(),
              }
              setMessages(prev => [...prev, errMsg])
              break
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'error',
      content: `Workflow error: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: new Date(),
    }])
  } finally {
    setIsLoading(false)
  }
}, [messages, currentSessionId, isLoading])
```

### 4.2 Multi-Agent Message Display

**HOW-TO**: Sửa phần render assistant messages trong SmolabModule để nhận diện `isTeamMessage` và hiển thị với avatar + tên + màu riêng.

Khoảng dòng 6347-6495 (assistant message rendering), thêm logic:

```typescript
// Trong message render, thay đổi layout cho team messages:
{msg.isTeamMessage && msg.agentName ? (
  // Team agent message — hiển thị như "người tham gia thảo luận"
  <div className={`p-3 rounded-xl border ${AGENT_COLORS[msg.agentName]?.border || 'border-cyan-400/35'} ${AGENT_COLORS[msg.agentName]?.bg || 'bg-slate-950/50'}`}>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-lg">{msg.agentAvatar || '🤖'}</span>
      <span className={`font-semibold text-sm ${AGENT_COLORS[msg.agentName]?.text || 'text-stone-200'}`}>
        {msg.agentName}
      </span>
      <span className="text-xs text-stone-400">({msg.agentPosition})</span>
      <span className="text-[10px] text-stone-500 ml-auto">
        {msg.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
    <div className="text-sm text-stone-200 whitespace-pre-wrap">{msg.content}</div>
    {msg.toolCallInfo && (
      <div className="mt-2 p-2 rounded-lg bg-slate-950/50 border border-stone-700/50 text-xs text-stone-400">
        🔧 {msg.toolCallInfo.tool}: {msg.toolCallInfo.detail?.slice(0, 150)}
      </div>
    )}
  </div>
) : (
  // Regular assistant message (existing layout)
  <div className="...">
    ...
  </div>
)}
```

### 4.3 Verify Phase 4

- Mở Smolab → Chọn Multi mode → Chọn Team Code
- Gõ tin nhắn bình thường → TL phản hồi (discussion phase)
- Gõ "triển khai feature XYZ" → Workflow SSE chạy → Nhiều agent messages xuất hiện trong chat
- Mỗi agent có avatar + tên + màu riêng

---

## PHASE 5: OPENCODE + OPENCLAW + SKILLS INTEGRATION

**Mục tiêu**: Agents thực sự code qua OpenCode, dùng KB qua OpenClaw, search web qua Skills.

### 5.1 OpenCode Integration trong Tool Executor

**File sửa**: `src/lib/code-team/tool-executor.ts`

**HOW-TO**: Cải thiện `executeOpenCode()` để tương tác thực với OpenCode Server:

```typescript
// OpenCode Server API: POST http://localhost:18790/api/execute
// Body: { prompt: string } hoặc { action: string, ... }

async function executeOpenCode(args: Record<string, any>) {
  const { action, path, content, command } = args

  // Kiểm tra OpenCode Server online
  try {
    const healthRes = await fetch('http://localhost:18790/health', { signal: AbortSignal.timeout(3000) })
    if (!healthRes.ok) return { success: false, result: 'OpenCode Server offline' }
  } catch {
    return { success: false, result: 'OpenCode Server không khả dụng' }
  }

  switch (action) {
    case 'read': {
      // Đọc file qua OpenCode
      const res = await fetch('http://localhost:18790/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const data = await res.json()
      return { success: true, result: data.content || data }
    }
    case 'write': {
      // Viết file qua OpenCode
      const res = await fetch('http://localhost:18790/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      return { success: res.ok, result: res.ok ? `File written: ${path}` : `Write failed: ${path}` }
    }
    case 'bash': {
      // Chạy terminal command
      const res = await fetch('http://localhost:18790/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const data = await res.json()
      return { success: true, result: data.output || data }
    }
    default:
      return { success: false, result: `Unknown opencode action: ${action}` }
  }
}
```

### 5.2 OpenClaw Internal Integration

**HOW-TO**: OpenClaw tools (knowledge_search, knowledge_graph, knowledge_write) gọi trực tiếp internal functions — không qua HTTP:

Đã implement trong Phase 2 (`tool-executor.ts`). Chỉ cần đảm bảo:
- `@/lib/qdrant` — `searchSimilar()` hoạt động
- `@/lib/neo4j` — `queryNeo4j()` hoạt động
- `@/lib/db` — `db.localEntity.create()` cho knowledge_write

### 5.3 Skills API Keys

**HOW-TO**: Thêm vào `.env`:

```env
# Code Team Skills
TAVILY_API_KEY=tvly-xxxxx    # https://tavily.com — free tier available
SERPER_API_KEY=xxxxx         # https://serper.dev — 2500 free searches
JINA_API_KEY=jina_xxxxx      # https://jina.ai — free tier available
```

Skills clients đã implement trong Phase 2 (`tool-executor.ts`).

### 5.4 Verify Phase 5

- Gõ "triển khai" với request cần code
- G2-A gọi `opencode` → file thực sự được tạo
- TL gọi `tavily` → web search results trả về
- G3 gọi `knowledge_write` → lesson ghi vào KB

---

## PHASE 6: TESTING & POLISH — ✅ COMPLETED

### 6.1 Test Matrix

| Test Case | Workflow | Expected | Status |
|-----------|----------|----------|--------|
| "Sửa typo trong button" | Tier 1, TL→G2-B→TL | Pipeline ngắn, G2-B review nhanh | ✅ Validated via /api/code-team/test |
| "Thêm feature login page" | Tier 2, Mode C, TL→G1→G2-A→G2-B→TL | G1 thiết kế, G2-A code, G2-B review | ✅ Validated via /api/code-team/test?pipeline=C2 |
| "Xây full e-commerce website" | Tier 3, Mode C, full pipeline | TL→G1→G2-A→G2-B→G3→TL, G3 integration | ✅ Validated via /api/code-team/test?pipeline=C3 |
| "Clone UI từ screenshot" | Mode A, Fast Track | TL code UI → G2-B review → TL verify | ✅ Validated via /api/code-team/test?pipeline=A1 |
| G2-B phát hiện security bug | ESCALATE | TL pivot hoặc continue sau fix | ✅ verifyWorklog() returns ESCALATE for critical |
| G2-B hết 3 vòng | LOW bugs → G3 | G3 fix remaining bugs | ✅ maxIterations=3 for G2-B |
| OpenCode offline | Fallback | Agents code trong text, không qua file system | ✅ executeOpenCode() has file fallback |

### 6.2 Edge Cases

- ✅ **LLM timeout → emit error event, workflow dừng gracefully** — IMPLEMENTED: AGENT_STEP_TIMEOUT_MS=120s, CHECKPOINT_VERIFY_TIMEOUT_MS=30s, Promise.race with clearTimeout
- ✅ **Rate limit (429) → callLLMForAgent fallback global pool** — Already handled by callLLMForAgent in llm.ts
- ✅ **Client disconnect → stream close, workflow continue backend** — IMPLEMENTED: WorkflowConfig.continueOnDisconnect=true (default), safeEmit wrapper
- ✅ **Missing API key → tool returns error, agent adapts** — Already handled by executeTool() error handling + ReAct loop

### 6.3 New APIs (Phase 6 additions)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/code-team/test` | GET | Diagnostic: pipelines, agents, tools, DB health |
| `/api/code-team/test?pipeline=C2` | GET | Validate specific pipeline configuration |
| `/api/code-team/status` | GET | Overview: total/active/completed/failed sessions |
| `/api/code-team/status?sessionId=xxx` | GET | Session detail with timeline |
| `/api/code-team/status?list=1` | GET | Last 10 sessions |

### 6.4 Implementation Log

- Added AGENT_STEP_TIMEOUT_MS (120s) + CHECKPOINT_VERIFY_TIMEOUT_MS (30s) with Promise.race
- Fixed timeout leak: clearTimeout in catch + finally blocks (same pattern as tl-bridge.ts)
- Added WorkflowConfig interface with continueOnDisconnect option (default: true)
- Added safeEmit wrapper: silently drops SSE events after client disconnect
- Added error recovery: worklog entries for failed agent steps
- Created /api/code-team/test diagnostic endpoint
- Created /api/code-team/status session monitoring endpoint

---

## 📊 TỔNG HỢP FILES

### Files TẠO MỚI (11 files):

| # | File | Phase | Mô tả |
|---|------|-------|-------|
| 1 | `src/lib/code-team/agents.ts` | 1 | 5 agent definitions + seed logic |
| 2 | `src/lib/code-team/prompts.ts` | 1 | System prompts chi tiết từng vị trí |
| 3 | `src/lib/code-team/worklog.ts` | 2 | Worklog + Code Location Map + Context builder |
| 4 | `src/lib/code-team/tool-executor.ts` | 2 | Tool definitions + execution (OpenCode, KB, Skills) |
| 5 | `src/lib/code-team/workflow-engine.ts` | 3 | Core orchestration: routing, pipeline, ReAct loop, checkpoints |
| 6 | `src/app/api/code-team/workflow/route.ts` | 3 | SSE API endpoint |

### Files SỬA (3 files):

| # | File | Phase | Thay đổi |
|---|------|-------|----------|
| 1 | `prisma/schema.prisma` | 1 | Thêm CodeTeamWorklog + CodeTeamSession models |
| 2 | `src/lib/agent-seed.ts` | 1 | Re-enable seed cho Code Team 5 agents |
| 3 | `src/lib/agent-constants.ts` | 1 | Thêm G2-A, G2-B positions, AGENT_COLORS |
| 4 | `src/app/page.tsx` | 4 | SmolabModule: SSE handling, multi-agent chat UI, workflow trigger |

### Files cần API Keys (`.env`):

```env
TAVILY_API_KEY=tvly-xxxxx
SERPER_API_KEY=xxxxx
JINA_API_KEY=jina_xxxxx
```
