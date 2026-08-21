# AI Code Team — Workflow Architecture

> ⚠️ **ĐÂY LÀ CODE TEAM** — Thiết kế cho phát triển phần mềm: viết chương trình, thiết kế web/app, xây dựng hệ thống.
> KHÔNG PHẢI research team. TL = Visual Director + Coordinator, không phải Research Director.
> Dynamic: "Kimi NHÌN & ĐIỀU HƯỚNG, DeepSeek THIẾT KẾ, Qwen XÂY, GLM SỬA, MiniMax TỐI ƯU"

---

## 🔄 PHÂN CÔNG VAI TRÒ — DỰA TRÊN THẾ MẠNH THỰC TẾ

| Model | Vai trò | Lý do |
|---|---|---|
| **Kimi K2.6** | **TL — Team Leader** | Khả năng thị giác mạnh + 300 sub-agents cho phân tích yêu cầu + điều phối + code UI/UX trực tiếp khi cần (Fast Track) |
| **DeepSeek V4** | **G1 — Architecture & Design** | Suy luận sâu nhất + 1M context cho thiết kế kiến trúc hệ thống phức tạp + khả năng lập kế hoạch kiến trúc xuất sắc |
| **Qwen3 Coder** | **G2-A — Code Execution** | Coder chuyên biệt, sinh code nhanh và chính xác, implement từ architecture spec |
| **GLM 5.1** | **G2-B — Review & Bug Fix** | 400 tok/s cho vòng lặp fix bug nhanh, tốt ở iterative refinement |
| **MiniMax M2.7** | **G3 — Optimization** | Self-evolving mechanism, tối ưu performance, code simplification, scalability |

### Nguyên tắc phân vai:

- **GIAO DIỆN (UI/UX)**: Thuộc về Kimi (TL) — Có thị giác, có thể nhìn screenshot/mockup và code lại chính xác. Fast Track: Kimi tự code UI + Self-verify. Không cần qua toàn bộ pipeline.
- **CHỨC NĂNG (Backend/Architecture/Logic)**: Triển khai toàn team qua pipeline. G1 thiết kế kiến trúc → G2-A code → G2-B fix → G3 tối ưu. DeepSeek suy luận sâu cho thiết kế hệ thống.

---

## 🏗️ KIẾN TRÚC TEAM — ÁNH XẠ VÀO TL/G1/G2-A/G2-B/G3

```
┌─────────────────────────────────────────────────────┐
│                    Kimi K2.6                         │
│                   TL (Team Leader)                   │
│  • Nhận request, PHÂN TÍCH THỊ GIÁC                │
│  • 300 sub-agents cho phân tích yêu cầu             │
│  • Phá vỡ bài toán từ thị giác thực tế              │
│  • Viết .md mô tả chi tiết cho từng part            │
│  • Chọn workflow tier & routing mode                │
│  • Fast Track: Tự code UI/UX + Self-verify          │
│  • VERIFY kết quả bằng THỊ GIÁC                    │
│  • Điều phối, tracking tiến độ                      │
│  • Hỗ trợ G1 thị giác khi cần                      │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               │
┌──────────────┐       │
│  G1 DESIGN   │       │  DeepSeek thiết kế kiến trúc
│              │       │  → Database, API, Component tree
│ DeepSeek V4  │       │  → Data flow, State management
│ (Architect)  │       │  → 1M context cho system design
│              │       │  → Suy luận sâu cho edge cases
│              │       │  → Hỗ trợ TL kiến trúc khi cần
└──────┬───────┘       │
       │               │
       ▼               │
┌──────────────┐       │
│  G2-A CODE   │       │  Qwen3 Coder implement
│              │       │  → Code từ architecture spec
│ Qwen3 Coder  │       │  → Backend, Frontend logic, API
│ (Executor)   │       │  → Cập nhật worklog
└──────┬───────┘       │
       │               │
       ▼               │
┌──────────────┐       │
│  G2-B REVIEW │       │  GLM review + fix bugs
│              │       │  → Security, Logic, Types
│ GLM 5.1      │       │  → Xem xét G2-A suggestions
│ (Bug Fixer)  │       │  → Cập nhật worklog
└──────┬───────┘       │
       │               │
       ▼               │
┌──────────────┐       │
│  G3 OPTIMIZE │       │  MiniMax tối ưu code
│              │       │  → Performance, Simplification
│ MiniMax M2.7 │       │  → Scalability, Best practices
│ (Optimizer)  │       │  → Kết nối UI + Backend (Hybrid)
│              │       │  → Self-evolving lessons
└──────┬───────┘       │
       │               │
       └───────────────┘
        ← Về TL kiểm tra (BẰNG THỊ GIÁC + LOGIC)
```

