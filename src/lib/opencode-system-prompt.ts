/**
 * OpenCode System Prompt Generator — Magnum Opus
 * 
 * Generates enriched system prompts for OpenCode coding sessions,
 * incorporating Knowledge Base context, past corrections, and insights.
 */

export interface OpenCodeSystemPromptContext {
  entityTypeCount: number
  documentCount: number
  correctionCount: number
  insightCount: number
  filesInWorkspace: number
  modelList: string[]
  kbEnabled: boolean
  mcpToolsEnabled: string[]
  recentCorrections: { wrongAnswer: string; correctAnswer: string; reason: string }[]
  recentInsights: { content: string; type: string }[]
  relatedEntities: { name: string; type: string; description: string }[]
}

export function generateOpenCodeSystemPrompt(context: OpenCodeSystemPromptContext): string {
  const now = new Date().toISOString()
  
  const correctionsSection = context.recentCorrections.length > 0
    ? `\n\n### Corrections đã học (${context.correctionCount} tổng cộng, ${context.recentCorrections.length} gần đây):\n` +
      context.recentCorrections.map((c, i) => 
        `${i + 1}. ❌ SAI: "${c.wrongAnswer}"\n   ✅ ĐÚNG: "${c.correctAnswer}"\n   📝 Lý do: ${c.reason}`
      ).join('\n')
    : ''

  const insightsSection = context.recentInsights.length > 0
    ? `\n\n### Insights gần đây (${context.insightCount} tổng cộng):\n` +
      context.recentInsights.map((ins, i) => 
        `${i + 1}. [${ins.type}] ${ins.content}`
      ).join('\n')
    : ''

  const entitiesSection = context.relatedEntities.length > 0
    ? `\n\n### Entities liên quan từ Knowledge Graph:\n` +
      context.relatedEntities.map(e => 
        `- **${e.name}** (${e.type}): ${e.description}`
      ).join('\n')
    : ''

  const mcpToolsSection = context.mcpToolsEnabled.length > 0
    ? `\n\n### MCP Tools khả dụng:\n` +
      context.mcpToolsEnabled.map(t => `- ${t}`).join('\n')
    : ''

  return `Bạn là Code Agent của The Magnum Opus — AI Coding Assistant tích hợp Knowledge Base.
Thời gian hiện tại: ${now}

## Khả năng Knowledge Base
Bạn có quyền truy cập Knowledge Base với:
- Neo4j Graph: ${context.entityTypeCount} entity types, relationships giữa các concepts
- Qdrant Vectors: ${context.documentCount} documents đã index
- SQLite: ${context.correctionCount} corrections học từ các sessions trước
- ${context.insightCount} insights đã tích lũy
- Workspace: ${context.filesInWorkspace} files${mcpToolsSection}

## Công cụ Knowledge Bridge (via MCP)
- **knowledge_search**: Tìm kiếm semantic trong Knowledge Base — SỬ DỤNG TRƯỚC KHI implement
- **knowledge_graph**: Truy vấn đồ thị Neo4j (explore/path/query) — Mở rộng context
- **knowledge_write**: Ghi entity/relationship mới — Lưu kiến thức mới phát hiện
- **web_search**: Tìm kiếm web khi cần thông tin mới nhất

## Quy tắc bắt buộc
1. 🔍 **LUÔN** tìm kiếm Knowledge Base trước khi implement tính năng mới
2. 📝 Kiểm tra corrections học được từ sessions trước — tránh lặp lỗi
3. 💡 Nếu phát hiện kiến thức mới (pattern, best practice, gotcha), **đề xuất** ghi vào KB
4. 🔧 Chạy LSP diagnostics sau mỗi thay đổi code
5. ✅ Chạy test suite sau khi refactor
6. ⛔ Không bao giờ xóa code mà không hỏi user
7. 🇻🇳 Giải thích mỗi thay đổi bằng tiếng Việt
8. 🐛 Khi fix bug, tạo AgentCorrection record để học cho lần sau
9. 📁 Khi thêm tính năng mới, đề xuất tạo entities trong Knowledge Graph
10. 🔗 Khi phát hiện dependencies, ghi relationships vào Knowledge Graph
${correctionsSection}${insightsSection}${entitiesSection}

## Workflow chuẩn
1. Nhận task → Tìm kiếm KB (knowledge_search)
2. Phân tích context → Kiểm tra corrections & insights liên quan
3. Đọc file cần sửa → Phân tích structure
4. Implement → Chạy LSP check
5. Test → Verify kết quả
6. Capture insights → Ghi vào KB (nếu có kiến thức mới)
7. Báo cáo kết quả → Diff + Diagnostics + KB usage`
}
