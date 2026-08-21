# Kế hoạch Triển khai — Giải quyết 2 Vấn đề Critical

> **Created**: 2025-08-01
> **Reference**: `docs/critical-issues-resolution.md`, `docs/code-team-workflow.md`
> **Mục tiêu**: Triển khai kiến trúc "Smart Bridge" giải quyết C1 (Auto-seeding Conflict) + C2 ("Triển khai" Keyword Trigger)

---

## 📊 PHÂN TÍCH HIỆN TRẠNG

### Codebase hiện có

| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `src/lib/code-team/agents.ts` | ✅ Đã có | 5 agents hardcoded, `ensureCodeTeamAgents()` hoạt động, `getAgentByPosition()` dùng hardcoded |
| `src/lib/code-team/workflow-engine.ts` | ✅ Đã có | Pipeline orchestration, ReAct loop, checkpoint verify |
| `src/lib/code-team/worklog.ts` | ✅ Đã có | WRITE/READ/VERIFY, buildContextForAgent() |
| `src/lib/code-team/prompts.ts` | ✅ Đã có | 5 system prompts cho TL/G1/G2-A/G2-B/G3 |
| `src/lib/code-team/tool-executor.ts` | ✅ Đã có | 7 tools + z-ai-sdk fallback |
| `src/app/api/code-team/workflow/route.ts` | ✅ Đã có | SSE endpoint cho workflow |
| `src/lib/agent-seed.ts` | ✅ Đã có | Re-export từ code-team/agents.ts |
| `src/app/page.tsx` | ✅ Đã có | `TRIGGER_KEYWORDS` + `startWorkflow()` + SSE reader |

### Vấn đề C1: Auto-seeding Conflict — Phân tích sâu

**Thực tế hiện tại** (sau khi đọc code):

```
workflow-engine.ts:
  const agentDef = getAgentByPosition('TL')!   ← Dùng CODE_TEAM_AGENTS hardcoded
  const tools = getAgentTools(position)          ← Dùng CODE_TEAM_AGENTS hardcoded
  callLLMForAgent(prompt, { provider: agent.provider, model: agent.model }, ...)
                                                  ← Dùng hardcoded provider/model
```

→ Workflow Engine hiện tại KHÔNG crash khi DB thiếu agents — vì nó dùng hardcoded definitions.

**NHƯNG vấn đề thực sự là**:

1. **Workflow chạy nhưng không có DB records** → Agents không xuất hiện trong UI → User không thể customize
2. **ensureCodeTeamAgents() tạo agents với isSystem=true** → User KHÔNG thể xóa → Mâu thuẫn với yêu cầu Task 14
3. **Nếu user đã tạo agent cùng tên nhưng khác config** → Hardcoded ghi đè → Mất tùy chỉnh
4. **Không có graceful degradation** → Nếu position không hợp lệ → `undefined!` → Crash

**Giải pháp C1 cần đảm bảo**:
- ✅ Workflow luôn chạy được (dù DB không có agents)
- ✅ User có thể tùy chỉnh/xóa agents (isSystem=false)
- ✅ DB-first: Ưu tiên config từ DB nếu user đã tạo
- ✅ Hardcode fallback: Luôn có definitions để dùng khi DB trống
- ✅ Lazy seeding: Chỉ tạo khi workflow cần, không tạo lúc startup

### Vấn đề C2: "Triển khai" Keyword Trigger — Phân tích sâu

**Thực tế hiện tại** (sau khi đọc code):

```typescript
// page.tsx line 5841
const TRIGGER_KEYWORDS = ['triển khai', 'triển khai!', 'deploy', 'execute', 'thực thi', 'bắt đầu']

function isWorkflowTrigger(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return TRIGGER_KEYWORDS.some(kw => lower.includes(kw))
}
```

→ Chỉ cần CHỨA từ khóa → trigger. Ví dụ "hãy triển khai" cũng trigger.

**Vấn đề**:

1. **Không Discoverable**: User mới không biết phải gõ "triển khai" — không có UI hint
2. **Language-Dependent**: Đã mở rộng hơn (có deploy, execute) nhưng vẫn thiếu nhiều từ khóa
3. **Context-Ignorant**: TL không được cơ hội đánh giá → Request đơn giản vẫn chạy workflow → Lãng phí tokens
4. **Workflow Doc Mismatch**: Doc nói "TL tự quyết" nhưng thực tế TL chỉ được hỏi SAU khi user trigger

**Giải pháp C2 cần đảm bảo**:
- ✅ TL chủ động đánh giá request (trước khi trigger workflow)
- ✅ User được hỏi trước khi workflow chạy (Suggestion Card)
- ✅ Backward compatible: "triển khai" vẫn hoạt động
- ✅ Mở rộng keywords đa ngôn ngữ
- ✅ Discoverable: UI hiển thị gợi ý

---

## 🏗️ PHÂN CHIA PHASE TRIỂN KHAI

### Tổng quan 4 Phases