---

## 🚦 HỆ THỐNG ROUTING — 3 CHẾ ĐỘ DISPATCH

TL (Kimi) là bộ điều hướng thông minh. Mỗi request được phân loại và đi đúng tuyến:

- **LOẠI A: PURE VISUAL** (Chỉ giao diện) → Fast Track: Kimi tự code UI + Self-verify → G2-B: Code quality review → TL: Final verify
- **LOẠI B: PURE BACKEND** (Chỉ chức năng) → Full Pipeline: TL→G1→G2-A→G2-B→G3→TL. TL chỉ phân tích + verify
- **LOẠI C: HYBRID** (Giao diện + Chức năng) → Sequential: TL(UI) → G1→G2-A→G2-B(BE) → G3(integration) → TL: Final verify (visual + logic)

### Bảng tổng hợp 3 routing modes:

| Loại | Đặc điểm | Pipeline | TL làm gì | G3 vai trò |
|------|----------|----------|-----------|------------|
| **A: Pure Visual** | Chỉ UI/UX | Fast Track: TL→TL→G2-B→TL | Code UI + Self-verify | Không tham gia |
| **B: Pure Backend** | Chỉ logic/API/DB | Standard: TL→G1→G2-A→G2-B→G3→TL | Phân tích + verify | Tối ưu code |
| **C: Hybrid** | Vừa UI vừa backend | Sequential: TL(UI)→G1→G2-A→G2-B(BE)→G3→TL | Code UI trước, rồi phối hợp Backend | Integration + Tối ưu |

---

## ⚡ CHI TIẾT TL — CƠ CHẾ CỦA KIMI K2.6

### Tại sao Kimi K2.6 phù hợp làm TL trong Code Team?

- **Khả năng thị giác mạnh**: Nhìn screenshot/mockup → Hiểu layout, màu sắc, component → Đánh giá complexity chính xác
- **300 Sub-agents**: Spawn SAs để phân tích yêu cầu thị giác song song → Phá vỡ bài toán chính xác
- **Khả năng code UI/UX**: Fast Track: Tự code giao diện từ visual input → Không cần qua pipeline cho tác vụ UI đơn thuần
- **Điều phối tự nhiên**: Giao tiếp với các group rõ ràng, theo dõi tiến độ, quyết định routing

### 7 Nhiệm vụ cốt lõi của TL:

1. **TIẾP NHẬN YÊU CẦU** — Nhìn screenshot/mockup nếu có, hiểu intent của user (visual + logic)
2. **PHÂN TÍCH COMPLEXITY + ROUTING** — Đánh giá: Pure Visual / Pure Backend / Hybrid, Scoring, Chọn Tier + Routing mode
3. **PHÁ VỠ BÀI TOÁN THÀNH PARTS** — Dùng thị giác để chia chính xác, Phần Visual → Fast Track, Phần Backend → Full Pipeline
4. **VIẾT .md MÔ TẢ CHO TỪNG PART** — Visual spec: Layout, màu, font, spacing, component. Logic spec: API, DB, business rules, integration
5. **FAST TRACK: CODE UI/UX KHI CẦN** — Tự code giao diện từ visual input, Self-verify bằng thị giác, Iterate đến khi ≥ 85% accuracy
6. **HỖ TRỢ G1 THỊ GIÁC KHI CẦN** — G1 cần phân tích UI → TL spawn SAs phân tích, TL cung cấp visual spec cho G1
7. **VERIFY KẾT QUẢ** — Visual: So sánh code output với mockup gốc. Logic: Test chức năng, kiểm tra worklog

