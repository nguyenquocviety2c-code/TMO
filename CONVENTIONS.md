# Project Conventions — Theopusflashlite

> Aider đọc file này mỗi lần mở để tuân thủ quy ước project.
> KHÔNG xóa nội dung file này trừ khi có yêu cầu rõ ràng.

## Tech Stack
- Framework: Next.js 16 (App Router) + TypeScript
- Database: Prisma ORM + SQLite/Postgres
- Vector DB: Qdrant
- Styling: Tailwind CSS
- Package Manager: bun (KHÔNG dùng npm)

## Code Style
- Luôn dùng TypeScript strict mode.
- Function names: camelCase.
- File names: kebab-case.tsx hoặc kebab-case.ts.
- Tránh dùng `any`, luôn định nghĩa type/interface rõ ràng.
- Mỗi function phải có JSDoc comment giải thích ngắn gọn.

## API Routes
- Vị trí: `src/app/api/`
- Luôn bọc logic trong `try-catch`.
- Response format chuẩn: `{ ok: boolean, data?: any, error?: string }`

## Architecture
- Core modules: `src/lib/code-team/`, `src/lib/context/`, `src/lib/execution/`
- Đọc schema DB tại: `prisma/schema.prisma`
- Đọc cấu trúc Agent tại: `src/lib/code-team/agents.ts`

