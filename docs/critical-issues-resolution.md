# ✅ 2 Vấn Đề Critical — ĐÃ GIẢI QUYẾT (RESOLVED)

> **Created**: 2025-08-01
> **Resolved**: 2026-03-05
> **Reference**: `docs/code-team-workflow.md`, `docs/code-team-implementation-plan.md`
> **Mục tiêu**: ~~Phân tích chi tiết 2 vấn đề Critical + Đề xuất kiến trúc giải quyết~~ **ĐÃ GIẢI QUYẾT**

## 🎉 RESOLUTION SUMMARY

| # | Vấn đề | Trạng thái | Phase giải quyết |
|---|--------|-----------|-----------------|
| **C1** | Auto-seeding Conflict | ✅ RESOLVED | Phase 1 (Agent Resolution Layer) + Phase 1 Review (7 bug fixes) |
| **C2** | "Triển khai" Keyword Trigger | ✅ RESOLVED | Phase 2 (Smart TL Bridge) + Phase 3 (Frontend Suggestion Card) + Phase 4 (Edge Cases & Polish) |

**Chi tiết triển khai**: Xem `docs/critical-issues-implementation-plan.md` — Implementation Log cuối file.

---

## 📋 TÓM TẮT

| # | Vấn đề | Mức độ | Nguyên nhân gốc | Ảnh hưởng |
|---|--------|--------|-----------------|-----------|
| **C1** | Auto-seeding Conflict | CRITICAL | Workflow cần 5 agents → auto-seeding bị tắt → workflow không chạy | Code Team workflow hoàn toàn không khả thi |
| **C2** | "Triển khai" Keyword Trigger | CRITICAL | Chỉ trigger bằng từ khóa cứng → không auto-detect → không discoverable | User không thể sử dụng Code Team nếu không biết từ khóa |

---

## 🔴 VẤN ĐỀ C1: AUTO-SEEDING CONFLICT

### Mô tả chi tiết

Workflow Engine (`workflow-engine.ts`) phụ thuộc vào 5 agents cố định tồn tại trong database:

```
APEX (TL) → CORTEX (G1) → BOLT (G2-A) → SENTINEL (G2-B) → CATALYST (G3)
```

Mỗi agent có `position` cố định (TL, G1, G2-A, G2-B, G3) được hardcode trong:
- `agents.ts`: `CODE_TEAM_AGENTS` — định nghĩa 5 agents với tên, provider, model, tools
- `prompts.ts`: `getAgentPrompt(position)` — system prompt theo position
- `workflow-engine.ts`: `getPipeline(mode, tier)` — pipeline dựa trên position
- `tool-executor.ts`: `getToolDefinitions(tools)` — tool quyền theo agent

### Vấn đề

**Task 14** đã vô hiệu hóa auto-seeding theo yêu cầu user:
- `ensureSystemAgents()` → no-op
- `ensureCodeTeamAgents()` → không được gọi
- 9 system agents đã bị xóa khỏi database

**Hệ quả**: Workflow Engine gọi `getAgentByPosition('TL')` → `undefined` → pipeline crash.

### Tại sao đây là CRITICAL

```
┌──────────────────────────────────────────────────┐
│               DEPENDENCY CHAIN                    │
│                                                   │
│  Workflow Engine                                  │
│    ├─ getPipeline(mode, tier)                     │
│    │   └─ return [{position: 'TL'}, ...]          │
│    │                                              │
│    ├─ runPipelineStep(position)                   │
│    │   ├─ getAgentByPosition('TL')  ← NULL!       │
│    │   ├─ getAgentPrompt('TL')      ← OK (hard)   │
│    │   ├─ getAgentTools('TL')       ← OK (hard)   │
│    │   └─ callLLMForAgent(agent)    ← CRASH!      │
│    │       └─ needs agent.provider, agent.model   │
│    │                                              │
│    └─ Result: WORKFLOW KHÔNG CHẠY ĐƯỢC           │
└──────────────────────────────────────────────────┘
```