### Fast Track — Kimi tự code UI/UX:

Kích hoạt khi: Tác vụ CHỦ YẾU là thị giác (Clone giao diện website, Thiết kế UI/UX từ mockup/screenshot, Replicate component visual, Chỉnh sửa visual)

Pipeline: TL → TL → TL → G2-B → TL

1. **ANALYZE** (Kimi nhìn + SAs phân tích) — Spawn SAs phân tích visual, Tổng hợp → Visual Spec chi tiết
2. **CODE** (Kimi tự code UI) — JSX/HTML structure, Tailwind/CSS classes, Component hierarchy, Responsive breakpoints, Animations/transitions
3. **SELF-VERIFY** (Kimi tự so sánh) — Nhìn screenshot code output, So sánh với screenshot gốc, Đánh giá accuracy. Nếu < 85% → TỰ ITERATE (tối đa 3 vòng). Nếu ≥ 85% → CHUYỂN G2-B
4. **G2-B (GLM)** — Code quality review (KHÔNG visual): Semantic HTML, Accessibility, Responsive edge cases, CSS performance
5. **TL (Kimi)** — Final visual verify → Done ✅ hoặc Ghi chú cần sửa → Loop

### Hỗ trợ chéo TL ↔ G1:

- **KỊCH BẢN 1: G1 CẦN THỊ GIÁC** — G1 đang thiết kế kiến trúc → Cần biết UI layout thực tế → TL spawn SAs phân tích → Gửi visual spec cho G1
- **KỊCH BẢN 2: TL CẦN KIẾN TRÚC** — TL đang Fast Track code UI nhưng cần kiến trúc state management → G1 tạo state architecture spec → Gửi cho TL

NGUYÊN TẮC: Hỗ trợ chéo KHÔNG PHÁ VỠ pipeline chính. Chỉ là "consultation". TL luôn là người quyết định cuối cùng.

### TL đọc code/selective review:

- ✅ ĐỌC khi: G2-B ESCALATE bug architectural, G3 phát hiện vấn đề thiết kế, Kết quả test KHÔNG KHỚP spec, User báo lỗi
- ❌ KHÔNG ĐỌC khi: G2-A báo cáo code hoàn thành theo spec, G2-B đã review + fix, G3 đã tối ưu
- Nguyên tắc: TIN TƯỞNG groups, kiểm tra bằng KẾT QUẢ

---

## 🏛️ CHI TIẾT G1 — CƠ CHẾ KIẾN TRÚC CỦA DEEPSEEK V4

### Tại sao DeepSeek V4 phù hợp làm Architecture Lead?

- **Suy luận sâu nhất**: Phân tích kiến trúc phức tạp: microservices vs monolith, SQL vs NoSQL, state management patterns
- **1M Context Window**: Đọc toàn bộ spec từ TL, hiểu mối quan hệ giữa tất cả components
- **Khả năng lập kế hoạch**: Thiết kế thứ tự triển khai, dependency giữa modules, integration points

### Nguyên tắc cốt lõi: "TL mô tả WHAT, G1 thiết kế HOW"

G1 quy định CÁCH triển khai — Database Schema, API Design, Component Tree, State Management, Security Architecture, Error Handling Strategy.

### 5 Bước trong G1:

1. **NHẬN SPEC TỪ TL** — Đọc .md spec, Hiểu yêu cầu nghiệp vụ, Xác định constraints, Yêu cầu TL hỗ trợ thị giác nếu cần
2. **PHÂN TÍCH KIẾN TRÚC** — Xác định modules, dependency, data flow, integration points, edge cases
3. **THIẾT KẾ CHI TIẾT** — DB Schema, API Design, Component Tree, State Management, Security Architecture, Error Handling
4. **TẠO ARCHITECTURE SPEC** — File paths, Code structure, DB schema, API endpoints, Error cases, Testing considerations
5. **GIAO CHO G2-A** — Gửi arch spec + worklog cho G2-A (Qwen3 Coder)

---

