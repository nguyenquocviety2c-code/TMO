/**
 * Layer 1.1: Intent Parsing
 *
 * Phân tích user message → structured task với:
 *   - Task type classification (create/modify/fix/analyze/refactor/hybrid)
 *   - Technical constraints extraction
 *   - Ambiguity detection
 *   - Implicit requirements inference
 */

import { callLLM } from '@/lib/llm'
import {
  type TaskType,
  type TechnicalConstraints,
  type IntentResult,
  type Message,
  type IntentParserOptions,
} from './types'

// ==================== CONSTANTS ====================

/** Keywords cho task type classification (fallback khi không dùng LLM) */
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  create: ['tạo', 'create', 'thêm', 'add', 'new', 'build', 'generate', 'viết', 'write'],
  modify: ['sửa', 'modify', 'update', 'change', 'đổi', 'thay', 'adjust'],
  fix: ['fix', 'lỗi', 'bug', 'crash', 'không chạy', 'broken', 'repair', 'sửa lỗi'],
  analyze: ['analyze', 'phân tích', 'review', 'giải thích', 'explain', 'đánh giá', 'assess'],
  refactor: ['refactor', 'tái cấu trúc', 'clean up', 'optimize', 'improve structure'],
  hybrid: [], // Không có keyword cụ thể, dùng khi kết hợp nhiều loại
}

/** Keywords cho technical constraints extraction */
const FRAMEWORK_KEYWORDS: Record<string, string[]> = {
  'next.js': ['next.js', 'nextjs', 'next'],
  'react': ['react', 'reactjs'],
  'vue': ['vue', 'vuejs'],
  'angular': ['angular'],
}

const STYLING_KEYWORDS: Record<string, string[]> = {
  'tailwind': ['tailwind', 'tailwindcss'],
  'shadcn/ui': ['shadcn', 'shadcn/ui'],
  'mui': ['mui', 'material-ui', 'material ui'],
  'styled-components': ['styled-components', 'styled components'],
}

const DATABASE_KEYWORDS: Record<string, string[]> = {
  'prisma': ['prisma'],
  'sqlite': ['sqlite'],
  'postgresql': ['postgres', 'postgresql'],
  'mysql': ['mysql'],
}

const API_KEYWORDS: Record<string, string[]> = {
  'rest': ['rest', 'restful'],
  'graphql': ['graphql', 'gql'],
  'websocket': ['websocket', 'ws', 'socket.io', 'socketio'],
}

// ==================== MAIN FUNCTION ====================

/**
 * Phân tích intent từ user message.
 *
 * Luồng xử lý:
 *   1. classifyTaskType()     → Phân loại task type
 *   2. extractConstraints()   → Trích xuất ràng buộc kỹ thuật
 *   3. detectAmbiguities()    → Phát hiện điểm mơ hồ
 *   4. inferImplicitReqs()    → Suy luận yêu cầu ngầm
 *
 * @param userMessage - Tin nhắn từ user
 * @param conversationHistory - Lịch sử chat (optional)
 * @param options - Cấu hình parser
 * @returns IntentResult
 */
export async function parseIntent(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>,
  options: IntentParserOptions = {},
): Promise<IntentResult> {
  const { useLLM = true } = options

  // Step 1: Phân loại task type
  const taskType = useLLM
    ? await classifyTaskTypeWithLLM(userMessage, conversationHistory)
    : classifyTaskTypeWithKeywords(userMessage)

  // Step 2: Trích xuất constraints
  const constraints = extractConstraints(userMessage)

  // Step 3: Phát hiện ambiguities
  const ambiguities = detectAmbiguities(userMessage, constraints)

  // Step 4: Suy luận implicit requirements
  const implicitRequirements = inferImplicitReqs(taskType)

  // Tính confidence
  const confidence = calculateConfidence(taskType, ambiguities)

  return {
    taskType,
    summary: generateSummary(userMessage, taskType),
    constraints,
    ambiguities,
    implicitRequirements,
    confidence,
  }
}

// ==================== STEP 1: TASK TYPE CLASSIFICATION ====================

/**
 * Phân loại task type dùng LLM (chính xác hơn).
 */
async function classifyTaskTypeWithLLM(
  userMessage: string,
  _conversationHistory?: Array<{ role: string; content: string }>,
): Promise<TaskType> {
  const prompt = `
Bạn là một intent classifier. Phân loại câu sau thành 1 trong 6 loại:
- create: Tạo mới (component, page, API, schema...)
- modify: Sửa đổi code hiện có
- fix: Sửa lỗi (bug fix)
- analyze: Phân tích code, giải thích, review
- refactor: Tái cấu trúc code
- hybrid: Kết hợp nhiều loại trên

Chỉ trả về 1 từ: create | modify | fix | analyze | refactor | hybrid

User: "${userMessage}"
Type:`.trim()

  try {
    const result = await callLLM(prompt, undefined, 'intent-classification', {
      temperature: 0.1,
      maxTokens: 10,
    })

    const type = result.content?.trim().toLowerCase() as TaskType
    if (['create', 'modify', 'fix', 'analyze', 'refactor', 'hybrid'].includes(type)) {
      return type
    }
  } catch {
    // Fallback to keyword matching
  }

  return classifyTaskTypeWithKeywords(userMessage)
}