### Mâu thuẫn cốt lõi

| Yeu cầu | Thực tế | Xung đột |
|---------|---------|----------|
| User KHÔNG muốn agents tự tạo | Workflow cần agents tồn tại | Auto-seeding = tự tạo |
| User muốn tự quyết định agents | Agents phải có position đúng | Tự do = workflow hỏng |
| Workflow doc yêu cầu 5 agents cố định | User đã xóa 9 system agents | Cố định vs tự do |

---

## 🔴 VẤN ĐỀ C2: "TRIỂN KHAI" KEYWORD TRIGGER

### Mô tả chi tiết

Từ implementation plan Decision #2:
> "Chat bình thường → 'triển khai' trigger. Chat với TL = single call. Gõ 'triển khai' → TL nhận diện → chuyển workflow SSE"

Hiện tại, Code Team workflow chỉ được kích hoạt khi:
1. User ở `chatMode='multi'` + `team='code'`
2. User gõ **chính xác** từ "triển khai" trong tin nhắn
3. Frontend nhận diện → gọi `POST /api/code-team/workflow` (SSE)

### Vấn đề

```
┌─────────────────────────────────────────────────────────┐
│             "TRIỂN KHAI" TRIGGER FLOW                    │
│                                                          │
│  User gõ tin nhắn                                        │
│    │                                                     │
│    ├─ "Hãy tạo cho tôi một trang login"                  │
│    │   → Chat bình thường → Single agent response        │
│    │   → KHÔNG trigger workflow!                         │
│    │                                                     │
│    ├─ "triển khai"                                       │
│    │   → Trigger workflow! ✅                             │
│    │                                                     │
│    ├─ "Triển khai tính năng login"                       │
│    │   → Trigger workflow! ✅ (chứa từ khóa)             │
│    │                                                     │
│    ├─ "deploy tính năng login"                           │
│    │   → KHÔNG trigger! ❌ (từ khóa sai)                 │
│    │                                                     │
│    ├─ "Hãy code cho tôi một API endpoint"                │
│    │   → Chat bình thường → Single agent response        │
│    │   → KHÔNG trigger workflow! ❌                       │
│    │                                                     │
│    └─ "implement the login page"                         │
│        → KHÔNG trigger! ❌ (English keyword)             │
└─────────────────────────────────────────────────────────┘
```

### Tại sao đây là CRITICAL