## 💻 CHI TIẾT G2-A — CƠ CHẾ CODE EXECUTION CỦA QWEN3 CODER

### Nguyên tắc cốt lõi: "Nhận spec → Code → Ghi chú → Báo cáo"

- Input: Architecture spec từ G1 (File paths, Code structure, DB schema, API endpoints, Error cases)
- Output: Code files + Worklog + Suggestions + Notes cho G2-B

### 4 Bước trong G2-A:

1. **ĐỌC ARCHITECTURE SPEC** — Lên kế hoạch thứ tự code: Types/Interfaces → Database models → API routes → Business logic
2. **CODE THEO TỪNG FILE** — Code đầy đủ theo spec, Error handling, Comments cho logic phức tạp, Notes về edge cases
3. **NOTES & SUGGESTIONS** — Notes cho G2-B về những đoạn cần review kỹ, Suggestions cho TL/G1 về cải tiến
4. **GỌI G2-B** — Gửi code + worklog cho G2-B review + fix bugs

---

## 🔍 CHI TIẾT G2-B — CƠ CHẾ REVIEW & BUG FIX CỦA GLM 5.1

### Tại sao GLM 5.1 phù hợp làm Bug Fixer?

- **400 tok/s**: Vòng lặp fix bug cực nhanh — sửa → kiểm tra → phát hiện bug mới → sửa lại
- **Iterative Refinement**: Tự tìm bug, tự sửa, tự verify — 1 agent làm cả reviewer + fixer
- **Short-context accuracy**: G2-B chỉ cần đọc 1-3 files cùng lúc, tập trung vào chi tiết

### Nguyên tắc cốt lõi: "Đọc → Tìm → Sửa → Kiểm tra → Lặp lại"

### 5 Loại bug (theo priority):

1. 🚨 **Security Issues** — CRITICAL #1 trong Code Team! Webhook không verify, SQL injection, XSS
2. 🔴 **Logic Bugs** — Sai business logic, thiếu validation
3. 🟡 **Type Errors** — TypeScript type mismatch, any abuse
4. 🟠 **Edge Cases** — Null, empty, boundary values, timeout
5. 🟢 **Compatibility** — Env mismatch, dependency conflict

### Bug Severity:

| Severity | Xử lý |
|----------|-------|
| 🔴 CRITICAL | Fix NGAY — không được bỏ qua |
| 🟠 HIGH | Fix trong vòng lặp |
| 🟡 MEDIUM | Fix nếu có token, không → G3 |
| 🟢 LOW | Ghi worklog, bỏ qua |

### Stop Criteria:

- ✅ PASS: Không tìm thấy bug mới sau 1 vòng
- ✅ PASS: Tối đa 3 vòng — nếu còn bug → Báo TL
- ✅ PASS: Bug còn lại = LOW severity → Ghi cho G3
- ⚠️ ESCALATE: Phát hiện architectural issue → DỪNG → Báo TL

---

## 🚀 CHI TIẾT G3 — CƠ CHẾ OPTIMIZATION CỦA MINIMAX M2.7

### Nguyên tắc cốt lõi: "Không chỉ sửa — mà làm TỐT HƠN"

G2-B Output = Code ĐÚNG (không bug, không security issue) → G3 Output = Code TỐT NHẤT (performance cao, code ngắn, scalable, maintainable)

### 5 Lĩnh vực tối ưu:

1. **Performance Optimization** — N+1 queries → include, bundle size, caching
2. **Code Simplification** — Strategy Pattern, DRY, remove duplication
3. **Architecture Refinement** — Separate concerns, clean abstractions
4. **Best Practices** — Error handling, logging, rate limiting, env validation
5. **Scalability** — DB indexes, connection pooling, pagination, CDN

### G3 — KẾT NỐI UI + BACKEND (Hybrid Mode):

Khi TL đã code UI xong VÀ G2-A→G2-B đã code Backend xong, G3 thực hiện kết nối (integration):