/**
 * Phân loại task type dùng keyword matching (fallback).
 */
function classifyTaskTypeWithKeywords(userMessage: string): TaskType {
  const lower = userMessage.toLowerCase()

  // Đếm số keyword match cho mỗi type
  const scores: Record<string, number> = {}
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    scores[type] = keywords.filter(k => lower.includes(k.toLowerCase())).length
  }

  // Chọn type có điểm cao nhất
  const entries = Object.entries(scores)
  const maxScore = Math.max(...entries.map(([, s]) => s))
  if (maxScore === 0) return 'hybrid'

  const bestType = entries.find(([, s]) => s === maxScore)?.[0] as TaskType
  return bestType || 'hybrid'
}

// ==================== STEP 2: CONSTRAINTS EXTRACTION ====================

/**
 * Trích xuất technical constraints từ user message.
 */
function extractConstraints(message: string): TechnicalConstraints {
  const lower = message.toLowerCase()
  const constraints: TechnicalConstraints = {}

  // Framework
  for (const [fw, keywords] of Object.entries(FRAMEWORK_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      constraints.framework = fw
      break
    }
  }

  // Styling
  for (const [style, keywords] of Object.entries(STYLING_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      constraints.styling = style
      break
    }
  }

  // Database
  for (const [db, keywords] of Object.entries(DATABASE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      constraints.database = db
      break
    }
  }

  // API
  for (const [api, keywords] of Object.entries(API_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      constraints.api = api
      break
    }
  }

  // Performance
  const perfKeywords = ['fast', 'quick', 'performance', 'responsive', 'optimized', 'hiệu năng', 'nhanh']
  constraints.performance = perfKeywords.filter(k => lower.includes(k.toLowerCase()))

  return constraints
}

// ==================== STEP 3: AMBIGUITY DETECTION ====================

/**
 * Phát hiện các điểm mơ hồ trong yêu cầu.
 */
function detectAmbiguities(message: string, constraints: TechnicalConstraints): string[] {
  const ambiguities: string[] = []
  const lower = message.toLowerCase()

  // Check 1: Conflicting requirements
  if (lower.includes('mysql') && lower.includes('sqlite')) {
    ambiguities.push('Yêu cầu conflicting: MySQL vs SQLite')
  }

  // Check 2: Missing critical info
  if (!constraints.framework && !lower.includes('page') && !lower.includes('component')) {
    ambiguities.push('Chưa rõ framework/target')
  }

  // Check 3: Vague UI description
  if (lower.includes('đẹp') || lower.includes('nice') || lower.includes('good')) {
    ambiguities.push('Mô tả UI quá mơ hồ (đẹp, nice, good)')
  }

  // Check 4: Missing fields for forms
  if (lower.includes('form') && !lower.includes('field')) {
    ambiguities.push('Form chưa có danh sách fields')
  }

  return ambiguities
}

// ==================== STEP 4: IMPLICIT REQUIREMENTS ====================

/**
 * Suy luận yêu cầu ngầm dựa trên task type.
 */
function inferImplicitReqs(taskType: TaskType): string[] {
  const baseReqs = ['error-handling', 'type-safety']

  switch (taskType) {
    case 'create':
      return [...baseReqs, 'responsive-design', 'loading-states', '4xx/5xx-error-boundaries']
    case 'modify':
      return [...baseReqs, 'backward-compatibility', 'regression-testing']
    case 'fix':
      return [...baseReqs, 'root-cause-analysis', 'test-case-for-bug']
    case 'analyze':
      return ['clear-explanation', 'actionable-recommendations']
    case 'refactor':
      return [...baseReqs, 'maintainability', 'performance-optimization']
    case 'hybrid':
      return [...baseReqs, 'responsive-design', 'loading-states']
    default:
      return baseReqs
  }
}

// ==================== HELPERS ====================

/**
 * Tạo summary 1 câu từ user message.
 */
function generateSummary(message: string, taskType: TaskType): string {
  // Đơn giản: trả về message gốc với prefix task type
  return `[${taskType.toUpperCase()}] ${message.slice(0, 200)}`
}

/**
 * Tính confidence score (0-1).
 */
function calculateConfidence(taskType: TaskType, ambiguities: string[]): number {
  let confidence = 0.8 // Base

  // Giảm nếu là hybrid (khó phân loại)
  if (taskType === 'hybrid') confidence -= 0.2

  // Giảm nếu có nhiều ambiguities
  confidence -= ambiguities.length * 0.1

  return Math.max(0, Math.min(1, confidence))
}