```
Phase 1: Agent Resolution Layer (C1)
  → Backend: Workflow luôn chạy được, lazy seeding, DB-first
  → Ưu tiên: CRITICAL — Nền tảng cho workflow

Phase 2: Smart TL Bridge (C2)
  → Backend: TL tự đánh giá request, đề xuất workflow
  → Ưu tiên: CRITICAL — TL chủ động thay vì passive

Phase 3: Frontend Suggestion Card (C2)
  → Frontend: UI cho TL đề xuất, user chấp nhận/từ chối
  → Ưu tiên: HIGH — Cần cho UX discoverable

Phase 4: Integration & Polish
  → Testing, edge cases, backward compat, documentation
  → Ưu tiên: MEDIUM — Đảm bảo chất lượng
```

---

## PHASE 1: AGENT RESOLUTION LAYER (C1)

**Mục tiêu**: Workflow luôn chạy được, bất kể DB có agents hay không. User kiểm soát agents.

**Thời gian dự kiến**: 1 session

### 1.1 Tạo Agent Resolver

**File mới**: `src/lib/code-team/agent-resolver.ts`

```typescript
// Kiến trúc: resolveAgent(position) → DB first → Hardcoded fallback → Missing

export interface ResolvedAgent {
  id?: string           // DB agent ID (nếu có)
  name: string          // Agent name
  position: string      // TL | G1 | G2-A | G2-B | G3
  provider: string      // LLM provider
  model: string         // LLM model
  temperature: number
  maxTokens: number
  instruction: string   // System prompt
  tools: string[]       // Tool permissions
  source: 'database' | 'hardcoded' | 'missing'
}

export async function resolveAgent(position: string): Promise<ResolvedAgent> {
  // Step 1: Tìm trong DB
  const dbAgent = await db.agentProfile.findFirst({
    where: { team: 'code', position, enabled: true }
  })
  if (dbAgent) return { ...dbAgent, source: 'database' }

  // Step 2: Fallback to hardcoded + Lazy seed (isSystem=false)
  const hardcoded = getAgentByPosition(position)
  if (hardcoded) {
    const newAgent = await db.agentProfile.create({
      data: { ...hardcoded, isSystem: false, enabled: true }
    })
    return { ...hardcoded, id: newAgent.id, source: 'hardcoded' }
  }

  // Step 3: Không tìm thấy
  return { name: `Unknown-${position}`, position, source: 'missing', ... }
}
```

**Điểm mấu chốt**:
- **DB-first**: Nếu user đã tạo agent với position đúng → dùng config của user
- **Lazy seed**: Chỉ tạo agent KHI workflow cần, `isSystem=false` → user có thể xóa
- **Missing handling**: Trả về object với source='missing' → caller quyết định xử lý

### 1.2 Cập nhật Workflow Engine

**File sửa**: `src/lib/code-team/workflow-engine.ts`

Thay đổi:
- Thay `getAgentByPosition('TL')!` → `await resolveAgent('TL')` (tại mọi nơi dùng)
- Thêm xử lý khi `resolvedAgent.source === 'missing'`:
  - Emit SSE event `agent_missing` với position
  - Fallback: Dùng hardcoded definition (để workflow không crash)
  - Log warning

```typescript
// Trước:
const agentDef = getAgentByPosition('TL')!

// Sau:
const resolvedAgent = await resolveAgent('TL')
if (resolvedAgent.source === 'missing') {
  emit({ type: 'error', agent: 'SYSTEM', message: `Agent cho vị trí TL không tồn tại` })
  // Fallback to hardcoded definition
}
```

**Số lượng thay đổi**: ~8 chỗ trong workflow-engine.ts cần sửa:
1. `runWorkflow()` — TL analyze step (line 198)
2. `runPipeline()` — Mỗi pipeline step (line 363)
3. `runAgentStep()` — Agent definition (line 487)
4. `runTLCheckpointVerify()` — TL verify step (line 682)

### 1.3 Cập nhật Agent Seed

**File sửa**: `src/lib/agent-seed.ts`

Thay đổi:
- `ensureSystemAgents()` → KHÔNG tự động seed Code Team agents
- Chỉ re-export `resolveAgent()` cho backward compat
- Giữ `forceReseedCodeTeam()` cho user chủ động yêu cầu

### 1.4 Verify Phase 1

- [ ] Workflow chạy khi DB TRỐNG (không agents) → Hardcoded fallback
- [ ] Workflow chạy khi DB CÓ agents → DB-first
- [ ] Lazy seed tạo agents với isSystem=false → User có thể xóa
- [ ] User xóa lazy-seeded agent → Workflow vẫn chạy (hardcoded fallback)
- [ ] Lint pass, TypeScript pass

---

## PHASE 2: SMART TL BRIDGE (C2)

**Mục tiêu**: TL tự đánh giá request và đề xuất workflow, thay vì user phải biết từ khóa.

**Thời gian dự kiến**: 1 session

### 2.1 Tạo TL Bridge

**File mới**: `src/lib/code-team/tl-bridge.ts`