1. **ANALYZE INTEGRATION POINTS** — UI components cần data từ API nào? Forms cần POST đến endpoint nào?
2. **CONNECT UI ↔ API** — Data fetching strategy, Loading states, Optimistic updates, Cache invalidation
3. **OPTIMIZE INTEGRATION** — SSR vs CSR, debounce, error boundaries
4. **VERIFY INTEGRATION** — UI hiển thị data đúng, Forms submit đúng, Error handling khi API fail

### Self-Evolving — Knowledge Base:

Evolution Cycle: APPLY → EXPERIMENT → MEASURE → LEARN → REPEAT

Categories: Database, API Design, Frontend, Security, Anti-Patterns

---

## 📊 3-TIER WORKFLOW

### Scoring Matrix:

| Tiêu chí | Score 1 (Simple) | Score 2 (Medium) | Score 3 (Complex) |
|----------|------------------|-------------------|---------------------|
| Phạm vi | 1 file, <50 dòng | 2-5 files, module nhỏ | >5 files, multi-module |
| Suy luận | Fix bug rõ ràng | Feature mới cần design | Kiến trúc mới, tích hợp phức tạp |
| Rủi ro | Không ảnh hưởng module khác | Ảnh hưởng module liên quan | Ảnh hưởng toàn bộ hệ thống |

- **TIER 1 (Simple)**: Score 3-4 → TL → G2-B → TL
- **TIER 2 (Medium)**: Score 5-7 → TL → G1 → G2-A → G2-B → TL
- **TIER 3 (Complex)**: Score 8-9 → TL → G1 → G2-A → G2-B → G3 → TL

---

## 🔗 CƠ CHẾ THỰC THI TUẦN TỰ

### Nguyên tắc: Xử lý tuần tự, không song song

- Mỗi Part hoàn thành hẳn rồi mới đến Part tiếp theo
- Part nào cần làm trước? (nền tảng) → Sắp xếp theo dependency
- TL verify từng Part trước khi tiếp tục → Phát hiện lỗi sớm, không lan rộng

### Quy tắc điểm trở về TL:

- Tier 1: ...→ G2-B → TL
- Tier 2: ...→ G2-B → TL
- Tier 3: ...→ G3 → TL

### Vòng lặp chính của TL:

1. **NHẬN REQUEST** → Phân tích → Phá vỡ thành Parts → Viết .md
2. **SẮP XẾP THỨ TỰ PARTS THEO DEPENDENCY**
3. **THỰC THI TUẦN TỪ TỪNG PART** → TL chọn Tier + Routing → Giao Group → Chờ báo cáo → Verify → Pass/Fail
4. **KIỂM TRA TỔNG THỂ** → Test toàn bộ hệ thống
5. **BÁO CÁO HOÀN TẤT**

---

## 🔄 READ-WRITE-VERIFY LOOP — TL LÀ AGENTIC LOOP CONTROLLER

### 4 Bước:

1. **WRITE** — Mỗi G sau khi xong việc → GHI worklog + Code Location Map
2. **READ** — TL đọc lại worklog sau mỗi Group (Checkpoint)
3. **VERIFY** — TL so sánh worklog với spec → CONTINUE / PIVOT / ESCALATE
4. **UPDATE** — TL cập nhật .md → Giao Group tiếp hoặc điều chỉnh

### Checkpoint Schedule:

- **CP1**: Sau G1 hoàn thành Architecture Spec → TL ĐỌC → VERIFY → CONTINUE/PIVOT
- **CP2**: Sau G2-A hoàn thành Code → TL ĐỌC → VERIFY → CONTINUE/PIVOT
- **CP3**: Sau G2-B hoàn thành Review & Fix → TL ĐỌC → VERIFY → CONTINUE/PIVOT
- **CP4**: Sau G3 hoàn thành Optimization → TL ĐỌC → FINAL VERIFY → DONE ✅

### Pivot Triggers:

- 🔴 PHẢI PIVOT: G1 báo approach không feasible, G2-B ESCALATE security flaw, Direction sai hoàn toàn
- 🟡 CÓ THỂ PIVOT: G2-B hết 3 vòng fix vẫn còn bug, G3 suggest approach khác tốt hơn
- 🟢 KHÔNG CẦN PIVOT: Bugs nhỏ đang fix, Progress đúng kế hoạch

