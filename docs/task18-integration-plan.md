# Task 18 Integration Plan — Tích hợp CodeTeamTab vào page.tsx

## Trạng thái hiện tại
- `src/components/features/code-team/CodeTeamTab.tsx`: ✅ Đã tồn tại (560 dòng), có đầy đủ logic workflow
- `scripts/e2e-code-team.sh`: ✅ Đã tồn tại (184 dòng)
- `src/lib/llm.ts` LLM_MOCK: ✅ Đã triển khai (dòng 2241-2258)
- `src/app/page.tsx`: ❌ 14,844 dòng, chưa import CodeTeamTab, Code Team logic vẫn inline trong SmolabModule

## Mục tiêu
- Tích hợp CodeTeamTab vào SmolabModule để khi `chatMode === 'multi' && selectedTeam === 'code'`, render `<CodeTeamTab>` thay vì render inline
- Giảm page.tsx ≥2.000 dòng

## Phân tích SmolabModule (dòng 5737-7932, ~2,196 dòng)

### State liên quan đến Code Team:
| State | Dòng khai báo | Dùng trong Code Team? | Ghi chú |
|-------|--------------|----------------------|---------|
| `messages` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận + set |
| `currentSessionId` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận + set |
| `isLoading` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận + set |
| `input` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận + set |
| `smolabAgents` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận |
| `selectedAgentId` | ~5800 | ✅ Dùng chung | CodeTeamTab cần nhận |
| `chatMode` | ~5800 | ✅ Điều kiện render | 'single' / 'multi' |
| `selectedTeam` | ~5800 | ✅ Điều kiện render | 'code' / 'research' |
| `selectedModel` | ~5800 | ❌ Không dùng trong Code Team | Code Team dùng model riêng |
| `skipMessageLoadRef` | ~6135 | ✅ Dùng trong startWorkflow | CodeTeamTab có ref riêng |

### Hàm/logic liên quan đến Code Team cần xóa khỏi SmolabModule:
1. **`isWorkflowTrigger()`** (dòng 6479-6482) — CodeTeamTab đã có hàm riêng
2. **`startWorkflow()`** (dòng 6484-6740) — CodeTeamTab đã có hàm riêng
3. **Phần Code Team trong `sendMessage()`** (dòng 6746-6861):
   - Trigger check `isWorkflowTrigger` (dòng 6748-6750)
   - TL Assessment flow (dòng 6757-6861)
4. **Suggestion Card UI** (dòng 7596-7644) — CodeTeamTab tự render

### JSX cần thay đổi:
- **Messages list**: Hiện tại render tất cả messages trong 1 list. Khi ở Code Team mode, cần render CodeTeamTab thay vì inline messages list
- **Input area**: Hiện tại dùng chung 1 input. CodeTeamTab có input riêng
- **Header/controls**: CodeTeamTab có header riêng

## Chiến lược tích hợp

### Cách A: Conditional render toàn bộ nội dung
Khi `chatMode === 'multi' && selectedTeam === 'code'`:
- Render `<CodeTeamTab>` thay cho toàn bộ messages list + input area
- Giữ lại resize handles, header bar của SmolabModule
- CodeTeamTab nhận tất cả state cần thiết qua props

**Ưu điểm**: Đơn giản, rõ ràng
**Nhược điểm**: CodeTeamTab cần được bọc trong cùng container styling

### Cách B: Chỉ thay thế phần messages + input
Giữ nguyên layout SmolabModule, chỉ thay thế vùng chat chính

**Ưu điểm**: Giữ nguyên layout
**Nhược điểm**: CodeTeamTab có layout riêng, khó tích hợp

→ **Chọn Cách A**: Đơn giản và hiệu quả nhất.

## Kế hoạch thực hiện

### Bước 1: Thêm import CodeTeamTab vào page.tsx
```tsx
import CodeTeamTab from '@/components/features/code-team/CodeTeamTab'
```

### Bước 2: Xóa code Team logic khỏi SmolabModule
- Xóa `isWorkflowTrigger` function (dòng 6479-6482)
- Xóa `startWorkflow` useCallback (dòng 6484-6740)
- Xóa phần Code Team trong `sendMessage` (dòng 6746-6861):
  - Xóa trigger check (6748-6750)
  - Xóa TL Assessment flow (6757-6861)
- Cập nhật dependency array của `sendMessage` (bỏ `startWorkflow`)

### Bước 3: Thêm conditional render CodeTeamTab
Trong JSX return của SmolabModule, tìm vị trí messages list + input area.
Thêm conditional:
```tsx
{chatMode === 'multi' && selectedTeam === 'code' ? (
  <CodeTeamTab
    messages={messages}
    setMessages={setMessages}
    currentSessionId={currentSessionId}
    setCurrentSessionId={setCurrentSessionId}
    isLoading={isLoading}
    setIsLoading={setIsLoading}
    input={input}
    setInput={setInput}
    smolabAgents={smolabAgents}
    selectedAgentId={selectedAgentId}
  />
) : (
  // ... existing messages list + input area
)}
```

### Bước 4: Xóa Suggestion Card UI khỏi message render
Phần suggestion card (dòng 7596-7644) không còn cần trong SmolabModule vì CodeTeamTab tự xử lý.

### Bước 5: Verify
- `bun run lint` — 0 errors
- Đếm số dòng page.tsx — phải giảm ≥2.000 dòng
- CodeTeamTab render đúng khi chọn Code Team mode

## Dự kiến số dòng giảm
- `startWorkflow`: ~257 dòng (6484-6740)
- Code Team trong `sendMessage`: ~115 dòng (6746-6861)
- Suggestion Card UI: ~49 dòng (7596-7644)
- `isWorkflowTrigger`: ~4 dòng (6479-6482)
- **Tổng giảm**: ~425 dòng

⚠️ **Cảnh báo**: 425 dòng << 2.000 dòng yêu cầu. Cần xem xét thêm các phần khác có thể tách được.

## Phần bổ sung để đạt ≥2.000 dòng
Cần tách thêm:
1. **Constants và types** dùng chung giữa SmolabModule và CodeTeamTab → extract ra file shared
2. **AGENT_COLORS, POSITION_COLORS** → extract ra constants file
3. **Message bubble render** → extract ra component riêng
4. **Model selector UI** → extract ra component riêng

Tuy nhiên, blueprint Task 18 chỉ yêu cầu tách "tối thiểu tab Code Team". Việc tách thêm các phần khác có thể là scope creep.

→ **Quyết định**: Thực hiện tách Code Team trước, sau đó đánh giá lại. Nếu chưa đủ 2.000 dòng, sẽ đề xuất các bước bổ sung.