```typescript
// Kiến trúc: assessRequest(message, history) → SIMPLE | CODE_TEAM

export interface TLAssessment {
  decision: 'SIMPLE' | 'CODE_TEAM'
  reasoning: string
  routing?: {
    mode: 'A' | 'B' | 'C'
    tier: 1 | 2 | 3
    score: number
    reasoning: string
  }
  suggestion?: string       // Gợi ý ngắn nếu CODE_TEAM
  directAnswer?: string     // Câu trả lời trực tiếp nếu SIMPLE
}

export async function assessRequest(
  userMessage: string,
  chatHistory: Array<{role: string; content: string}>
): Promise<TLAssessment>
```

**Cách hoạt động**:
1. Gửi request đến TL (single LLM call, nhanh ~2-3s)
2. TL đánh giá: SIMPLE (chat bình thường) hay CODE_TEAM (cần workflow)
3. Nếu CODE_TEAM → trả kèm routing suggestion (mode, tier, score)
4. Nếu SIMPLE → trả kèm directAnswer (TL có thể trả lời luôn)

**Prompt thiết kế**:
```
Bạn là APEX — Team Lead của Code Team.
Nhiệm vụ: Đánh giá xem request của user có cần Code Team workflow hay không.

QUYẾT ĐỊNH:
- SIMPLE: Hỏi thông tin, chat bình thường, kiến thức chung → Trả lời trực tiếp
- CODE_TEAM: Yêu cầu code, tạo tính năng, sửa bug phức tạp, xây dựng hệ thống → Cần Code Team

OUTPUT FORMAT (JSON):
{ decision, reasoning, routing?, suggestion?, directAnswer? }
```

### 2.2 Tạo Assess API Endpoint

**File mới**: `src/app/api/code-team/assess/route.ts`

```typescript
// POST /api/code-team/assess
// Request: { message: string, chatHistory: Array<{role, content}> }
// Response: { assessment: TLAssessment }

export async function POST(request: NextRequest) {
  const { message, chatHistory } = await request.json()
  const assessment = await assessRequest(message, chatHistory)
  return Response.json({ assessment })
}
```

**Tại sao cần endpoint riêng**:
- Frontend cần gọi assessment TRƯỚC khi quyết định trigger workflow
- Không phải SSE — chỉ là POST thông thường, response nhanh
- Tách biệt với workflow SSE stream

### 2.3 Cập nhật Workflow Route (Optional Enhancement)

**File sửa**: `src/app/api/code-team/workflow/route.ts`

Thay đổi (optional):
- Chấp nhận `routing` parameter từ client (nếu TL đã assess)
- Nếu có routing → skip TL analyze step → Bắt đầu pipeline luôn
- Nếu không có routing → TL phân tích như hiện tại

### 2.4 Verify Phase 2

- [ ] `/api/code-team/assess` hoạt động
- [ ] "Hãy tạo cho tôi trang login" → CODE_TEAM
- [ ] "Thời tiết hôm nay thế nào?" → SIMPLE
- [ ] "Sửa bug trong hàm calculateTotal" → CODE_TEAM
- [ ] "Hello" → SIMPLE
- [ ] Assessment trả về routing đúng (mode, tier)
- [ ] Lint pass, TypeScript pass

---

## PHASE 3: FRONTEND SUGGESTION CARD (C2)

**Mục tiêu**: UI hiển thị TL đề xuất workflow, user chấp nhận/từ chối. Backward compatible.

**Thời gian dự kiến**: 1 session

### 3.1 Tích hợp TL Assessment vào Chat Flow

**File sửa**: `src/app/page.tsx`

**Flow mới** (khi chatMode='multi' + team='code'):

```
User gửi tin nhắn
  │
  ├─ Cách 1: Keyword shortcut (backward compatible)
  │   → "triển khai", "deploy", "implement", "build" → Trigger workflow trực tiếp
  │
  └─ Cách 2: Smart TL Assessment (default)
      → Gọi POST /api/code-team/assess
      → SIMPLE → Hiển thị TL trả lời bình thường
      → CODE_TEAM → Hiển thị Suggestion Card
```

**Keyword mở rộng** (thay cho hiện tại):
```typescript
const DEPLOY_KEYWORDS = [
  // Tiếng Việt
  'triển khai', 'thực hiện', 'xây dựng', 'phát triển',
  'tạo', 'code', 'lập trình',
  // English
  'deploy', 'implement', 'build this', 'create this',
  'develop', 'code this', 'make this',
]
```

### 3.2 Tạo Suggestion Card Component

**Trong page.tsx** — Component inline:

```tsx
{message.isWorkflowSuggestion && (
  <div className="mt-2 p-3 rounded-lg border border-amber-500/30 bg-amber-950/20">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-amber-400 text-sm font-medium">🚀 APEX đề xuất Code Team</span>
    </div>
    <p className="text-sm text-gray-300 mb-2">{message.suggestionText}</p>
    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
      <span>Mode: {message.routingMode}</span>
      <span>|</span>
      <span>Tier: {message.routingTier}</span>
      <span>|</span>
      <span>Score: {message.routingScore}</span>
    </div>
    <div className="flex gap-2">
      <button onClick={() => acceptSuggestion(message.id)}
        className="px-3 py-1.5 text-xs bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30">
        ✅ Triển khai
      </button>
      <button onClick={() => rejectSuggestion(message.id)}
        className="px-3 py-1.5 text-xs bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30">
        ❌ Không
      </button>
    </div>
  </div>
)}
```

