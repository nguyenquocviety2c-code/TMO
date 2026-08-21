# Task 18 — Tóm tắt cấu trúc cần thiết

## A. Cấu trúc page.tsx (15.798 dòng)

### Vùng Code Team cần tách:

#### 1. Types (dòng 3740-3754) — SmolabMessage mở rộng:
- `isWorkflowSuggestion?: boolean`
- `suggestionText?: string`
- `routingMode?: string` // A | B | C
- `routingTier?: number` // 1 | 2 | 3
- `routingScore?: number` // 3-9
- `assessmentRouting?: { mode, tier, score, reasoning, parts, spec }`
- `suggestionRejected?: boolean`

#### 2. startWorkflow function (dòng 6484-6700):
- useCallback, nhận (text, routing?, options?)
- Tạo session nếu chưa có
- Gọi POST /api/code-team/workflow
- Xử lý SSE stream với các event: workflow_start, workflow_done, edit_proposed, approval_needed, checkpoint_restored, process_output, error
- Cập nhật messages state

#### 3. assessAndRoute function (dòng 6776-6870):
- Gọi POST /api/code-team/assess
- Nếu decision === 'CODE_TEAM' → tạo suggestion card message
- Xử lý routing mode A/B/C → parts
- Tạo assessmentRouting object

#### 4. UI Suggestion Card (dòng 7596-7640):
- Hiển thị khi msg.isWorkflowSuggestion && !msg.suggestionRejected
- Nút "Tiến hành triển khai" → gọi startWorkflow
- Nút "Hủy" → đánh dấu suggestionRejected
- Hiển thị routing mode, tier, score

#### 5. Các state liên quan (cần truyền vào component):
- messages, setMessages
- currentSessionId, setCurrentSessionId
- chatMode, selectedTeam
- isLoading, setIsLoading
- smolabAgents, selectedAgentId

### Các imports cần thiết:
- React, useState, useCallback, useRef, useEffect
- fetch API calls
- SmolabMessage type
- UI components từ shadcn

## B. Cấu trúc llm.ts (2659 dòng)

### Hàm chính cần thêm LLM_MOCK:
- `callLLM(prompt, options?)` — hàm gọi LLM chính
- `callLLMForAgent(prompt, options?)` — gọi LLM cho agent
- `callLLMForAgentWithMessages(messages, options?)` — gọi LLM với messages array

### Cách thêm LLM_MOCK:
- Kiểm tra `process.env.LLM_MOCK === '1'` ở đầu mỗi hàm callLLM*
- Nếu mock mode: trả về LLMResult giả với content mẫu, provider='mock', model='mock'
- Vẫn ghi token usage (0 tokens) để không làm hỏng tracking

## C. scripts/e2e-code-team.sh

Cần test:
1. POST /api/code-team/assess → trả về decision
2. POST /api/code-team/workflow → SSE stream với các event
3. GET /api/code-team/edits → danh sách edits
4. GET /api/code-team/checkpoints → danh sách checkpoints