---

## 🎯 DIRECTED READING + CODE LOCATION MAP

### 3 Lớp thông tin G2-B/G3 cần:

- **LỚP 1: SPEC** (Từ TL) — "Yêu cầu gốc là gì?" — North Star
- **LỚP 2: WORKLOG** (Từ G trước) — "G trước đã làm gì?" — Context + Bản đồ
- **LỚP 3: CODE THẬT** (Từ file system) — "Code thực sự viết như thế nào?" — Ground Truth

### Chiến lược Directed Reading:

1. **ĐỌC WORKLOG TRƯỚC** — Code Location Map là BẢN ĐỒ → Cho biết CODE NÀO cần đọc, CODE NÀO bỏ qua
2. **ĐỌC CODE THEO CHỈ ĐIỂM** — Chỉ đọc files được đánh dấu, theo thứ tự ưu tiên (🔴 → 🟠 → 🟡)
3. **ĐỌC SPEC ĐỂ VERIFY** — So code với spec gốc
4. **FIX/OPTIMIZE + VERIFY** — Sửa code, cập nhật worklog + Code Location Map

### G2-B vs G3 — Khác nhau ở chiến lược đọc:

- **G2-B**: Đọc theo Bug Locations — selective, local fix. Tìm: bugs, errors, security issues
- **G3**: Đọc theo Dependency Chain — wider, structural improvement. Tìm: inefficiency, redundancy, overcomplexity

### Quy tắc bắt buộc:

1. Mỗi G khi hoàn thành → PHẢI GHI CODE LOCATION MAP (file nào cần đọc/bỏ qua, dòng nào có issue, dependencies, reading strategy)
2. Mỗi G khi bắt đầu → PHẢI ĐỌC CODE LOCATION MAP (đọc map TRƯỚC khi đọc code, chỉ đọc files được đánh dấu)
3. TL đọc CHỈ WORKLOG + CODE LOCATION MAP, KHÔNG đọc code trực tiếp (trừ khi ESCALATE)

---

## 📋 TÓM TẮT — BẢNG THAM CHIẾU NHANH

### Phân vai:

| Vị trí | Model | Vai trò | Nguyên tắc |
|--------|-------|---------|-----------|
| **TL** | Kimi K2.6 | Nhìn & Điều hướng | NHÌN thị giác, PHÂN LOẠI routing, CODE UI (Fast Track), VERIFY kết quả |
| **G1** | DeepSeek V4 | Thiết kế kiến trúc | TL nói CẦN GÌ → G1 thiết kế LÀM THẾ NÀO, suy luận sâu, 1M context |
| **G2-A** | Qwen3 Coder | Code execution | Nhận arch spec → Code → Notes → Suggestions |
| **G2-B** | GLM 5.1 | Review & Fix | 5 loại bug, Priority #1 = Security, max 3 vòng iteration |
| **G3** | MiniMax M2.7 | Optimization | 5 lĩnh vực tối ưu, Self-evolving, Kết nối UI+Backend |

### Routing:

| Loại | Pipeline | Khi nào dùng |
|------|----------|-------------|
| **A: Pure Visual** | TL→TL→G2-B→TL | Clone UI, Thiết kế giao diện, Sửa visual |
| **B: Pure Backend** | TL→G1→G2-A→G2-B→G3→TL | API, Database, Business logic, Integration |
| **C: Hybrid** | TL(UI)‖G1→G2-A→G2-B(BE)→G3→TL | Full website, Full-stack app |

### Tier:

| Tier | Score | Pipeline | Group báo cáo TL | Loại task |
|------|-------|----------|-------------------|-----------|
| **1: Simple** | 3-4 | TL→G2-B→TL | G2-B | Bug nhỏ, CSS tweak, typo |
| **2: Medium** | 5-7 | TL→G1→G2-A→G2-B→TL | G2-B | Feature mới, 1 module, Clone 1 page |
| **3: Complex** | 8-9 | TL→G1→G2-A→G2-B→G3→TL | G3 | Full website, Multi-module, Integration |