### 3.3 Cập nhật Message Types

**Thêm vào SmolabMessage interface**:
```typescript
interface SmolabMessage {
  // ... existing fields ...
  isWorkflowSuggestion?: boolean
  suggestionText?: string
  routingMode?: string
  routingTier?: number
  routingScore?: number
  assessmentId?: string  // Để match khi user accept
}
```

### 3.4 Xử lý Accept/Reject

```typescript
async function acceptSuggestion(messageId: string) {
  // Tìm message có suggestion
  const msg = messages.find(m => m.id === messageId)
  if (!msg) return

  // Trigger workflow với routing từ TL assessment
  startWorkflow(msg.content, msg.assessmentRouting)
}

function rejectSuggestion(messageId: string) {
  // Xóa suggestion card, hiển thị "Đã từ chối"
  setMessages(prev => prev.map(m =>
    m.id === messageId
      ? { ...m, isWorkflowSuggestion: false, content: '✅ Đã hủy Code Team workflow.' }
      : m
  ))
}
```

### 3.5 Cập nhật Chat Flow trong handleSendMessage

**File sửa**: `src/app/page.tsx`

```typescript
// Trong hàm handleSendMessage hoặc tương đương:

// 1. Check keyword shortcut (backward compatible)
if (isWorkflowTrigger(text)) {
  startWorkflow(text)
  return
}

// 2. Nếu multi mode + team code → TL Assessment
if (chatMode === 'multi' && selectedTeam === 'code') {
  // Gọi assessment API
  const assessRes = await fetch('/api/code-team/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, chatHistory: recentMessages }),
  })
  const { assessment } = await assessRes.json()

  if (assessment.decision === 'CODE_TEAM') {
    // Hiển thị suggestion card
    const suggestionMsg: SmolabMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: text,
      timestamp: new Date(),
      isTeamMessage: true,
      agentName: 'APEX',
      agentPosition: 'TL',
      agentAvatar: '👑',
      isWorkflowSuggestion: true,
      suggestionText: assessment.suggestion,
      routingMode: assessment.routing?.mode,
      routingTier: assessment.routing?.tier,
      routingScore: assessment.routing?.score,
    }
    setMessages(prev => [...prev, userMsg, suggestionMsg])
  } else {
    // SIMPLE → Hiển thị TL trả lời trực tiếp
    const tlAnswer: SmolabMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assessment.directAnswer || '...',
      timestamp: new Date(),
      isTeamMessage: true,
      agentName: 'APEX',
      agentPosition: 'TL',
      agentAvatar: '👑',
    }
    setMessages(prev => [...prev, userMsg, tlAnswer])
  }
  return
}

// 3. Chat bình thường (single mode hoặc team khác)
// ... existing code ...
```

### 3.6 Verify Phase 3

- [ ] "Hãy tạo trang login" (không có keyword) → Suggestion Card hiện ra
- [ ] Click "Triển khai" → Workflow chạy
- [ ] Click "Không" → Suggestion biến mất
- [ ] "triển khai tính năng login" → Trigger trực tiếp (backward compat)
- [ ] Single mode chat → Không gọi assessment → Chat bình thường
- [ ] Suggestion Card hiển thị đúng routing (Mode, Tier, Score)
- [ ] Lint pass, TypeScript pass

---

## PHASE 4: INTEGRATION & POLISH

**Mục tiêu**: End-to-end testing, edge cases, backward compatibility, documentation.

**Thời gian dự kiến**: 0.5 session

### 4.1 Integration Testing

**Test scenarios**:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | DB trống + trigger workflow | Hardcoded fallback → Lazy seed → Workflow chạy |
| 2 | DB có agents + trigger workflow | DB-first config → Workflow chạy |
| 3 | User xóa lazy-seeded agent → trigger lại | Lazy seed lại → Workflow chạy |
| 4 | Chat "Hello" (multi + code team) | SIMPLE → TL trả lời bình thường |
| 5 | Chat "Tạo API endpoint" (multi + code team) | CODE_TEAM → Suggestion Card |
| 6 | Chat "triển khai" | Trigger workflow trực tiếp |
| 7 | Chat "deploy login feature" | Trigger workflow trực tiếp |
| 8 | Accept Suggestion Card | Workflow chạy với routing từ TL |
| 9 | Reject Suggestion Card | Chat tiếp tục bình thường |
| 10 | Workflow abort (client disconnect) | Session marked failed |

### 4.2 Edge Cases

- [ ] Agent assessment timeout → Fallback to keyword matching
- [ ] LLM không trả JSON hợp lệ từ assessment → Fallback SIMPLE
- [ ] Workflow engine gặp `source=missing` agent → Emit error, không crash
- [ ] DB có agent nhưng disabled → Skip, dùng hardcoded
- [ ] User gửi tin nhắn rất dài → Chat history truncated cho assessment
- [ ] Concurrent workflows → Session isolation

