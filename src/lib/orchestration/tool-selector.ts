/**
 * Layer 7.2: Tool Selection — Decision Matrix
 *
 * Chọn đúng tool cho đúng việc. Dùng sai tool = kém hiệu quả hoặc thất bại.
 *
 * Nguyên tắc:
 *   1. Specific over general: Dùng tool chuyên dụng thay vì Bash khi có thể
 *   2. Batch when possible: Đọc nhiều file cùng lúc
 *   3. Cheap before expensive: Glob/Grep (cheap) → Read (medium) → Task (expensive)
 */

import type {
  ToolSelector,
  ToolSelectionRequest,
  ToolSelectionResult,
  ToolCapability,
  ToolCategory,
} from './types'

// ==================== TOOL CAPABILITIES DATABASE ====================

const TOOL_CAPABILITIES: ToolCapability[] = [
  {
    name: 'read',
    category: 'read',
    description: 'Đọc nội dung của một file cụ thể',
    bestFor: ['Đọc file đã biết đường dẫn', 'Kiểm tra nội dung file', 'Đọc code để hiểu logic'],
    notFor: ['Tìm file chưa biết', 'Tìm code theo pattern', 'Viết file mới'],
    cost: 'cheap',
  },
  {
    name: 'write',
    category: 'write',
    description: 'Viết file mới hoặc ghi đè file cũ',
    bestFor: ['Tạo file mới', 'Viết code từ đầu', 'Ghi đè toàn bộ file'],
    notFor: ['Sửa file hiện có', 'Chỉ sửa 1 phần nhỏ'],
    cost: 'medium',
  },
  {
    name: 'edit',
    category: 'write',
    description: 'Sửa một phần nhỏ trong file hiện có',
    bestFor: ['Sửa 1 dòng/lệnh', 'Thêm import', 'Sửa typo'],
    notFor: ['Viết file mới', 'Sửa nhiều chỗ cùng lúc'],
    cost: 'cheap',
  },
  {
    name: 'multi_edit',
    category: 'write',
    description: 'Sửa nhiều chỗ trong cùng một file',
    bestFor: ['Sửa nhiều chỗ cùng file', 'Refactor nhỏ', 'Thêm nhiều field'],
    notFor: ['Viết file mới', 'Sửa 1 chỗ đơn giản'],
    cost: 'medium',
  },
  {
    name: 'glob',
    category: 'search',
    description: 'Tìm file theo pattern (wildcard)',
    bestFor: ['Tìm file theo tên', 'Liệt kê files trong thư mục', 'Tìm file chưa biết'],
    notFor: ['Tìm content trong file', 'Đọc nội dung file'],
    cost: 'cheap',
  },
  {
    name: 'grep',
    category: 'search',
    description: 'Tìm code/text theo pattern trong nhiều file',
    bestFor: ['Tìm function/class', 'Tìm import', 'Tìm usage của variable'],
    notFor: ['Tìm file theo tên', 'Đọc nội dung file'],
    cost: 'cheap',
  },
  {
    name: 'bash',
    category: 'execute',
    description: 'Chạy command shell',
    bestFor: ['Chạy script', 'Build/test', 'Git operations', 'Install packages'],
    notFor: ['Thao tác file đơn giản', 'Task có tool chuyên dụng'],
    cost: 'medium',
  },
  {
    name: 'ls',
    category: 'read',
    description: 'Liệt kê thư mục',
    bestFor: ['Xem cấu trúc thư mục', 'Kiểm tra file tồn tại'],
    notFor: ['Đọc nội dung file', 'Tìm file theo pattern'],
    cost: 'cheap',
  },
  {
    name: 'agent_browser',
    category: 'browser',
    description: 'Kiểm tra UI bằng headless browser',
    bestFor: ['Kiểm tra render', 'Test interaction', 'Screenshot'],
    notFor: ['Thao tác file', 'Chạy command'],
    cost: 'expensive',
  },
  {
    name: 'image_generation',
    category: 'image',
    description: 'Tạo ảnh từ prompt',
    bestFor: ['Tạo ảnh mới', 'Generate assets'],
    notFor: ['Thao tác file', 'Chạy command'],
    cost: 'expensive',
  },
  {
    name: 'knowledge_search',
    category: 'knowledge',
    description: 'Tìm kiếm trong knowledge base',
    bestFor: ['Tìm thông tin domain-specific', 'Tra cứu docs'],
    notFor: ['Thao tác file', 'Chạy command'],
    cost: 'medium',
  },
  {
    name: 'skill',
    category: 'skill',
    description: 'Sử dụng skill từ skill registry',
    bestFor: ['Task phức tạp, cần nhiều bước', 'Task có pattern lặp lại'],
    notFor: ['Task đơn giản', 'Task 1 bước'],
    cost: 'expensive',
  },
]

// ==================== TOOL SELECTOR IMPLEMENTATION ====================

/**
 * Create a new Tool Selector with the full decision matrix.
 */
