# 🏗️ Bản Đồ Quy Trình Full-Stack Agent — Phiên Bản 2.0

> Tài liệu mô tả đầy đủ 9 Layer gồm 22 Quy Trình cần thiết để xây dựng một agent full-stack hoàn chỉnh, tương đương Claude Code, Z.ai Code, hay các công cụ engineering agent chuyên nghiệp.
>
> **Phiên bản 2.0** phát triển từ bản gốc với các cải tiến:
> - **Solo Mode**: Agent độc lập tự thực hiện toàn bộ pipeline (không cần team)
> - **Token Monitoring System**: Theo dõi & cảnh báo (không giới hạn cứng — NVIDIA NIM miễn phí)
> - **Tích hợp Smolab**: Single/Multi mode chuyển đổi liền mạch
> - **Sequential Pipeline**: Giữ nguyên cơ chế tuần tự TL → G1 → G2-A → G2-B → G3

---

## Mục Lục

- [Layer 1: Tiếp Nhận & Hiểu (Intake & Comprehension)](#layer-1-tiếp-nhận--hiểu-intake--comprehension)
- [Layer 2: Tư Duy & Lập Kế Hoạch (Thinking & Planning)](#layer-2-tư-duy--lập-kế-hoạch-thinking--planning)
- [Layer 3: Thực Thi (Execution)](#layer-3-thực-thi-execution)
- [Layer 4: Kiểm Chứng (Verification)](#layer-4-kiểm-chứng-verification)
- [Layer 5: Xử Lý Lỗi (Error Handling)](#layer-5-xử-lý-lỗi-error-handling)
- [Layer 6: Quản Lý Trạng Thái (State Management)](#layer-6-quản-lý-trạng-thái-state-management)
- [Layer 7: Điều Phối (Orchestration)](#layer-7-điều-phối-orchestration)
- [Layer 8: Giao Tiếp (Communication)](#layer-8-giao-tiếp-communication)
- [Layer 9: Học Tập & Thích Ứng (Learning & Adaptation)](#layer-9-học-tập--thích-ứng-learning--adaptation)
- [Sơ Đồ Tổng Thể](#sơ-đồ-tổng-thể)
- [Bảng Tóm Tắt](#bảng-tóm-tắt)
- [Điều Kiện Tối Thiểu](#điều-kiện-tối-thiểu-minimum-viable-agent)

---

## Layer 1: Tiếp Nhận & Hiểu (Intake & Comprehension)

Layer này chịu trách nhiệm tiếp nhận yêu cầu từ user, hiểu ý định thực sự, và xây dựng "mô hình tâm trí" về codebase trước khi bắt đầu làm bất cứ điều gì.

### 1.1 Quy trình Phân tích Intent (Intent Parsing)

```
User Message → Intent Classification → Structured Task
```

**Mục đích**: Hiểu user muốn gì thực sự — không phải chỉ đọc chữ bề mặt, mà hiểu ý định sâu hơn.

**Các bước**:

1. **Phát hiện loại tác vụ**: Phân loại yêu cầu thành một trong các loại:
   - `create` — Tạo mới (component, page, API, schema...)
   - `modify` — Sửa đổi code hiện có
   - `fix` — Sửa lỗi (bug fix)
   - `analyze` — Phân tích code, giải thích, review
   - `refactor` — Tái cấu trúc code
   - `hybrid` — Kết hợp nhiều loại trên

2. **Trích xuất constraints**: Xác định các ràng buộc kỹ thuật:
   - Framework yêuebe cầu (Next.js, React...)
   - Styling preferences (Tailwind, shadcn/ui...)
   - Database requirements (Prisma, schema...)
   - API requirements (REST, WebSocket...)
   - Performance requirements

3. **Phát hiện ambiguity**: Nhận diện câu hỏi mơ hồ → cần clarification:
   - Yêu cầu conflicting ("dùng MySQL" nhưng stack chỉ có SQLite)
   - Thiếu thông tin quan trọng (không nói rõ UI như thế nào)
   - Nhiều cách hiểu khác nhau

4. **Phát hiện implicit requirements**: Yêu cầu user không nói nhưng bắt buộc phải có:
   - Responsive design
   - Error handling
   - Loading states
   - Accessibility
   - Type safety

**Ví dụ**:

| User nói | Intent thực sự | Implicit requirements |
|----------|---------------|----------------------|
| "Tạo trang dashboard" | `create` + UI page | Responsive, loading states, error boundaries |
| "Sửa lỗi trắng trang" | `fix` + runtime error | Cần đọc error log, trace root cause |
| "Thêm tính năng search" | `create` + `modify` | Cần API endpoint, UI component, debounce |

**Độ khó**: ⭐⭐⭐ — Đòi hỏi hiểu ngữ cảnh tự nhiên, phân biệt literal meaning vs intent

---

### 1.2 Quy trình Đọc Codebase (Code Reading)

```
Project Structure → File Prioritization → Selective Reading → Mental Model
```

**Mục đích**: Xây dựng "mental model" của project trước khi thực hiện bất kỳ thay đổi nào. Không đọc code thì không thể code đúng.

**Các bước**:

1. **Structure Scan**: Đọc folder structure → hiểu architecture tổng thể
   - `src/app/` → Next.js App Router pages
   - `src/components/` → UI components
   - `src/lib/` → Business logic, utilities
   - `prisma/` → Database schema
   - `mini-services/` → Separate services

2. **Priority Reading**: Đọc file quan trọng trước theo thứ tự ưu tiên:
   - `page.tsx` — Trang chính, entry point
   - `layout.tsx` — Layout wrapper
   - `schema.prisma` — Database schema
   - Route files — API endpoints
   - Configuration files — `next.config.ts`, `tsconfig.json`

3. **Dependency Mapping**: Tìm import chains → hiểu quan hệ giữa các file
   - Component A import Component B
   - Page import từ lib/utils
   - API route dùng Prisma client

4. **Pattern Detection**: Nhận diện patterns đang dùng:
   - shadcn/ui components?
   - Prisma ORM?
   - Zustand state management?
   - TanStack Query?
   - Socket.io?

5. **Convention Learning**: Học code style, naming conventions, file organization:
   - PascalCase cho components
   - camelCase cho functions
   - kebab-case cho file names
   - Import order: react → next → third-party → local

**Độ khó**: ⭐⭐ — Phức tạp ở chỗ phải biết đọc gì, bỏ qua gì (không đọc tất cả)

---

### 1.3 Quy trình Đọc Context (Context Assembly)

```
Task + Codebase → Relevant Context → Compressed Context Window
```

**Mục đích**: Chọn đúng thông tin đưa vào context window. Vì token có giới hạn, không thể đưa tất cả code vào context — phải chọn lọc thông minh.

**Chiến lược**:

1. **Relevance-based**: Chỉ đọc file liên quan đến task
   - Task về UI → đọc component files, layout
   - Task về API → đọc route handlers, prisma schema
   - Task về DB → đọc schema, migrations

2. **Dependency-based**: Đọc cả file mà task phụ thuộc vào
   - Sửa component → đọc cả file chứa type definitions
   - Thêm API → đọc cả prisma schema
   - Tạo page → đọc cả layout, existing pages

3. **Compression**: Tóm tắt file dài thay vì đọc toàn bộ
   - File 500 dòng → tóm tắt structure + key functions
   - Chỉ giữ signature, bỏ implementation details
   - Giữ comments quan trọng, bỏ trivial comments

4. **Progressive Loading**: Đọc thêm khi cần, không đọc tất cả từ đầu
   - Bắt đầu với minimal context
   - Khi cần thêm → đọc thêm file
   - Khi gặp unfamiliar code → đọc thêm
   - Tránh "over-reading" — tốn token mà không cần

**Độ khó**: ⭐⭐⭐ — Cần heuristic tốt để quyết định đọc gì, compress thế nào

---

## Layer 2: Tư Duy & Lập Kế Hoạch (Thinking & Planning)

Layer này chuyển hóa understanding thành action plan — chia nhỏ vấn đề, thiết kế giải pháp, và ước lượng tài nguyên cần thiết.

### 2.1 Quy trình Phân rã Vấn đề (Problem Decomposition)

```
Complex Task → Sub-tasks → Dependency Graph → Execution Order
```

**Mục đích**: Chia task lớn thành các bước nhỏ, có thể thực hiện tuần tự. Đây là quy trình quan trọng nhất — phân rã sai thì toàn bộ execution sai.

**Các bước**:

1. **Decompose**: Task → danh sách sub-tasks
   - Mỗi sub-task phải:
     - Có mục tiêu rõ ràng
     - Có output xác định
     - Có thể verify được
     - Không quá lớn (1 sub-task = 1 file hoặc 1 feature nhỏ)

2. **Classify**: Mỗi sub-task thuộc loại nào:
   - `frontend` — UI components, pages, styling
   - `backend` — API routes, server logic
   - `database` — Schema, migrations, queries
   - `config` — Configuration files, setup
   - `integration` — Kết nối các phần lại với nhau

3. **Dependency Analysis**: Xác định quan hệ phụ thuộc:
   - Task A phải xong trước Task B (sequential)
   - Task C và Task D làm song song được (parallel)
   - Task E cần output của Task A và Task D

4. **Topological Sort**: Sắp xếp thứ tự thực hiện dựa trên dependencies
   - Không có circular dependencies
   - Tasks không phụ thuộc nhau → parallel
   - Tasks phụ thuộc nhau → sequential

5. **Estimation**: Ước lượng cho mỗi sub-task:
   - Complexity: simple | medium | complex
   - Token budget cần thiết
   - Files cần đọc/viết
   - Risks có thể gặp

**Ví dụ**: Task "Tạo trang blog với CRUD"

```
Task gốc: Tạo blog system
├── Sub-task 1: [database] Tạo Prisma schema cho Post model
├── Sub-task 2: [backend] Tạo API CRUD endpoints (/api/posts)
├── Sub-task 3: [frontend] Tạo UI components (PostCard, PostForm, PostList)
├── Sub-task 4: [frontend] Tạo trang blog page với list view
├── Sub-task 5: [frontend] Tạo trang create/edit post
├── Sub-task 6: [integration] Kết nối UI ↔ API ↔ DB
└── Sub-task 7: [verify] Test full CRUD flow
```

**Độ khó**: ⭐⭐⭐ — Cần kinh nghiệm software engineering để phân rã đúng

---

### 2.2 Quy trình Thiết kế Giải pháp (Solution Design)

```
Sub-task + Constraints → Architecture Decision → Implementation Plan
```

**Mục đích**: Trước khi code, phải biết code cái gì và code thế nào. "Measure twice, cut once."

**Các bước**:

1. **Architecture Decision**: Chọn approach phù hợp
   - REST vs WebSocket (cho real-time features)
   - SSR vs CSR (cho data-heavy pages)
   - Server Action vs API Route (cho form submissions)
   - Local state vs Global state (cho state management)

2. **Component Design**: Thiết kế UI component tree
   - Component hierarchy
   - Props interface
   - Data flow direction
   - Event handling

3. **Schema Design**: Thiết kế database schema
   - Models và relations
   - Fields và types
   - Indexes
   - Constraints

4. **API Design**: Thiết kế API contracts
   - Endpoints
   - Request format
   - Response format
   - Error format
   - Authentication/Authorization

5. **State Design**: Thiết kế state management
   - What state to store
   - Where to store (local, global, server)
   - How to update (actions, mutations)
   - How to sync (real-time, polling)

**Độ khó**: ⭐⭐⭐ — Cần kiến thức architecture rộng, trade-off analysis

---

### 2.3 Quy trình Theo Dõi Token (Token Monitoring)

```
Sub-task + Complexity → Token Usage Tracking → Performance Insights
```

**Mục đích**: Theo dõi token sử dụng để tối ưu hiệu quả và cảnh báo khi cần. **Không giới hạn cứng** — NVIDIA NIM miễn phí, ưu tiên hiệu quả.

**Phương pháp**:

1. **Heuristic**: Task type → base budget (theo dõi, không giới hạn)
   | Task Type | Base Budget ( tokens) |
   |-----------|---------------------|
   | Think/Analyze | 2,000 |
   | Explore/Read | 4,000 |
   | Create/Generate | 6,000 |
   | Modify/Edit | 4,000 |
   | Verify/Check | 2,000 |
   | Report | 6,000 |

2. **Complexity Multiplier**:
   - Simple: × 1.0
   - Medium: × 1.5
   - Complex: × 2.0

3. **Historical Feedback**: Task tương tự trước đây tốn bao nhiêu token thực tế?
   - Track actual vs budgeted
   - Adjust future budgets based on history

4. **Safety Margin**: +20% buffer cho unexpected situations

**Độ khó**: ⭐⭐ — Cần data historical để chính xác, ban đầu phải dùng heuristic

---

## Layer 3: Thực Thi (Execution)

Layer này thực hiện các bước đã lên kế hoạch — route đến đúng executor, sinh code, và thao tác file.

### 3.1 Quy trình Route Step (Step Routing)

```
Sub-task Type → Appropriate Executor → Execution Context
```

**Mục đích**: Mỗi loại task cần executor khác nhau với tools khác nhau. Route sai executor = thực thi sai cách.

**Routing Table**:

| Task Type | Executor | Tools Needed | Typical Output |
|-----------|----------|-------------|----------------|
| Analyze | Analysis Executor | Read, Grep, Glob | Analysis report |
| Create | Creation Executor | Write, Bash | New files |
| Modify | Modification Executor | Read, Edit, MultiEdit | Modified files |
| Database | DB Executor | Prisma, db:push | Schema, migrations |
| API | API Executor | Write, Bash | API routes |
| UI | UI Executor | Write, Skill | Components, pages |
| Verify | Verification Executor | Bash, Agent Browser | Verification results |

**Quy tắc routing**:

1. Một step chỉ có 1 primary executor
2. Executor có thể gọi tools từ executor khác nếu cần
3. Complex steps có thể cần multiple executors (sequential)
4. Routing decision phải xét: task type + dependencies + available tools

**Độ khó**: ⭐⭐ — Logic routing đơn giản, phức tạp ở edge cases

---

### 3.2 Quy trình Sinh Code (Code Generation)

```
Implementation Plan → Code → File
```

**Mục đích**: Viết code chính xác, đúng convention, đúng architecture. Đây là "trái tim" của agent.

**Nguyên tắc**:

1. **Convention-First**: Follow existing code style
   - Cùng naming convention
   - Cùng import order
   - Cùng component structure
   - Cùng error handling pattern

2. **Component-First**: UI trước, logic sau
   - Tạo UI component → tạo data fetching → tạo event handlers
   - Giúp user thấy kết quả sớm

3. **Type-Safe**: TypeScript strict, Prisma typed
   - Không dùng `any` trừ khi thực sự cần
   - Định nghĩa types/interfaces rõ ràng
   - Sử dụng Prisma generated types

4. **Incremental**: Viết từng phần, không viết tất cả cùng lúc
   - Mỗi step = 1 phần hoàn chỉnh
   - Verify từng phần trước khi tiếp tục
   - Tránh "big bang" approach

5. **Self-Contained**: Mỗi step nên hoàn chỉnh một feature nhỏ
   - Feature A hoàn chỉnh → Feature B hoàn chỉnh
   - Không để code dở dang giữa chừng

**Quy trình sinh code**:

```
1. Đọc context (files liên quan)
2. Xác định code cần viết
3. Sinh code theo implementation plan
4. Kiểm tra code self-consistency
5. Viết vào file
6. Verify (Layer 4)
```

**Độ khó**: ⭐⭐⭐ — Yêu cầu kiến thức lập trình rộng và sâu, phải code đúng ở lần đầu

---

### 3.3 Quy trình Thao tác File (File Operations)

```
Decision → Read/Write/Edit → Verification
```

**Mục đích**: Thao tác file an toàn, không làm hỏng code cũ. Một thao tác sai có thể break toàn bộ app.

**Quy tắc**:

1. **Read Before Write**: Luôn đọc file trước khi sửa
   - Hiểu cấu trúc hiện tại
   - Biết position cần sửa
   - Tránh overwrite nhầm

2. **Surgical Edit**: Chỉ sửa phần cần thiết, không rewrite toàn file
   - Dùng Edit thay vì Write cho file hiện có
   - Dùng MultiEdit cho nhiều thay đổi cùng file
   - Giữ nguyên phần code không liên quan

3. **Atomic Operation**: Mỗi edit nên là một thay đổi logic hoàn chỉnh
   - Không để code ở trạng thái half-written
   - Mỗi edit = 1 intention rõ ràng
   - Nếu edit fail → file vẫn ở valid state

4. **Backup Awareness**: Biết khi nào cần revert
   - Trước khi refactor lớn
   - Khi không chắc về thay đổi
   - Khi cần thử nghiệm approach khác

**Thứ tự thao tác**:

```
1. Read file → hiểu nội dung hiện tại
2. Identify vị trí cần sửa
3. Apply edit (surgical, precise)
4. Verify edit (read lại nếu cần)
5. Run verification (lint, type check)
```

**Độ khó**: ⭐⭐ — Đơn giản về concept, phức tạp ở precision và edge cases

---

## Layer 4: Kiểm Chứng (Verification)

Layer này đảm bảo code đã viết thực sự hoạt động — từ kiểm tra tĩnh (lint) đến runtime (chạy app) đến trực quan (browser).

### 4.1 Quy trình Kiểm tra Tĩnh (Static Verification)

```
Code → Lint → Type Check → Static Analysis → Pass/Fail
```

**Mục đích**: Phát hiện lỗi mà không cần chạy code. Nhanh, cheap, nên chạy sau mỗi step.

**Các loại kiểm tra**:

1. **Lint**: `bun run lint` — Code quality rules
   - Unused variables
   - Missing dependencies
   - Incorrect hooks usage
   - Accessibility violations

2. **Type Check**: TypeScript compiler — Type errors
   - Type mismatches
   - Missing type annotations
   - Incorrect generic usage
   - Null/undefined errors

3. **Import Check**: Đảm bảo import paths đúng
   - File exists
   - Export exists
   - No circular imports
   - Correct relative paths

4. **Convention Check**: Naming, formatting consistent
   - PascalCase components
   - camelCase functions
   - Consistent file naming
   - Consistent code style

**Độ khó**: ⭐ — Đã có tool sẵn, chỉ cần chạy và parse output

---

### 4.2 Quy trình Kiểm tra Runtime (Runtime Verification)

```
Running App → API Call → Response Check → Pass/Fail
```

**Mục đích**: Kiểm tra app thực sự chạy và hoạt động đúng. Static pass ≠ runtime pass.

**Các loại kiểm tra**:

1. **Dev Server Check**: App có chạy không? Có lỗi compile không?
   - Check dev.log cho errors
   - Verify page loads without crash
   - Check hydration errors

2. **API Testing**: Endpoint trả đúng data không?
   - GET returns expected data
   - POST creates resource correctly
   - PUT updates correctly
   - DELETE removes correctly
   - Error responses are correct

3. **Database Testing**: Schema đúng? CRUD hoạt động?
   - Schema applied successfully
   - CRUD operations work
   - Relations work correctly
   - Constraints enforced

4. **WebSocket Testing**: Connection ổn định? Messages gửi nhận đúng?
   - Connection established
   - Messages received in order
   - Reconnection works
   - Error handling works

**Độ khó**: ⭐⭐ — Cần app đang chạy, khó automated fully

---

### 4.3 Quy trình Kiểm tra Trực quan (Visual Verification)

```
Browser → Screenshot → Compare with Expectation → Pass/Fail
```

**Mục đích**: Đảm bảo UI hiển thị đúng — không trắng trang, không layout bị lỗi, không hydration mismatch.

**Công cụ**: Agent Browser (headless browser automation)

**Kiểm tra**:

1. **Render Check**: Page có hiển thị không?
   - Không trắng trang
   - Không error boundary
   - Không hydration crash

2. **Layout Check**: Responsive đúng?
   - Mobile layout correct
   - Desktop layout correct
   - Footer sticky (nếu có)
   - No overflow issues

3. **Interaction Check**: Button click hoạt động? Form submit?
   - Buttons are clickable
   - Forms submit correctly
   - Modals open/close
   - Navigation works

4. **Error Check**: Console errors?
   - No JavaScript errors
   - No hydration mismatches
   - No missing resources
   - No CORS errors

**Độ khó**: ⭐⭐⭐ — Cần browser automation, khó detect visual issues programmatically

---

### 4.4 Quy trình Kiểm tra Tích hợp (Integration Verification)

```
Frontend + Backend + DB → E2E Flow → Pass/Fail
```

**Mục đích**: Đảm bảo toàn bộ stack hoạt động cùng nhau — không chỉ từng phần riêng lẻ.

**Kiểm tra**:

1. **Full flow**: UI → API → DB → API → UI
   - User action → API call → DB query → Response → UI update
   - Data flows correctly through all layers

2. **Data consistency**: Data đồng nhất giữa các layer
   - DB data matches API response
   - API response matches UI display
   - No data loss between layers

3. **Error propagation**: Lỗi được xử lý đúng qua các layer
   - DB error → API error → UI error message
   - API error → UI shows error
   - Network error → UI shows fallback

**Độ khó**: ⭐⭐⭐ — Phức tạp nhất, cần tất cả layers hoạt động

---

## Layer 5: Xử Lý Lỗi (Error Handling)

Layer này xử lý khi mọi thứ không đi theo kế hoạch — phát hiện lỗi, tìm nguyên nhân gốc, sửa, và tránh lặp lại cùng một cách.

### 5.1 Quy trình Phát hiện Lỗi (Error Detection)

```
Execution Result → Error Classification → Error Context
```

**Mục đích**: Không chỉ biết "có lỗi" mà phải biết "lỗi gì", "nghiêm trọng thế nào", "ảnh hưởng gì".

**Phân loại lỗi**:

| Error Type | Severity | Example | Recovery Strategy |
|-----------|----------|---------|------------------|
| Compile Error | 🔴 Critical | Syntax error, missing import | Fix immediately, cannot proceed |
| Type Error | 🟠 High | Type mismatch, missing property | Fix before continuing |
| Lint Warning | 🟡 Medium | Unused variable, any type | Fix if related, defer if not |
| Runtime Error | 🔴 Critical | Cannot read property of undefined | Debug → Fix → Re-verify |
| Logic Error | 🟠 High | Wrong calculation, wrong condition | Analyze → Redesign → Re-implement |
| Hydration Error | 🟡 Medium | Server/client mismatch | Check SSR/CSR difference |
| API Error | 🟠 High | 404, 500, timeout | Check endpoint, params, auth |
| Network Error | 🟠 High | CORS, connection refused | Check config, service status |

**Độ khó**: ⭐⭐ — Cần parse error messages chính xác, đặc biệt với TypeScript errors phức tạp

---

### 5.2 Quy trình Phân tích Nguyên nhân gốc (Root Cause Analysis)

```
Error → Context Collection → Hypothesis → Verification → Root Cause
```

**Mục đích**: Tìm nguyên nhân GỐC, không chỉ triệu chứng. Sửa triệu chứng → lỗi tái diễn. Sửa nguyên nhân gốc → lỗi biến mất.

**Quy trình**:

1. **Đọc error message carefully**: Hiểu chính xác lỗi nói gì
   - Không skip error message
   - Parse stack trace
   - Identify file và line number

2. **Đọc file liên quan**: Đọc code xung quanh error
   - File chứa error
   - File import bởi file chứa error
   - Type definitions liên quan

3. **Trace error source**: Theo stack trace ngược lên
   - Error ở đâu được throw?
   - Error propagate qua đâu?
   - Error surface ở đâu?

4. **Form hypothesis**: "Lỗi này do X vì Y"
   - Ví dụ: "Lỗi TypeError vì property `checks` không tồn tại trên object TEA Engine verification — TEA Engine không có field `checks`, chỉ có `teaEngine`, `iterations`, `phases`"

5. **Verify hypothesis**: Đọc thêm code để confirm
   - Đọc type definitions
   - Đọc usage patterns
   - Cross-reference với error message

6. **Identify root cause**: Xác định chính xác nguyên nhân
   - Không phải "code bị lỗi" mà là "code expect format A nhưng nhận format B"

**Độ khó**: ⭐⭐⭐ — Đòi hỏi tư duy phân tích sắc bén và kinh nghiệm debug

---

### 5.3 Quy trình Sửa lỗi (Error Recovery)

```
Root Cause → Fix Strategy → Apply Fix → Re-verify
```

**Mục đích**: Sửa lỗi đúng cách — không chỉ "make it work" mà "make it right".

**Chiến lược**:

1. **Surgical Fix**: Sửa đúng dòng lỗi
   - Phù hợp cho: typo, small bugs, missing properties
   - Nhanh, ít rủi ro
   - Ví dụ: Thêm optional chaining `?.` cho property có thể undefined

2. **Refactoring Fix**: Sửa cấu trúc code
   - Phù hợp cho: design errors, inconsistent patterns
   - Thay đổi nhiều hơn nhưng làm code tốt hơn
   - Ví dụ: Normalize hai format verification khác nhau thành một interface chung

3. **Redesign Fix**: Thay đổi approach
   - Phù hợp cho: fundamental errors, wrong architecture
   - Thay đổi lớn nhưng cần thiết
   - Ví dụ: Đổi từ Server Actions sang API Routes vì requirement thay đổi

4. **Rollback Fix**: Revert về state trước đó
   - Phù hợp cho: broken changes, cannot fix quickly
   - An toàn, nhưng mất progress
   - Ví dụ: Revert refactor gây ra nhiều lỗi hơn

**Quy trình**:

```
1. Choose strategy dựa trên root cause
2. Implement fix
3. Verify fix (static → runtime → visual)
4. Verify không tạo lỗi mới (regression)
5. Record fix cho future reference
```

**Độ khó**: ⭐⭐ — Implement fix thường dễ hơn tìm root cause

---

### 5.4 Quy trình Xử lý Loop (Loop Detection & Recovery)

```
Same Error Repeats → Pattern Detection → Strategy Change
```

**Mục đích**: Tránh "fix loop" — sửa cùng một lỗi mãi bằng cùng một cách. Đây là anti-pattern phổ biến nhất của agent.

**Nguyên tắc quan trọng**:

> **Nếu cùng một cách sửa không hoạt động 2 lần → PHẢI ĐỔI CHIẾN LƯỢC**

**Các bước**:

1. **Detect**: Cùng lỗi xuất hiện lần 2+
   - Track error patterns
   - Compare with previous errors
   - Identify: "Đây là lỗi mới hay lỗi cũ?"

2. **Analyze**: Tại sao fix cũ không work?
   - Fix không đúng root cause?
   - Fix đúng nhưng gây side effect?
   - Có factor khác chưa xét đến?

3. **Pivot**: Thử approach hoàn toàn khác
   - Đổi surgical fix → refactoring fix
   - Đổi approach A → approach B
   - Đọc thêm code để hiểu context tốt hơn
   - Tìm kiếm online cho similar issues

4. **Escalate**: Nếu vẫn fail → hỏi user
   - Present: "Tôi đã thử A và B, cả hai không work. Lỗi là X. Bạn có gợi ý không?"
   - Đừng tiếp tục loop vô hạn

**Anti-patterns cần tránh**:

- ❌ Sửa → lỗi → sửa cùng cách → vẫn lỗi → sửa cùng cách → vẫn lỗi...
- ❌ Thêm `// @ts-ignore` thay vì fix type error
- ❌ Wrap trong try-catch thay vì handle error
- ❌ Restart dev server thay vì fix root cause

**Độ khó**: ⭐⭐⭐ — Cần self-awareness để nhận ra mình đang loop

---

## Layer 6: Quản Lý Trạng Thái (State Management)

Layer này quản lý "trí nhớ" của agent — theo dõi tiến độ, quản lý context window, và lưu checkpoint để có thể restore.

### 6.1 Quy trình Theo dõi Tiến độ (Progress Tracking)

```
Plan → Current Step → Completed Steps → Remaining Steps
```

**Mục đích**: Agent phải biết mình đang ở đâu, đã làm gì, còn gì phải làm. Không có tracking = blind execution.

**Cần track**:

1. **Step status**: `pending` | `in_progress` | `completed` | `failed`
2. **Step results**: Code written, files modified, errors encountered
3. **Overall progress**: X/Y steps completed
4. **Token usage**: Budgeted vs actual per step
5. **Time spent**: Per step và total

**Format**:

```typescript
interface ProgressState {
  planId: string;
  totalSteps: number;
  completedSteps: number;
  currentStep: number;
  steps: StepState[];
  totalTokensUsed: number;
  totalTokensBudgeted: number;
  errors: ErrorRecord[];
}

interface StepState {
  id: number;
  type: StepType;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: StepResult;
  tokensUsed?: number;
  tokensBudgeted?: number;
  errors?: ErrorRecord[];
}
```

**Độ khó**: ⭐ — Đơn giản về concept, chỉ cần persist state đúng

---

### 6.2 Quy trình Quản lý Context Window (Context Management)

```
Long Conversation → Context Overflow Risk → Context Pruning/Compression
```

**Mục đích**: Token có giới hạn → phải quản lý context thông minh. Giữ quá nhiều → overflow. Giữ quá ít → mất thông tin quan trọng.

**Chiến lược**:

1. **Summarization**: Tóm tắt kết quả step đã xong thay vì giữ nguyên
   - Step đã complete → tóm tắt thành 2-3 dòng
   - Giữ key decisions và results
   - Bỏ intermediate attempts và errors đã fix

2. **Prioritization**: Giữ context gần nhất + quan trọng nhất
   - Recent context > old context
   - Relevant context > irrelevant context
   - Error context > success context (errors contain learning)

3. **Worklog**: Ghi ra file để đọc lại khi cần
   - Thay vì giữ trong memory → ghi ra worklog.md
   - Khi cần context cũ → đọc lại worklog
   - Format structured để dễ parse

4. **Progressive Context**: Load context khi cần
   - Không load tất cả từ đầu
   - Load khi step cần
   - Unload khi không cần nữa

**Độ khó**: ⭐⭐⭐ — Cần heuristic tốt, trade-off giữa giữ và bỏ

---

### 6.3 Quy trình Checkpoint & Recovery (Checkpointing)

```
Critical Point → Save State → Continue → Can Restore
```

**Mục đích**: Lưu state tại điểm quan trọng để có thể restore nếu cần. Giống "save game" — không muốn làm lại từ đầu nếu fail ở giữa.

**Khi nào checkpoint**:

1. Sau khi hoàn thành một phase (frontend done, backend done)
2. Trước khi thực hiện thay đổi rủi ro (refactor lớn, schema change)
3. Sau khi fix xong một lỗi quan trọng
4. Khi context window sắp đầy (checkpoint ra file)

**Checkpoint content**:

```typescript
interface Checkpoint {
  id: string;
  timestamp: number;
  phase: string;
  completedSteps: number[];
  filesModified: string[];
  keyDecisions: string[];
  pendingIssues: string[];
}
```

**Độ khó**: ⭐⭐ — Concept đơn giản, implementation cần careful

---

## Layer 7: Điều Phối (Orchestration)

Layer này là "đại tướng" — điều phối tất cả các quy trình khác, quyết định thứ tự thực hiện, chọn tools, và phân bổ agents.

### 7.1 Quy trình Điều phối Tổng thể (Master Orchestration)

```
User Request → Plan → Execute Steps → Verify → Report
```

**Mục đích**: Đây là vòng lặp chính — "main loop" — kết nối tất cả layers lại với nhau.

**Vòng lặp chính**:

```
┌─────────────────────────────────────────────────────┐
│  1. RECEIVE: Nhận yêu cầu từ user                    │
│  2. UNDERSTAND: Phân tích intent, đọc codebase        │
│  3. PLAN: Phân rã → Lập kế hoạch                      │
│  4. EXECUTE LOOP:                                      │
│     ├── 4a. Route step → Chọn executor                │
│     ├── 4b. Execute step → Sinh code/Thao tác         │
│     ├── 4c. Verify step → Kiểm tra kết quả            │
│     ├── 4d. If error → Error Recovery → quay 4b       │
│     └── 4e. Record result → Cập nhật progress          │
│  5. FINAL VERIFY: Kiểm tra toàn bộ hệ thống            │
│  6. REPORT: Báo cáo kết quả cho user                   │
└─────────────────────────────────────────────────────┘
```

**Decision points trong vòng lặp**:

- Sau mỗi step: Continue? Re-verify? Re-plan? Ask user?
- Sau mỗi error: Fix and continue? Re-plan? Rollback? Escalate?
- Sau final verify: All pass? Partial pass? Need more work?

**Độ khó**: ⭐⭐⭐ — Quan trọng nhất, điều phối sai = toàn bộ execution sai

---

### 7.2 Quy trình Quyết định Tool (Tool Selection)

```
Task → Available Tools → Best Tool Selection → Execution
```

**Mục đích**: Chọn đúng tool cho đúng việc. Dùng sai tool = kém hiệu quả hoặc thất bại.

**Ma trận quyết định**:

| Cần gì | Dùng tool nào | Khi nào KHÔNG dùng |
|--------|--------------|-------------------|
| Đọc 1 file cụ thể | Read | Khi chưa biết file nào → dùng Glob/Grep trước |
| Tìm file theo pattern | Glob | Khi cần tìm content → dùng Grep |
| Tìm code theo content | Grep | Khi cần tìm file → dùng Glob |
| Viết file mới | Write | Khi file đã tồn tại → dùng Edit |
| Sửa file hiện có | Edit / MultiEdit | Khi file chưa tồn tại → dùng Write |
| Chạy command | Bash | Khi có tool chuyên dụng → ưu tiên tool đó |
| Task phức tạp | Task (subagent) | Khi task đơn giản → tự làm nhanh hơn |
| Xem thư mục | LS | Khi cần đọc file → dùng Read |
| Tạo image | Image Generation | — |
| Tìm info trên web | Web Search | — |
| Kiểm tra UI | Agent Browser | — |

**Nguyên tắc**:

1. **Specific over general**: Dùng tool chuyên dụng thay vì Bash khi có thể
2. **Batch when possible**: Đọc nhiều file cùng lúc, thay vì đọc 1 file nhiều lần
3. **Cheap before expensive**: Glob/Grep (cheap) → Read (medium) → Task (expensive)

**Độ khó**: ⭐⭐ — Cần biết capabilities của mỗi tool

---

### 7.3 Quy trình Phân bổ Agent (Agent Delegation)

```
Complex Task → Decompose → Assign to Sub-agents → Collect Results → Integrate
```

**Mục đích**: Delegate task phức tạp cho sub-agents chuyên dụng, chạy song song khi có thể.

**Khi nào dùng sub-agent**:

1. Task có thể parallel (frontend + backend + database cùng lúc)
2. Task cần specialized knowledge (styling expert, DB expert)
3. Task dài, cần iterative exploration
4. Task có scope rõ ràng, input/output xác định

**Khi nào KHÔNG dùng sub-agent**:

1. Task đơn giản, tự làm nhanh hơn
2. Tasks có tight coupling — cần coordinate liên tục
3. Context quá lớn để truyền cho sub-agent
4. Result cần immediate feedback từ main agent

**Nguyên tắc**:

1. Mỗi sub-agent nhận context đầy đủ
2. Sub-agent tự chủ (autonomous) — không cần hỏi lại main agent
3. Kết quả được integrate cẩn thận
4. Main agent verify kết quả sub-agent trước khi accept

**Độ khó**: ⭐⭐⭐ — Cần biết chia task đúng, truyền context đủ, integrate kết quả chính xác

---

## Layer 8: Giao Tiếp (Communication)

Layer này quản lý giao tiếp giữa agent và user — báo cáo tiến độ, yêu cầu làm rõ, và trình bày kết quả.

### 8.1 Quy trình Báo cáo Tiến độ (Progress Reporting)

```
Step Completion → Format Report → Present to User
```

**Mục đích**: User phải biết agent đang làm gì, tiến độ thế nào, có vấn đề gì không.

**Nguyên tắc**:

 stray

1. **Transparent**: User thấy agent đang làm gì
   - Đang ở step nào
   - Step type gì
   - Expected output gì

2. **Concise**: Không spam, chỉ thông báo quan trọng
   - Không cần báo mỗi dòng code
   - Báo khi step complete, khi có error, khi cần input
   - Format consistent, dễ đọc

3. **Actionable**: Nếu có vấn đề → nói rõ cần gì
   - "Cần clarification: Bạn muốn dùng approach A hay B?"
   - "Lỗi X, tôi đang thử fix bằng cách Y"
   - "Tôi cần thêm info về Z"

**Format báo cáo**:

```
✅ Step 3/7: [frontend] Tạo PostCard component
   → Created: src/components/PostCard.tsx
   → Verified: Lint pass, Type check pass

🔄 Step 4/7: [backend] Tạo API endpoint /api/posts
   → Creating route handler...

❌ Step 5/7: [database] Apply schema migration
   → Error: Column "authorId" references non-existent model "User"
   → Fix: Adding User model to schema first
```

**Độ khó**: ⭐ — Đơn giản nhưng cần consistency

---

### 8.2 Quy trình Yêu cầu Làm rõ (Clarification Protocol)

```
Ambiguous Request → Identify Gaps → Ask User → Receive Answer → Continue
```

**Mục đích**: Khi không đủ thông tin, hỏi user thay vì guess. Guess wrong =浪费时间.

**Khi nào hỏi**:

1. User yêu cầu conflicting
   - "Dùng MySQL" nhưng stack chỉ có SQLite
   - "Tạo trang riêng" nhưng cũng muốn "tất cả trong 1 trang"

2. Thiếu thông tin quan trọng
   - "Tạo form" nhưng không nói form gì, fields gì
   - "Thêm feature" nhưng không mô tả feature

3. Có nhiều approach khác nhau
   - SSR vs CSR
   - REST vs WebSocket
   - Local state vs Global state

**Khi nào KHÔNG hỏi**:

1. Thông tin có thể infer từ context
2. Convention đã rõ ràng (follow existing pattern)
3. Decision là technical detail không ảnh hưởng user
4. Hỏi quá nhiều → user frustrated

**Format hỏi**:

```
❓ Tôi cần làm rõ:
   - Bạn muốn [option A] hay [option B]?
   - Option A: [mô tả ngắn + pro/con]
   - Option B: [mô tả ngắn + pro/con]
   - Mặc định tôi sẽ dùng [option A] nếu bạn không chỉ định.
```

**Độ khó**: ⭐⭐ — Cần cân bằng giữa hỏi đủ và không hỏi quá nhiều

---

## Layer 9: Học Tập & Thích Ứng (Learning & Adaptation)

Layer này giúp agent cải thiện theo thời gian — học từ quá khứ, thích ứng chiến lược, và không lặp lại sai lầm.

### 9.1 Quy trình Phản hồi Lịch sử (Historical Feedback)

```
Past Execution → Actual vs Expected → Adjust Future Behavior
```

**Mục đích**: Học từ quá khứ — task tương tự tốn bao nhiêu token, lỗi nào hay gặp, approach nào hiệu quả.

**Track**:

1. **Token budget vs actual usage**
   - Task type X: budget Y, actual Z → adjust future budget
   - Pattern: "Create tasks consistently use 1.5x budget"

2. **Step success rate**
   - Step type X: success rate Y%
   - Pattern: "Database steps fail 30% → need more verification"

3. **Error frequency by type**
   - Type errors: 40% of all errors
   - Runtime errors: 30%
   - Lint errors: 20%
   - Logic errors: 10%

4. **Time estimation vs actual**
   - Estimated: X minutes, Actual: Y minutes
   - Pattern: "Complex tasks consistently underestimated"

**Feedback loop**:

```
Execute → Record metrics → Analyze patterns → Adjust parameters → Re-execute
```

**Độ khó**: ⭐⭐ — Cần data accumulation và analysis logic

---

### 9.2 Quy trình Thích ứng Chiến lược (Strategy Adaptation)

```
Current Approach → Not Working → Detect Pattern → Change Strategy
```

**Mục đích**: Khi approach hiện tại không hiệu quả, tự động chuyển sang approach khác.

**Ví dụ**:

1. Lint fail 3 lần → đọc kỹ lint rules trước khi sửa tiếp
2. API error 2 lần → đọc kỹ API docs thay vì guess
3. Build fail → kiểm tra dev.log thay vì chỉ đọc error
4. Same error 2 lần → đổi fix strategy (surgical → refactoring)
5. Context too large → compress/summarize thay vì đọc thêm

**Pattern detection**:

```typescript
interface FailurePattern {
  type: 'repeated_error' | 'approach_exhausted' | 'resource_limit';
  count: number;
  lastAttempt: string;
  strategiesTried: string[];
  nextStrategy: string;
}
```

**Adaptation rules**:

- 2 fails same way → try different approach
- 3 fails same way → escalate to user
- Token budget exceeded → reduce scope or compress context
- Time budget exceeded → prioritize remaining steps

**Độ khó**: ⭐⭐⭐ — Cần self-awareness và meta-cognition

---

## Sơ Đồ Tổng Thể

```
                         ┌──────────────┐
                         │  USER REQUEST │
                         └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │  L1: INTAKE & READ    │
                    │  Intent Parse → Read  │
                    │  Codebase → Context   │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  L2: THINK & PLAN     │
                    │  Decompose → Design   │
                    │  → Budget Estimate    │
                    └───────────┬───────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │         L7: ORCHESTRATE            │
              │    ┌─────────────────────────┐     │
              │    │   EXECUTION LOOP        │     │
              │    │                         │     │
              │    │  ┌─── L3: EXECUTE ───┐  │     │
              │    │  │ Route → Generate   │  │     │
              │    │  │ → File Operations  │  │     │
              │    │  └────────┬───────────┘  │     │
              │    │           │               │     │
              │    │  ┌─── L4: VERIFY ────┐  │     │
              │    │  │ Static → Runtime   │  │     │
              │    │  │ → Visual → E2E     │  │     │
              │    │  └────────┬───────────┘  │     │
              │    │           │               │     │
              │    │     ┌─────▼─────┐        │     │
              │    │     │  Pass?    │        │     │
              │    │     └─────┬─────┘        │     │
              │    │        No │    Yes        │     │
              │    │  ┌────────▼──────┐ │     │     │
              │    │  │L5: ERROR FIX  │ │     │     │
              │    │  │Detect → RCA → │ │     │     │
              │    │  │Fix → Reverify │ │     │     │
              │    │  └────────┬──────┘ │     │     │
              │    │           │        │     │     │
              │    │           └──► loop back   │     │
              │    │                    │     │     │
              │    │  ┌─── L6: STATE ───┐│     │     │
              │    │  │ Track Progress   ││     │     │
              │    │  │ Manage Context   ││     │     │
              │    │  │ Checkpoint       ││     │     │
              │    │  └─────────────────┘│     │     │
              │    └─────────────────────────┘     │
              └─────────────────┬─────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  L8: COMMUNICATE      │
                    │  Report → Clarify     │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  L9: LEARN & ADAPT    │
                    │  Feedback → Adjust    │
                    └───────────────────────┘
```

---

## Bảng Tóm Tắt

| Layer | Quy trình | Input | Output | Mức ưu tiên | Độ khó |
|-------|-----------|-------|--------|------------|--------|
| **L1** | Intent Parsing | User message | Structured task | ⭐⭐⭐ | ⭐⭐⭐ |
| **L1** | Code Reading | Project files | Mental model | ⭐⭐⭐ | ⭐⭐ |
| **L1** | Context Assembly | Task + codebase | Relevant context | ⭐⭐⭐ | ⭐⭐⭐ |
| **L2** | Problem Decomposition | Complex task | Sub-tasks + order | ⭐⭐⭐ | ⭐⭐⭐ |
| **L2** | Solution Design | Sub-task + constraints | Implementation plan | ⭐⭐⭐ | ⭐⭐⭐ |
| **L2** | Budget Estimation | Sub-task + complexity | Token/time budget | ⭐⭐ | ⭐⭐ |
| **L3** | Step Routing | Sub-task type | Executor + context | ⭐⭐⭐ | ⭐⭐ |
| **L3** | Code Generation | Implementation plan | Code | ⭐⭐⭐ | ⭐⭐⭐ |
| **L3** | File Operations | Edit decisions | Modified files | ⭐⭐⭐ | ⭐⭐ |
| **L4** | Static Verification | Code | Lint/type pass | ⭐⭐⭐ | ⭐ |
| **L4** | Runtime Verification | Running app | API/DB pass | ⭐⭐ | ⭐⭐ |
| **L4** | Visual Verification | Browser | UI pass | ⭐⭐⭐ | ⭐⭐⭐ |
| **L4** | Integration Verification | Full stack | E2E pass | ⭐⭐ | ⭐⭐⭐ |
| **L5** | Error Detection | Execution result | Error classification | ⭐⭐⭐ | ⭐⭐ |
| **L5** | Root Cause Analysis | Error + context | Root cause | ⭐⭐⭐ | ⭐⭐⭐ |
| **L5** | Error Recovery | Root cause | Fix applied | ⭐⭐⭐ | ⭐⭐ |
| **L5** | Loop Detection | Repeated errors | Strategy change | ⭐⭐⭐ | ⭐⭐⭐ |
| **L6** | Progress Tracking | Plan + execution | Status overview | ⭐⭐ | ⭐ |
| **L6** | Context Management | Conversation | Pruned context | ⭐⭐ | ⭐⭐⭐ |
| **L6** | Checkpointing | Critical state | Saved state | ⭐ | ⭐⭐ |
| **L7** | Master Orchestration | Everything | Coordinated execution | ⭐⭐⭐ | ⭐⭐⭐ |
| **L7** | Tool Selection | Task need | Tool choice | ⭐⭐ | ⭐⭐ |
| **L7** | Agent Delegation | Complex task | Sub-agent tasks | ⭐⭐ | ⭐⭐⭐ |
| **L8** | Progress Reporting | Step results | User-visible updates | ⭐⭐ | ⭐ |
| **L8** | Clarification | Ambiguity | User answer | ⭐ | ⭐⭐ |
| **L9** | Historical Feedback | Past runs | Adjusted parameters | ⭐ | ⭐⭐ |
| **L9** | Strategy Adaptation | Failure pattern | New approach | ⭐⭐ | ⭐⭐⭐ |

---

## Điều Kiện Tối Thiểu (Minimum Viable Agent)

Nếu bạn muốn bắt đầu xây dựng, **không cần tất cả 22 quy trình ngay**. Minimum viable:

### 6 Quy Trình Bắt Buộc (Phase 1)

| # | Quy trình | Lý do bắt buộc |
|---|-----------|----------------|
| 1 | Intent Parsing (đơn giản) | Không hiểu user muốn gì thì không làm được gì |
| 2 | Problem Decomposition | Task lớn → phải chia nhỏ mới thực hiện được |
| 3 | Code Generation | Agent phải viết code được |
| 4 | Static Verification | Code sai → phải phát hiện được |
| 5 | Error Recovery (cơ bản) | Lỗi → phải sửa được |
| 6 | Master Orchestration | Vòng lặp chính kết nối mọi thứ |

### 8 Quy Trình Nên Có (Phase 2)

| # | Quy trình | Lý do nên có |
|---|-----------|-------------|
| 7 | Code Reading | Không đọc codebase → code không match project |
| 8 | Context Assembly | Tiết kiệm token, hiệu quả hơn |
| 9 | Solution Design | Tránh code sai approach |
| 10 | Step Routing | Task khác nhau cần cách thực hiện khác nhau |
| 11 | File Operations | Thao tác file an toàn |
| 12 | Runtime Verification | Static pass ≠ chạy được |
| 13 | Visual Verification | UI phải nhìn được |
| 14 | Root Cause Analysis | Sửa đúng nguyên nhân, không sửa triệu chứng |

### 8 Quy Trình Tối Ưu (Phase 3)

| # | Quy trình | Lý do tối ưu |
|---|-----------|-------------|
| 15 | Budget Estimation | Phân bổ token hiệu quả |
| 16 | Loop Detection | Tránh fix loop vô hạn |
| 17 | Progress Tracking | User thấy tiến độ |
| 18 | Context Management | Xử lý conversation dài |
| 19 | Tool Selection | Chọn đúng tool |
| 20 | Agent Delegation | Chạy song song, hiệu quả hơn |
| 21 | Historical Feedback | Học từ quá khứ |
| 22 | Strategy Adaptation | Thích ứng khi approach không work |

---

## Ghi Chú Về Nỗ Lực Xây Dựng

Mỗi quy trình trong tài liệu này đều cần **thời gian và kỳ công** để xây dựng đúng cách:

- **Phase 1 (6 quy trình)**: ~2-4 tuần cho 1 kỹ sư — đủ để agent hoạt động cơ bản
- **Phase 2 (+8 quy trình)**: ~4-8 tuần — agent đáng tin cậy hơn
- **Phase 3 (+8 quy trình)**: ~8-16 tuần — agent professional-grade

Tổng cộng: **14-28 tuần (3.5-7 tháng)** cho 1 kỹ sư xây dựng đầy đủ 22 quy trình.

Tuy nhiên, quy trình không phải "viết 1 lần là xong". Mỗi quy trình cần:

1. **Design**: Thiết kế logic, data flow, edge cases
2. **Implement**: Viết code, handle edge cases
3. **Test**: Test với nhiều scenarios
4. **Iterate**: Fix bugs, improve performance
5. **Refine**: Optimize, add features, handle more cases

Và khi stack thay đổi (Next.js update, new tools, new patterns), quy trình phải **adapt** theo.

Đó là lý do các engineering agent như Claude Code, Z.ai Code, hay Cursor cần **đội ngũ lớn** và **nhiều tháng/năm** để đạt đến chất lượng hiện tại.

---

*Tài liệu này được tạo để làm kim chỉ nam cho việc xây dựng full-stack agent. Mỗi quy trình có thể được triển khai độc lập, nhưng cần đảm bảo interface tương thích với các quy trình khác.*