### 4.3 Performance Optimization

- [ ] Cache TL assessment cho cùng request (tránh gọi LLM lại)
- [ ] Assessment timeout: max 5s → fallback SIMPLE
- [ ] Lazy seed cache: Không tạo lại nếu đã tạo trong session

### 4.4 Documentation Update

- [ ] Cập nhật `docs/code-team-implementation-plan.md` với Phase 7
- [ ] Cập nhật worklog.md
- [ ] Xóa `docs/critical-issues-resolution.md` hoặc mark as RESOLVED

---

## 📁 TÓM TẮT FILES CẦN TẠO/SỬA

### Phase 1: Agent Resolution Layer (C1)

| # | File | Action | Mô tả |
|---|------|--------|--------|
| 1.1 | `src/lib/code-team/agent-resolver.ts` | **NEW** | Agent Resolution Layer — resolve agent từ DB → Hardcoded → Missing |
| 1.2 | `src/lib/code-team/workflow-engine.ts` | **MODIFY** | Dùng resolveAgent() thay getAgentByPosition() (~8 chỗ) |
| 1.3 | `src/lib/agent-seed.ts` | **MODIFY** | Disable auto-seed, export resolveAgent |

### Phase 2: Smart TL Bridge (C2)

| # | File | Action | Mô tả |
|---|------|--------|--------|
| 2.1 | `src/lib/code-team/tl-bridge.ts` | **NEW** | TL Assessment — đánh giá request, đề xuất workflow |
| 2.2 | `src/app/api/code-team/assess/route.ts` | **NEW** | API endpoint cho TL Assessment (POST) |
| 2.3 | `src/app/api/code-team/workflow/route.ts` | **MODIFY** | Chấp nhận routing từ TL Assessment (optional) |

### Phase 3: Frontend Suggestion Card (C2)

| # | File | Action | Mô tả |
|---|------|--------|--------|
| 3.1 | `src/app/page.tsx` | **MODIFY** | Suggestion Card UI + TL Assessment flow + keyword mở rộng |

### Phase 4: Integration & Polish

| # | File | Action | Mô tả |
|---|------|--------|--------|
| 4.1 | N/A | **TEST** | End-to-end integration testing |
| 4.2 | docs | **UPDATE** | Documentation updates |

---

## 🎯 DEPENDENCY MAP

```
Phase 1 (C1: Agent Resolution Layer)
  │
  ├─ Phase 2 (C2: TL Bridge) ← Không phụ thuộc Phase 1
  │    │                       nhưng nên làm sau để test tốt hơn
  │    └─ Phase 3 (Frontend) ← PHỤ THUỘC Phase 2
  │
  └─ Phase 4 (Integration) ← PHỤ THUỘC Phase 1 + 2 + 3
```

**Lưu ý**: Phase 1 và Phase 2 CÓ THỂ làm song song (không phụ thuộc code). Nhưng Phase 3 cần Phase 2 (API endpoint). Phase 4 cần tất cả.

---

## ⚡ QUICK START — NÊN BẮT ĐẦU TỪ ĐÂU?

**Khuyến nghị**: Bắt đầu từ Phase 1 → Phase 2 → Phase 3 → Phase 4

**Lý do**:
1. Phase 1 giải quyết vấn đề nền tảng (C1) — Workflow phải chạy được trước
2. Phase 2 thêm intelligence (C2 backend) — TL assessment cần hoạt động
3. Phase 3 thêm UI (C2 frontend) — User cần thấy suggestion card
4. Phase 4 đảm bảo chất lượng

**Nếu muốn kết quả nhanh nhất**: Phase 1 + Phase 2 có thể chạy song song bởi 2 agents khác nhau. Phase 3 cần chờ Phase 2 xong.

---

## 🔒 WORKFLOW DOC COMPATIBILITY CHECKLIST

| Workflow Doc Requirement | Phase 1 | Phase 2 | Phase 3 |
|-------------------------|---------|---------|---------|
| 5 agents: TL, G1, G2-A, G2-B, G3 | ✅ Lazy seeding | N/A | N/A |
| TL tự quyết routing | N/A | ✅ TL Assessment | N/A |
| Chat bình thường → "triển khai" trigger | N/A | N/A | ✅ Backward compat |
| TL NHÌN & ĐIỀU HƯỚNG | N/A | ✅ TL đánh giá trước trigger | ✅ Suggestion Card |
| Pipeline tuần tự | ✅ Agent Resolution đảm bảo agent tồn tại | N/A | N/A |
| 3 Routing Modes (A/B/C) | N/A | ✅ TL Assessment trả về routing | ✅ Hiển thị trên Card |
| 3 Tiers (Simple/Medium/Complex) | N/A | ✅ TL Assessment trả về tier | ✅ Hiển thị trên Card |
| Checkpoint verify | Unchanged | N/A | N/A |
| Code Location Map | Unchanged | N/A | N/A |
| Worklog READ-WRITE-VERIFY | Unchanged | N/A | N/A |