export function createToolSelector(): ToolSelector {
  const toolMatrix = buildToolMatrix()

  return {
    selectTool(request: ToolSelectionRequest): ToolSelectionResult {
      return selectToolInternal(request, toolMatrix)
    },

    getToolCapabilities(): ToolCapability[] {
      return [...TOOL_CAPABILITIES]
    },

    getToolMatrix(): Map<string, ToolCapability> {
      return new Map(toolMatrix)
    },

    validateToolChoice(tool: string, task: string): boolean {
      const capability = toolMatrix.get(tool)
      if (!capability) return false

      // Check if tool is suitable for this task
      const taskLower = task.toLowerCase()
      const isInBestFor = capability.bestFor.some((bf) =>
        taskLower.includes(bf.toLowerCase())
      )
      const isInNotFor = capability.notFor.some((nf) =>
        taskLower.includes(nf.toLowerCase())
      )

      return isInBestFor && !isInNotFor
    },
  }
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Build the tool capability matrix as a Map for fast lookup.
 */
function buildToolMatrix(): Map<string, ToolCapability> {
  const matrix = new Map<string, ToolCapability>()
  for (const tool of TOOL_CAPABILITIES) {
    matrix.set(tool.name, tool)
  }
  return matrix
}

/**
 * Core tool selection logic.
 *
 * Applies 3 rules:
 *   1. Specific over general
 *   2. Batch when possible
 *   3. Cheap before expensive
 */
function selectToolInternal(
  request: ToolSelectionRequest,
  toolMatrix: Map<string, ToolCapability>
): ToolSelectionResult {
  const { taskType, need, availableTools, context } = request

  // Filter to only available tools
  const candidates = availableTools
    .map((name) => toolMatrix.get(name))
    .filter((t): t is ToolCapability => t !== undefined)

  if (candidates.length === 0) {
    return {
      selectedTool: 'bash',
      confidence: 0.3,
      reasoning: 'No matching tool found, fallback to bash',
      alternatives: [],
      warnings: ['No tools matched the request'],
    }
  }

  // Score each candidate
  const scored = candidates.map((tool) => ({
    tool,
    score: scoreTool(tool, request),
  }))

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const alternatives = scored.slice(1, 4).map((s) => s.tool.name)

  // Build warnings
  const warnings: string[] = []
  if (best.score < 0.5) {
    warnings.push('Low confidence match — consider using a different tool')
  }
  if (context.isComplex && best.tool.cost === 'expensive') {
    warnings.push('Task is complex and selected tool is expensive — consider breaking into smaller steps')
  }

  return {
    selectedTool: best.tool.name,
    confidence: Math.min(best.score, 1.0),
    reasoning: buildReasoning(best.tool, request),
    alternatives,
    warnings,
  }
}

/**
 * Score a tool's suitability for the given request.
 * Returns a value between 0 and 1.
 */
function scoreTool(tool: ToolCapability, request: ToolSelectionRequest): number {
  let score = 0

  // 1. Category match
  if (matchesCategory(tool, request)) {
    score += 0.4
  }

  // 2. Context match
  if (matchesContext(tool, request)) {
    score += 0.3
  }

  // 3. Cost preference (cheaper is better)
  score += costScore(tool.cost)

  // 4. Specificity bonus
  score += specificityScore(tool, request)

  return Math.min(score, 1.0)
}

/**
 * Check if tool category matches the task need.
 */
function matchesCategory(tool: ToolCapability, request: ToolSelectionRequest): boolean {
  const needLower = request.need.toLowerCase()

  // Direct category mapping
  const categoryMap: Record<string, string[]> = {
    read: ['đọc', 'read', 'xem', 'view', 'kiểm tra'],
    write: ['viết', 'write', 'tạo', 'create', 'new file'],
    search: ['tìm', 'search', 'grep', 'glob', 'locate'],
    execute: ['chạy', 'run', 'execute', 'bash', 'command', 'build', 'test'],
    browser: ['browser', 'ui', 'render', 'screenshot', 'visual'],
    image: ['ảnh', 'image', 'picture', 'generate image'],
    knowledge: ['knowledge', 'kb', 'docs', 'search docs'],
    skill: ['skill', 'complex task', 'multi-step'],
  }

  const keywords = categoryMap[tool.category] || []
  return keywords.some((kw) => needLower.includes(kw))
}

/**
 * Check if tool matches the context constraints.
 */
function matchesContext(tool: ToolCapability, request: ToolSelectionRequest): boolean {
  const { context } = request

  // File exists → prefer edit over write
  if (context.fileExists && tool.name === 'edit') return true
  if (context.fileExists && tool.name === 'write') return false

  // New file → prefer write over edit
  if (context.isNewFile && tool.name === 'write') return true
  if (context.isNewFile && tool.name === 'edit') return false

  // Needs browser → agent_browser
  if (context.needsBrowser && tool.category === 'browser') return true

  // Needs search → glob/grep
  if (context.needsSearch && tool.category === 'search') return true

  // Default: context không rõ ràng → không cho phép (fail-safe)
  return false
}

/**
 * Score based on tool cost (cheaper is better).
 */
function costScore(cost: 'cheap' | 'medium' | 'expensive'): number {
  switch (cost) {
    case 'cheap': return 0.2
    case 'medium': return 0.1
    case 'expensive': return 0.0
  }
}

/**
 * Bonus for tools that are specifically designed for this task.
 */
function specificityScore(tool: ToolCapability, request: ToolSelectionRequest): number {
  const needLower = request.need.toLowerCase()

  // Check if any of tool.bestFor matches the need
  for (const best of tool.bestFor) {
    if (needLower.includes(best.toLowerCase())) {
      return 0.1
    }
  }

  return 0
}

/**
 * Build human-readable reasoning for the selection.
 */
function buildReasoning(tool: ToolCapability, request: ToolSelectionRequest): string {
  const parts: string[] = [
    `Selected "${tool.name}" because:`,
    `- Category "${tool.category}" matches task "${request.taskType}"`,
    `- Best for: ${tool.bestFor.slice(0, 2).join(', ')}`,
    `- Cost: ${tool.cost}`,
  ]

  if (request.context.fileExists) {
    parts.push('- File exists → prefer edit over write')
  }
  if (request.context.isNewFile) {
    parts.push('- New file → prefer write over edit')
  }

  return parts.join('\n')
}