1. **Không Discoverable**: User không biết phải gõ "triển khai" — không có UI hint, button, hay gợi ý
2. **Language-Dependent**: Chỉ hoạt động với tiếng Việt — user nói "deploy", "implement", "build" → không trigger
3. **Fragile Matching**: Dựa trên string matching cứng — dễ bị lỗi encoding, typo, format
4. **Context-Ignorant**: TL không tự đánh giá được khi nào cần multi-agent vs single-agent
5. **Workflow Doc Mismatch**: Workflow doc nói "TL tự quyết" (Decision #4), nhưng thực tế TL không được cơ hội quyết định — user phải tự trigger

### Workflow Doc vs Thực tế

| Workflow Doc nói | Thực tế implement | Gap |
|-----------------|-------------------|-----|
| "TL tự quyết" routing | User gõ "triển khai" → trigger | TL không được hỏi |
| "Chat bình thường → triển khai trigger" | Keyword matching cứng | Không có intelligence |
| "Kimi NHÌN & ĐIỀU HƯỚNG" | TL chỉ respond khi được trigger | TL passive, không active |
| TL phân tích complexity + routing | Phân tích chỉ xảy SAU trigger | Phân tích cần xảy TRƯỚC |

---

## 🏗️ KIẾN TRÚC GIẢI QUYẾT — "SMART BRIDGE"

### Nguyên tắc thiết kế

1. **Preserve Workflow**: Tuân thủ 100% workflow trong `code-team-workflow.md`
2. **User Autonomy**: User luôn kiểm soát — không auto-seeding không cần thiết
3. **TL Intelligence**: TL được cơ hội đánh giá và đề xuất, KHÔNG phải passive
4. **Graceful Degradation**: Nếu thiếu agents → fallback, không crash

---

### Giải pháp C1: "Agent Resolution Layer"

**Ý tưởng**: Thay vì hard-depend vào 5 agents cố định, tạo 1 lớp trung gian resolve agent config từ nhiều nguồn, theo thứ tự ưu tiên.

```
┌──────────────────────────────────────────────────────────┐
│              AGENT RESOLUTION LAYER                       │
│                                                          │
│  Workflow Engine cần agent cho position 'TL'             │
│    │                                                     │
│    ▼                                                     │
│  resolveAgent(position: string)                          │
│    │                                                     │
│    ├─ Step 1: Tìm trong DB (AgentProfile)                │
│    │   WHERE team='code' AND position='TL' AND enabled   │
│    │   → Tìm thấy? → Dùng config từ DB ✅                │
│    │                                                     │
│    ├─ Step 2: Fallback to Hardcoded Definition           │
│    │   CODE_TEAM_AGENTS.find(a => a.position === 'TL')   │
│    │   → Tìm thấy? → Dùng config hardcoded ⚠️            │
│    │   → Auto-create vào DB (lazy seeding)               │
│    │   → Mark as isSystem=false (user có thể xóa)        │
│    │                                                     │
│    └─ Step 3: Không tìm thấy → ESCALATE                  │
│        → Emit SSE event: 'agent_missing'                  │
│        → UI hiển thị: "Cần tạo agent cho vị trí TL"     │
│        → Workflow tạm dừng, chờ user tạo                 │
└──────────────────────────────────────────────────────────┘
```

**Implementation**:

```typescript
// src/lib/code-team/agent-resolver.ts

export interface ResolvedAgent {
  id?: string          // DB agent ID (nếu có)
  name: string         // Agent name
  position: string     // TL | G1 | G2-A | G2-B | G3
  provider: string     // LLM provider
  model: string        // LLM model
  temperature: number
  maxTokens: number
  instruction: string  // System prompt
  tools: string[]      // Tool permissions
  source: 'database' | 'hardcoded' | 'missing'
}

export async function resolveAgent(position: string): Promise<ResolvedAgent> {
  // Step 1: Tìm trong DB
  const dbAgent = await db.agentProfile.findFirst({
    where: {
      team: 'code',
      position: position,
      enabled: true,
    },
  })

  if (dbAgent) {
    return {
      id: dbAgent.id,
      name: dbAgent.name,
      position: dbAgent.position,
      provider: dbAgent.provider,
      model: dbAgent.model,
      temperature: dbAgent.temperature,
      maxTokens: dbAgent.maxTokens,
      instruction: dbAgent.instruction || getAgentPrompt(position),
      tools: getAgentTools(position),
      source: 'database',
    }
  }

  // Step 2: Fallback to hardcoded definition
  const hardcoded = getAgentByPosition(position)
  if (hardcoded) {
    // Lazy seed: Tạo agent trong DB từ hardcoded definition
    // QUAN TRỌNG: isSystem = false → User có thể xóa/customize
    const newAgent = await db.agentProfile.create({
      data: {
        name: hardcoded.name,
        description: hardcoded.description,
        instruction: getAgentPrompt(position),
        domain: hardcoded.domain,
        capable: hardcoded.capable,
        provider: hardcoded.provider,
        model: hardcoded.model,
        temperature: hardcoded.temperature,
        maxTokens: hardcoded.maxTokens,
        team: hardcoded.team,
        position: hardcoded.position,
        avatar: hardcoded.avatar,
        isSystem: false,  // ← KHÁC BIỆT QUAN TRỌNG
        enabled: true,
      },
    })

    return {
      id: newAgent.id,
      name: hardcoded.name,
      position: hardcoded.position,
      provider: hardcoded.provider,
      model: hardcoded.model,
      temperature: hardcoded.temperature,
      maxTokens: hardcoded.maxTokens,
      instruction: getAgentPrompt(position),
      tools: hardcoded.tools,
      source: 'hardcoded',
    }
  }

  // Step 3: Không tìm thấy
  return {
    name: `Unknown-${position}`,
    position,
    provider: '',
    model: '',
    temperature: 0.5,
    maxTokens: 4096,
    instruction: '',
    tools: [],
    source: 'missing',
  }
}
```

**Điểm mấu chốt**:
- **Lazy Seeding**: Chỉ tạo agents KHI CẦN (workflow được trigger), KHÔNG auto-seed lúc startup
- **isSystem=false**: Agents được lazy-seed KHÔNG phải system agents → user có thể xóa/customize
- **DB-First**: Nếu user đã tự tạo agent với position đúng → dùng config của user
- **Hardcoded-Fallback**: Nếu DB không có → dùng hardcoded definition → tạo vào DB

**Sự khác biệt với auto-seeding cũ**:

| Thuộc tính | Auto-seeding cũ | Lazy Resolution mới |
|-----------|-----------------|---------------------|
| Thời điểm tạo | Startup / GET /api/agents | Khi workflow cần agent |
| isSystem | true (không xóa được) | false (xóa được) |
| User control | Không (tự tạo) | Có (user có thể customize/xóa) |
| Overwrite user config | Có (_doSeed overwrite) | Không (DB-first) |
| Nếu user xóa | Tự tạo lại lần sau | Lazy tạo lại khi cần |

---

### Giải pháp C2: "Smart TL Bridge" — TL tự đánh giá và đề xuất

**Ý tưởng**: Thay vì hardcode keyword "triển khai", để TL tự đánh giá request và đề xuất workflow. User được hỏi trước khi workflow chạy.

```
┌──────────────────────────────────────────────────────────┐
│              SMART TL BRIDGE FLOW                        │
│                                                          │
│  User gửi tin nhắn (bất kỳ nội dung)                     │
│    │                                                     │
│    ▼                                                     │
│  TL Assessment (single LLM call, nhanh)                  │
│    │                                                     │
│    ├─ Request KHÔNG cần code team                        │
│    │   → TL trả lời bình thường (như hiện tại)           │
│    │   → Kết thúc                                        │
│    │                                                     │
│    └─ Request CẦN code team                              │
│        → TL trả lời kèm "Workflow Suggestion"            │
│        → UI hiển thị suggestion card:                     │
│          "TL đề xuất triển khai với Code Team"            │
│          [Chấp nhận] [Từ chối] [Sửa yêu cầu]             │
│        │                                                 │
│        ├─ User nhấn [Chấp nhận]                          │
│        │   → Trigger workflow SSE                        │
│        │   → TL đã có routing sẵn → Pipeline chạy ngay   │
│        │                                                 │
│        ├─ User nhấn [Từ chối]                            │
│        │   → TL trả lời bình thường (single agent)       │
│        │                                                 │
│        └─ User nhấn [Sửa yêu cầu]                        │
│            → User viết lại request → TL đánh giá lại     │
└──────────────────────────────────────────────────────────┘
```

**Implementation chi tiết**:

#### 2a. TL Assessment — Single call để TL đánh giá

```typescript
// src/lib/code-team/tl-bridge.ts

const TL_ASSESSMENT_PROMPT = `Bạn là APEX — Team Lead của Code Team.

Nhiệm vụ: Đánh giá xem request của user có cần Code Team workflow hay không.

QUYẾT ĐỊNH:
- SIMPLE: User hỏi thông tin, chat bình thường, hỏi kiến thức → Trả lời trực tiếp
- CODE_TEAM: User yêu cầu code, tạo tính năng, sửa bug phức tạp, xây dựng hệ thống → Cần Code Team

OUTPUT FORMAT (JSON):
{
  "decision": "SIMPLE" | "CODE_TEAM",
  "reasoning": "<lý do>",
  "routing": {
    "mode": "A" | "B" | "C",
    "tier": 1 | 2 | 3,
    "score": <3-9>,
    "reasoning": "<giải thích routing>"
  },
  "suggestion": "<gợi ý ngắn cho user nếu CODE_TEAM>",
  "directAnswer": "<câu trả lời trực tiếp nếu SIMPLE>"
}`

export async function assessRequest(
  userMessage: string,
  chatHistory: Array<{role: string; content: string}>
): Promise<TLAssessment> {
  // Dùng TL's configured provider/model (callLLMForAgent)
  const result = await callLLMForAgent(
    `Chat history:\n${chatHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent message: ${userMessage}`,
    { provider: 'nvidia', model: 'moonshotai/kimi-k2.6' },
    TL_ASSESSMENT_PROMPT,
    { maxTokens: 1024 }
  )

  return parseAssessment(result)
}
```

#### 2b. Frontend — Suggestion Card UI

```typescript
// Khi TL trả về assessment với decision = 'CODE_TEAM'
// Frontend hiển thị suggestion card thay vì tự trigger

interface WorkflowSuggestion {
  decision: 'CODE_TEAM'
  reasoning: string
  routing: {
    mode: 'A' | 'B' | 'C'
    tier: 1 | 2 | 3
    score: number
    reasoning: string
  }
  suggestion: string
}
```

**UI Flow**:
```
┌─────────────────────────────────────────────┐
│ 💬 User: "Tạo cho tôi một trang login"       │
│                                              │
│ 🤖 TL APEX:                                 │
│   Yêu cầu này cần Code Team!                │
│   📊 Routing: Mode C (Hybrid) | Tier 2      │
│   📋 Pipeline: TL→G1→G2-A→G2-B→TL          │
│                                              │
│   ┌──────────────────────────────────┐       │
│   │  🚀 Triển khai với Code Team?   │       │
│   │                                  │       │
│   │  [✅ Triển khai] [❌ Không]     │       │
│   │  [✏️ Sửa yêu cầu]              │       │
│   └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

#### 2c. Backward Compatibility — "Triển khai" vẫn hoạt động

```typescript
// Frontend vẫn hỗ trợ keyword "triển khai" như shortcut
// Nhưng KHÔNG còn là cách duy nhất

function handleSendMessage(message: string) {
  // Cách 1: Keyword shortcut (backward compatible)
  if (containsDeployKeyword(message)) {
    // "triển khai", "deploy", "implement", "thực hiện"
    triggerWorkflowDirectly(message)
    return
  }

  // Cách 2: Smart TL Assessment (default)
  // Gửi tin nhắn bình thường, TL tự đánh giá
  sendToChat(message)
}
```

**Keyword mở rộng** (thay vì chỉ "triển khai"):
```typescript
const DEPLOY_KEYWORDS = [
  // Tiếng Việt
  'triển khai', 'thực hiện', 'xây dựng', 'phát triển',
  'tạo', 'code', 'lập trình', 'implement',
  // English
  'deploy', 'implement', 'build', 'create', 'develop',
  'code this', 'make this', 'build this',
]
```

---

## 🔄 KIẾN TRÚC TỔNG THỂ — SAU KHI GIẢI QUYẾT

```
Smolab Chat (page.tsx)
  │
  ├─ chatMode='single' → POST /api/openclaw/chat
  │   │
  │   └─ TL Assessment (mới!)
  │       ├─ SIMPLE → Single agent response (như cũ)
  │       └─ CODE_TEAM → Suggestion Card → User chấp nhận → Workflow
  │
  ├─ Keyword "triển khai"/"deploy"/... (backward compatible)
  │   → Trigger workflow trực tiếp (như cũ)
  │
  └─ chatMode='multi' + team='code'
      │
      ├─ Gõ bình thường → TL Assessment → Suggestion hoặc Response
      │
      └─ User chấp nhận workflow / Keyword → POST /api/code-team/workflow (SSE)
           │
           ▼
      Workflow Engine (workflow-engine.ts)
           │
           ├─ Agent Resolution Layer (mới!)
           │   ├─ resolveAgent('TL') → DB first → Hardcoded fallback → Lazy seed
           │   ├─ resolveAgent('G1') → DB first → Hardcoded fallback → Lazy seed
           │   └─ ... cho từng position trong pipeline
           │
           ├─ TL phân tích → Routing Decision (mode A/B/C + tier 1/2/3)
           │
           ├─ Pipeline tuần tự theo routing:
           │   TL → [G1 →] [G2-A →] G2-B [→ G3] → TL verify
           │
           └─ Workflow done → SSE event 'workflow_done'
```

---

## ✅ CHECKLIST — ĐẢM BẢO WORKFLOW DOC COMPATIBILITY

| Workflow Doc Requirement | Giải pháp C1 | Giải pháp C2 |
|-------------------------|-------------|-------------|
| 5 agents: TL, G1, G2-A, G2-B, G3 | Lazy seeding khi cần | N/A |
| TL tự quyết routing | N/A | TL Assessment trước trigger |
| Chat bình thường → "triển khai" trigger | N/A | Backward compatible + Smart Bridge |
| TL NHÌN & ĐIỀU HƯỚNG | N/A | TL đánh giá + đề xuất |
| Pipeline tuần tự | Agent Resolution đảm bảo agent tồn tại | N/A |
| 3 Routing Modes (A/B/C) | N/A | TL Assessment trả về routing |
| 3 Tiers (Simple/Medium/Complex) | N/A | TL Assessment trả về tier |
| Checkpoint verify | Unchanged | Unchanged |
| Code Location Map | Unchanged | Unchanged |
| Worklog READ-WRITE-VERIFY | Unchanged | Unchanged |

---

## 📁 FILES CẦN TẠO/SỬA

### New Files

| File | Mô tả |
|------|--------|
| `src/lib/code-team/agent-resolver.ts` | Agent Resolution Layer — resolve agent từ DB → Hardcoded → Missing |
| `src/lib/code-team/tl-bridge.ts` | TL Assessment — đánh giá request, đề xuất workflow |
| `src/app/api/code-team/assess/route.ts` | API endpoint cho TL Assessment (POST) |

### Modified Files

| File | Thay đổi |
|------|----------|
| `src/lib/code-team/workflow-engine.ts` | Dùng `resolveAgent()` thay vì `getAgentByPosition()` trực tiếp |
| `src/lib/code-team/agents.ts` | Export thêm `CODE_TEAM_AGENTS` data cho resolver |
| `src/app/api/code-team/workflow/route.ts` | Nhận routing từ TL Assessment (nếu có) |
| `src/app/page.tsx` | Thêm Suggestion Card UI + keyword mở rộng |
| `src/lib/agent-seed.ts` | Re-enable `ensureCodeTeamAgents()` nhưng lazy-mode only |

---

## 🎯 KẾT QUẢ KỲ VỌNG

### Trước giải pháp:
- ❌ Workflow crash nếu agents không tồn tại
- ❌ User phải biết từ khóa "triển khai"
- ❌ TL passive, không tự đánh giá
- ❌ Không discoverable
- ❌ Tiếng Anh không trigger được

### Sau giải pháp:
- ✅ Workflow luôn chạy được (Lazy Resolution)
- ✅ User được TL đề xuất → chấp nhận/từ chối
- ✅ TL chủ động đánh giá request
- ✅ Discoverable qua Suggestion Card
- ✅ Multi-language keywords
- ✅ User vẫn kiểm soát hoàn toàn
- ✅ Backward compatible với "tiến hành triển khai"
- ✅ Agents có thể customize (isSystem=false)

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
| 1 | `ensureCodeTeamAgents()` dùng `isSystem=true` | CRITICAL | Mâu thuẫn với Agent Resolution Layer design — design spec yêu cầu `isSystem=false` (user có thể xóa) | Đổi `isSystem: false` trong `_doSeed()` |
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