---

## 🚀 IMPLEMENTATION LOG

### Phase 1: Agent Resolution Layer + Keyword Chính Thức ✅ COMPLETED

**Ngày**: 2025-08-01
**Mục tiêu**: Giải quyết C1 (Auto-seeding Conflict) + Đổi keyword trigger chính thức

#### Thay đổi đã thực hiện:

1. **Tạo `src/lib/code-team/agent-resolver.ts`** — Agent Resolution Layer
   - `resolveAgent(position)` — Resolve agent từ DB → Hardcoded fallback → Lazy seed → Missing
   - `resolveAllAgents(positions)` — Resolve tất cả agents cần cho pipeline
   - `resolvePipelineAgents(mode, tier)` — Convenience function cho pipeline cụ thể
   - `isPipelineReady(result)` — Check nếu tất cả agents available
   - `getResolutionSummary(result)` — Summary string cho logging
   - Lazy seeding với **isSystem=false** → user có thể xóa/customize
   - DB-first → user customizations được tôn trọng
   - Graceful degradation → skip step nếu agent missing, không crash

2. **Cập nhật `src/lib/code-team/workflow-engine.ts`** — Dùng Agent Resolution Layer
   - Import `resolveAgent`, `resolveAllAgents`, `isPipelineReady`, `getResolutionSummary` từ agent-resolver
   - Xóa import `getAgentByPosition` — không còn dùng trực tiếp
   - Thêm `resolvedAgentsCache` — cache resolved agents trong workflow run
   - `runWorkflow()`: Thêm Step 0 — resolve TL agent trước khi routing
   - `runPipeline()`: Resolve tất cả pipeline agents trước khi chạy
   - `runAgentStep()`: Dùng resolved agent từ cache thay vì `getAgentByPosition()`
   - `runTLCheckpointVerify()`: Dùng resolved TL từ cache
   - Graceful degradation: Skip step nếu agent missing (không crash)

3. **Đổi trigger keyword** trong `src/app/page.tsx`
   - **Keyword chính thức**: `"tiến hành triển khai"` (thay cho danh sách cũ nhiều keywords)
   - Không mở rộng thêm keywords — giữ đúng 1 keyword chính thức
   - Comment cập nhật: "WORKFLOW TRIGGER (Critical Issues Resolution)"

#### Kết quả C1:
- ✅ Workflow KHÔNG crash khi agents không tồn tại trong DB
- ✅ Agents được lazy-seed khi workflow cần (isSystem=false)
- ✅ User có thể xóa/customize agents — không bị ghi đè
- ✅ DB-first: Nếu user đã tạo agent với position đúng → dùng config của user
- ✅ Graceful degradation: Skip steps cho missing agents

#### Keyword chính thức:
- `"tiến hành triển khai"` — Keyword duy nhất để khởi động workflow multi-agents

---

### Phase 1 Post-Review: Bug Fixes 🔧 COMPLETED

**Ngày**: 2025-03-04
**Mục tiêu**: Rà soát Phase 1, tìm và sửa lỗi, vấn đề, thiếu sót

#### 7 Bugs/Gaps phát hiện và sửa:

| # | Bug | Mức độ | Mô tả | Fix |
|---|-----|--------|--------|-----|
| 1 | `ensureCodeTeamAgents()` dùng `isSystem=true` | CRITICAL | Mâu thuẫn với Agent Resolution Layer design — design spec yêu cầu `isSystem=false` | Đổi `isSystem: false` trong `_doSeed()` |
| 2 | `ensureCodeTeamAgents()` overwrite instruction | CRITICAL | Mỗi lần GET /api/agents, instruction của existing agents bị ghi đè → mất user customizations | Đổi sang SKIP existing agents (không overwrite) |
| 3 | `ensureCodeTeamAgents()` re-enable auto-seeding | MEDIUM | Chạy trên mỗi GET /api/agents → tạo agents chủ động, không phải lazy | Giữ nguyên (soft ensure), nhưng isSystem=false + skip existing → ít xâm phạm hơn |
| 4 | Duplicate seed paths (isSystem=true vs false) | MEDIUM | `agents.ts` tạo `isSystem=true`, `agent-resolver.ts` tạo `isSystem=false` →不一致 | Cả hai đều tạo `isSystem=false` → nhất quán |
| 5 | `resolvedAgentsCache` module-level | HIGH | Race condition khi 2+ workflows chạy đồng thời → cache bị ghi đè | Đổi sang per-workflow `WorkflowContext` — truyền qua function params |
| 6 | Hardcoded 'APEX' trong `completedAgents` | HIGH | `completedAgents = ['APEX']` → sai nếu user đổi tên agent | Dùng `tlAgent.name` từ resolved cache |
| 7 | Tool call format thiếu trong prompts | HIGH | Workflow engine parse `tool_call: name({...})` từ text, nhưng prompts không hướng dẫn agents format này | Thêm "━━━ CÁCH GỌI TOOL ━━━" section cho tất cả 5 agent prompts |

#### Files đã sửa:
- `src/lib/code-team/agents.ts` — isSystem=false, skip existing agents
- `src/lib/code-team/workflow-engine.ts` — WorkflowContext, dynamic agent names, ctx parameter
- `src/lib/code-team/prompts.ts` — Tool call format instructions (TL, G1, G2-A, G2-B, G3)

#### Các vấn đề đã biết nhưng KHÔNG sửa (deferred):

| # | Vấn đề | Lý do không sửa |
|---|---------|------------------|
| A | Vietnamese diacritics trong keyword matching | User đã chọn keyword cố định "tiến hành triển khai" — không mở rộng. Sẽ xử lý trong C2 (Smart TL Bridge) |
| B | `completeSession()` crash nếu session không tồn tại | Edge case ít xảy ra — upsertSession luôn chạy trước. Có thể thêm try/catch sau |
| C | Tool definitions không được truyền native cho LLM | callLLMForAgent không hỗ trợ function calling — dùng text parsing workaround. Cần nâng cấp LLM layer sau |

---

### Phase 2: Smart TL Bridge (C2) ✅ COMPLETED

**Ngày**: 2026-06-09
**Mục tiêu**: TL tự đánh giá request và đề xuất workflow, thay vì user phải biết từ khóa

#### Thay đổi đã thực hiện:

1. **Tạo `src/lib/code-team/tl-bridge.ts`** — Smart TL Bridge
   - `assessRequest(message, chatHistory, timeoutMs)` — Đánh giá request → SIMPLE | CODE_TEAM
   - `parseAssessment(output)` — Parse LLM output thành TLAssessment (3 strategy: JSON code block → raw JSON → heuristic)
   - `isDirectTrigger(message)` — Check keyword "tiến hành triển khai" → trigger trực tiếp (backward compat)
   - `assessmentToRoutingDecision(assessment, userRequest)` — Convert TLAssessment → RoutingDecision cho workflow engine
   - Assessment cache: Map với 1-minute TTL, max 50 entries → tránh gọi LLM lại cho cùng message
   - Timeout protection: max 5s → fallback SIMPLE (không block chat)
   - Error fallback: Nếu TL không available hoặc LLM fail → fallback SIMPLE
   - Heuristic fallback: Nếu LLM output không parse được → keyword-based heuristic

2. **Tạo `src/app/api/code-team/assess/route.ts`** — TL Assessment API Endpoint
   - POST /api/code-team/assess
   - Request: `{ message, chatHistory, timeoutMs? }`
   - Response: `{ assessment: TLAssessment, isDirectTrigger: boolean }`
   - Nếu message chứa "tiến hành triển khai" → return CODE_TEAM + isDirectTrigger=true ngay lập tức
   - Nếu không → gọi assessRequest() để TL đánh giá

3. **Cập nhật `src/app/api/code-team/workflow/route.ts`** — Chấp nhận routing từ TL Assessment
   - Thêm `routing` parameter vào request body
   - Nếu có routing → parse thành RoutingDecision → truyền cho runWorkflow()
   - Nếu không có routing → TL phân tích bình thường (backward compat)

4. **Cập nhật `src/lib/code-team/workflow-engine.ts`** — Skip TL analyze khi có pre-computed routing
   - Thêm `routing?` field vào WorkflowRequest interface
   - Nếu `request.routing` tồn tại → skip TL analyze step → chạy pipeline ngay
   - Tiết kiệm ~3-5s bằng cách tránh redundant LLM call khi TL đã assess
   - Vẫn ghi TL worklog với routing pre-assessed

#### Kết quả C2:
- ✅ TL chủ động đánh giá request TRƯỚC khi workflow chạy
- ✅ SIMPLE/CODE_TEAM decision với routing suggestion
- ✅ Backward compatible: "tiến hành triển khai" trigger trực tiếp
- ✅ Timeout protection: max 5s → fallback SIMPLE
- ✅ Error fallback: LLM fail → SIMPLE (không block chat)
- ✅ Assessment cache: tránh gọi LLM lại cho cùng message
- ✅ Workflow engine skip TL analyze khi có pre-computed routing
- ✅ API endpoint hoạt động: /api/code-team/assess
- ✅ Lint pass, TypeScript pass (0 errors in code-team files)

---

### Phase 3: Frontend Suggestion Card (C2) ✅ COMPLETED

**Ngày**: 2026-03-05
**Mục tiêu**: UI hiển thị TL đề xuất workflow, user chấp nhận/từ chối. Backward compatible.

#### Thay đổi đã thực hiện:

1. **Thêm SmolabMessage fields** trong `src/app/page.tsx`:
   - `isWorkflowSuggestion`, `suggestionText`, `routingMode`, `routingTier`, `routingScore`, `assessmentRouting`, `suggestionRejected`

2. **Cập nhật `startWorkflow()`** — Nhận thêm parameters:
   - `routing?: SmolabMessage['assessmentRouting']` — Pre-computed routing từ TL Assessment
   - `options?: { skipUserMsg?: boolean }` — Skip duplicate user message khi accept từ Suggestion Card

3. **Thêm TL Assessment flow trong `sendMessage()`**:
   - Khi multi+code: Cách 1 (keyword) hoặc Cách 2 (TL Assessment)
   - CODE_TEAM → Suggestion Card, SIMPLE → TL trả lời trực tiếp

4. **Tạo Suggestion Card UI** — Amber theme, Mode/Tier/Score badges, Accept/Reject buttons

5. **Sửa BUG trong `src/lib/code-team/tl-bridge.ts`** — callLLMWithTimeout() timeout leak fix

6. **Routing parts construction** đúng theo mode (A=visual, B=backend, C=hybrid)

#### 4 Bugs phát hiện và sửa:

| # | Bug | Mức độ | Fix |
|---|-----|--------|-----|
| 1 | Duplicate user message khi accept Suggestion Card | CRITICAL | Thêm skipUserMsg option |
| 2 | callLLMWithTimeout() timeout leak | HIGH | clearTimeout trong finally |
| 3 | Parts luôn default 'backend' bất kể mode | MEDIUM | Xây dựng parts theo mode (A/C/B) |
| 4 | TypeScript NonNullable | LOW | Dùng NonNullable<> |

#### Kết quả C2 (Frontend):
- ✅ TL Assessment flow hoạt động trong multi+code mode
- ✅ Suggestion Card hiển thị khi TL đề xuất CODE_TEAM
- ✅ User chấp nhận → Workflow chạy với pre-computed routing
- ✅ User từ chối → Suggestion biến mất, chat tiếp tục
- ✅ Backward compatible: "tiến hành triển khai" vẫn trigger trực tiếp
- ✅ SIMPLE response: TL trả lời trực tiếp
- ✅ Assessment error → Error message + keyword fallback
- ✅ Lint pass, TypeScript pass (0 new errors)

---

### Phase 4: Integration & Polish ✅ COMPLETED

**Ngày**: 2026-03-05
**Mục tiêu**: End-to-end edge cases, performance optimization, documentation update.

#### Edge Cases đã kiểm tra và sửa:

| # | Edge Case | Trạng thái | Fix |
|---|-----------|-----------|-----|
| 1 | Agent assessment timeout → Fallback | ✅ Đã có (Phase 2) | Timeout 5s → SIMPLE fallback |
| 2 | LLM không trả JSON hợp lệ | ✅ Đã có (Phase 2) | parseAssessment() 3-strategy: JSON block → raw JSON → heuristic |
| 3 | Workflow engine gặp missing agent | ✅ Đã có (Phase 1) | Skip step + emit error event, không crash |
| 4 | **DB có agent nhưng disabled** | 🔧 Phase 4 FIX | resolveAgent() lazy seed mới (duplicate!) → Dùng hardcoded fallback, không lazy seed |
| 5 | **User gửi tin nhắn rất dài** | 🔧 Phase 4 FIX | userMessage không truncate → Thêm MAX_USER_MESSAGE_LENGTH=2000 |
| 6 | **Concurrent resolveAgent() calls** | 🔧 Phase 4 FIX | Không cache → Duplicate DB queries → Lazy seed cache (5min TTL, 20 entries) |

#### 3 Bugs phát hiện và sửa:

| # | Bug | Mức độ | Mô tả | Fix |
|---|-----|--------|--------|-----|
| 1 | Disabled agent bị ghi đè | 🔴 CRITICAL | resolveAgent() skip disabled → lazy seed agent mới → duplicate trong DB | Check disabled agent → hardcoded fallback (no lazy seed) |
| 2 | Long message không truncate | 🟡 MEDIUM | userMessage >2000 chars gửi toàn bộ → tốn tokens, có thể vượt context | Thêm truncatedMessage với MAX_USER_MESSAGE_LENGTH |
| 3 | Không có resolve cache | 🟡 MEDIUM | Mỗi resolveAgent() call → DB query → chậm nếu gọi nhiều lần | Thêm resolveCache (5min TTL, 20 entries, LRU eviction) |

#### Performance Optimization:

| # | Optimization | Trạng thái | Chi tiết |
|---|-------------|-----------|---------|
| 1 | Assessment cache | ✅ Đã có (Phase 2) | Map, 1min TTL, 50 entries, LRU |
| 2 | Assessment timeout | ✅ Đã có (Phase 2) | 5s max → SIMPLE fallback |
| 3 | Lazy seed cache | ✅ Phase 4 FIX | resolveCache, 5min TTL, 20 entries |

#### Documentation Update:

- ✅ `docs/critical-issues-resolution.md` — Marked as **RESOLVED** (✅ header + resolution summary)
- ✅ `docs/critical-issues-implementation-plan.md` — Phase 4 completion log
- ✅ Worklog updated

#### Kết quả Phase 4:
- ✅ 3 edge case bugs fixed (disabled agent, long message, no cache)
- ✅ Performance optimized (resolve cache + message truncation)
- ✅ Documentation updated (critical-issues marked RESOLVED)
- ✅ Lint pass, TypeScript pass (0 new errors)
- ✅ C1 + C2 hoàn toàn giải quyết — cả 2 Critical Issues RESOLVED
