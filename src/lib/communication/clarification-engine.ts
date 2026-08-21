/**
 * Layer 8.2: Clarification Engine
 *
 * Phát hiện ambiguity, định dạng câu hỏi, và quản lý vòng đời ask-answer.
 * Nguyên tắc: Hỏi khi cần, không hỏi quá nhiều, luôn có default option.
 */

import type {
  ClarificationEngine as IClarificationEngine,
  CommunicationConfig,
  ClarificationContext,
  ClarificationDecision,
  ClarificationGap,
  clarificationGapType,
  ClarificationRequest,
  ClarificationResponse,
  CommunicationState,
} from './types'

// ==================== CONSTANTS ====================

/** Số câu hỏi tối đa mặc định */
const DEFAULT_MAX_QUESTIONS = 3

/** Template câu hỏi theo ngôn ngữ */
const QUESTION_TEMPLATES: Record<string, Record<clarificationGapType, string>> = {
  vi: {
    conflicting: 'Phát hiện yêu cầu mâu thuẫn: {description}\nBạn muốn: {options}\nMặc định tôi sẽ dùng: {default}',
    missing_info: 'Tôi cần thêm thông tin về: {description}\nVui lòng mô tả:',
    multiple_approaches: 'Có nhiều cách tiếp cận cho: {description}\n{options}\nMặc định tôi sẽ dùng: {default}',
    ambiguous: 'Yêu cầu của bạn có thể hiểu theo nhiều cách: {description}\nBạn muốn: {options}\nMặc định: {default}',
  },
  en: {
    conflicting: 'Conflicting requirements detected: {description}\nWhich would you prefer: {options}\nDefault: {default}',
    missing_info: 'I need more information about: {description}\nPlease describe:',
    multiple_approaches: 'Multiple approaches available for: {description}\n{options}\nDefault: {default}',
    ambiguous: 'Your request could be interpreted in multiple ways: {description}\nWhich do you prefer: {options}\nDefault: {default}',
  },
}

// ==================== FACTORY ====================

/**
 * Tạo ClarificationEngine instance.
 * @param config - Cấu hình communication
 */
export function createClarificationEngine(config?: Partial<CommunicationConfig>): IClarificationEngine {
  const cfg: CommunicationConfig = {
    language: config?.language ?? 'vi',
    verbosity: config?.verbosity ?? 'normal',
    emoji: config?.emoji ?? true,
    maxQuestionsPerSession: config?.maxQuestionsPerSession ?? DEFAULT_MAX_QUESTIONS,
  }

  const state: CommunicationState = {
    pendingClarifications: [],
    reportHistory: [],
    questionCount: 0,
    lastReportTimestamp: {},
  }

  // ==================== INTERNAL HELPERS ====================

  /** Lấy template theo ngôn ngữ */
  function getTemplate(type: clarificationGapType): string {
    return QUESTION_TEMPLATES[cfg.language]?.[type] ?? QUESTION_TEMPLATES.en[type]
  }

  /** Tạo ID duy nhất cho request */
  function generateId(): string {
    return `clar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** Format options thành string */
  function formatOptions(options: string[]): string {
    return options.map((opt, i) => `  ${i + 1}. ${opt}`).join('\n')
  }

  /** Fuzzy match câu trả lời với options */
  function matchAnswer(answer: string, options: string[], defaultOption: string): string {
    const normalized = answer.trim().toLowerCase()

    // Exact match với option text
    for (const opt of options) {
      if (normalized === opt.toLowerCase()) return opt
    }

    // Match theo số thứ tự (1, 2, 3...)
    const numMatch = normalized.match(/^(\d+)$/)
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1
      if (idx >= 0 && idx < options.length) {
        return options[idx]
      }
    }

    // Match partial (answer chứa option text)
    for (const opt of options) {
      if (normalized.includes(opt.toLowerCase())) return opt
    }

    // Default nếu không match
    return defaultOption
  }

  // ==================== DETECTION HELPERS ====================

  /** Phát hiện conflicting requirements */
  function detectConflictingRequirements(context: ClarificationContext): ClarificationGap | null {
    const { intentResult } = context
    const constraints = intentResult.constraints

    // Kiểm tra database conflict
    if (constraints.database) {
      const db = constraints.database.toLowerCase()
      if (db.includes('mysql') && db.includes('sqlite')) {
        return {
          type: 'conflicting',
          description: 'Database requirement conflict',
          options: ['MySQL', 'SQLite'],
          defaultOption: 'SQLite',
        }
      }
    }

    // Kiểm tra framework conflict
    if (constraints.framework) {
      const fw = constraints.framework.toLowerCase()
      if (fw.includes('next') && fw.includes('vue')) {
        return {
          type: 'conflicting',
          description: 'Framework requirement conflict',
          options: ['Next.js', 'Vue.js'],
          defaultOption: 'Next.js',
        }
      }
    }

    return null
  }

  /** Phát hiện missing critical info */
  function detectMissingInfo(context: ClarificationContext): ClarificationGap | null {
    const { intentResult } = context
    const taskType = intentResult.taskType

    // Task "create form" nhưng không có fields
    if (taskType === 'create' && intentResult.summary) {
      const desc = intentResult.summary.toLowerCase()
      if (desc.includes('form') && !desc.includes('field')) {
        return {
          type: 'missing_info',
          description: 'Form fields not specified',
          field: 'fields',
        }
      }
    }

    // Task "add feature" nhưng không mô tả feature
    if (taskType === 'create' && (!intentResult.summary || intentResult.summary.length < 20)) {
      return {
        type: 'missing_info',
        description: 'Feature description is too vague',
        field: 'description',
      }
    }

    return null
  }

  /** Phát hiện multiple approaches */
  function detectMultipleApproaches(context: ClarificationContext): ClarificationGap | null {
    const { solutionDesign } = context

    if (!solutionDesign) return null

    // Kiểm tra architecture decisions
    const decisions = solutionDesign.architectureDecisions || []
    if (decisions.length >= 2) {
      return {
        type: 'multiple_approaches',
        description: 'Multiple architecture approaches available',
        options: decisions.slice(0, 3).map((d) => d.chosen),
        defaultOption: decisions[0]?.chosen || 'Default approach',
      }
    }

    return null
  }

  /** Phát hiện ambiguous scope */
  function detectAmbiguousScope(context: ClarificationContext): ClarificationGap | null {
    const { intentResult } = context

    // Kiểm tra từ khóa ambiguous
    const ambiguousTerms = ['search', 'filter', 'sort', 'update', 'improve']
    const summary = intentResult.summary?.toLowerCase() || ''

    for (const term of ambiguousTerms) {
      if (summary.includes(term)) {
        // Kiểm tra xem có đủ context không
        const hasContext = intentResult.constraints && (
          intentResult.constraints.framework ||
          intentResult.constraints.styling ||
          intentResult.constraints.database
        )
        if (!hasContext) {
          return {
            type: 'ambiguous',
            description: `The term "${term}" is ambiguous without more context`,
            options: [
              `${term} (UI only)`,
              `${term} (full implementation with backend)`,
            ],
            defaultOption: `${term} (UI only)`,
          }
        }
      }
    }

    return null
  }

  // ==================== PUBLIC METHODS ====================

  const engine: IClarificationEngine = {
    needsClarification(context: ClarificationContext): ClarificationDecision {
      const gaps: ClarificationGap[] = []

      // Guard 0: hết budget câu hỏi cho session này → không hỏi thêm
      if ((context.questionCount ?? 0) >= cfg.maxQuestionsPerSession) {
        return { needsClarification: false, gaps: [], confidence: 1.0 }
      }

      // Guard 1: không parse được intent → thiếu thông tin nghiêm trọng
      // (đồng thời tránh crash trong các detector bên dưới)
      if (!context.intentResult) {
        return {
          needsClarification: true,
          gaps: [{
            type: 'missing_info',
            description: 'Không xác định được intent từ yêu cầu — cần thêm thông tin',
            field: 'intent',
          }],
          confidence: 0,
        }
      }

      // Detector 0: intent confidence thấp hoặc có ambiguities tường minh
      const intentConfidence = context.intentResult.confidence ?? 1
      const ambiguities = context.intentResult.ambiguities || []
      if (intentConfidence < 0.5 || ambiguities.length > 0) {
        gaps.push({
          type: 'ambiguous',
          description: ambiguities.length > 0
            ? `Yêu cầu chưa rõ ràng: ${ambiguities.join('; ')}`
            : `Độ tin cậy phân tích intent thấp (${intentConfidence})`,
          options: ambiguities.length > 0
            ? ambiguities.slice(0, 3).map((a) => `Làm rõ: ${a}`)
            : ['Giữ nguyên hiểu hiện tại', 'Mô tả lại yêu cầu'],
        })
      }

      // Chạy tất cả detectors
      const conflicting = detectConflictingRequirements(context)
      if (conflicting) gaps.push(conflicting)

      const missing = detectMissingInfo(context)
      if (missing) gaps.push(missing)

      const approaches = detectMultipleApproaches(context)
      if (approaches) gaps.push(approaches)

      const ambiguous = detectAmbiguousScope(context)
      if (ambiguous) gaps.push(ambiguous)

      // Tính confidence
      const totalChecks = 4
      const suppressedGaps = totalChecks - gaps.length
      const confidence = 1.0 - (suppressedGaps / totalChecks)

      return {
        needsClarification: gaps.length > 0,
        gaps,
        confidence,
      }
    },

    formatQuestion(gap: ClarificationGap): ClarificationRequest {
      const template = getTemplate(gap.type)
      const options = gap.options || []
      const defaultOption = gap.defaultOption || options[0] || 'Default'

      // Format question từ template
      let formattedQuestion = template
        .replace('{description}', gap.description)
        .replace('{default}', defaultOption)

      if (options.length > 0) {
        formattedQuestion = formattedQuestion.replace('{options}', formatOptions(options))
      } else {
        formattedQuestion = formattedQuestion.replace('{options}', '')
      }

      // Emoji prefix để user nhận diện đây là câu hỏi cần trả lời
      if (cfg.emoji) {
        formattedQuestion = `❓ ${formattedQuestion}`
      }

      const request: ClarificationRequest = {
        id: generateId(),
        gap,
        formattedQuestion,
        options,
        defaultOption,
        timestamp: new Date().toISOString(),
      }

      // Update state
      state.pendingClarifications.push(request)
      state.questionCount++

      return request
    },

    validateAnswer(request: ClarificationRequest, answer: string): ClarificationResponse {
      const selectedOption = matchAnswer(answer, request.options, request.defaultOption)

      // Check if this is a follow-up (answer doesn't match any option well)
      const isFollowUp = selectedOption === request.defaultOption && answer.trim() !== request.defaultOption

      return {
        requestId: request.id,
        selectedOption,
        updatedContext: `Selected: ${selectedOption}`,
        isFollowUp,
      }
    },

    shouldSuppressQuestion(gap: ClarificationGap, context: ClarificationContext): boolean {
      // Rule 1: Đã hỏi quá nhiều trong session này
      if (state.questionCount >= cfg.maxQuestionsPerSession) {
        return true
      }

      // Rule 2: Câu hỏi trùng lặp (đã hỏi cùng gap type cho cùng field)
      const isDuplicate = state.pendingClarifications.some(
        (req) => req.gap.type === gap.type && req.gap.field === gap.field
      )
      if (isDuplicate) {
        return true
      }

      // Rule 2b: Câu hỏi có nội dung trùng với câu đã hỏi trước đó trong context
      const normalizedDesc = gap.description.trim().toLowerCase()
      if (context.askedQuestions?.some((q) => q.trim().toLowerCase() === normalizedDesc)) {
        return true
      }

      // Rule 3: Info có thể infer từ codebase conventions
      if (context.codebaseConventions.length > 0) {
        // Nếu gap là missing_info và field đã có trong conventions
        if (gap.type === 'missing_info' && gap.field) {
          const hasConvention = context.codebaseConventions.some((c) =>
            c.toLowerCase().includes(gap.field!.toLowerCase())
          )
          if (hasConvention) {
            return true
          }
        }
      }

      // Rule 4: Decision là technical detail không ảnh hưởng user
      if (gap.type === 'multiple_approaches') {
        // Nếu chỉ có 1 approach hoặc approaches không ảnh hưởng UX
        const technicalOnly = gap.options?.every((opt) =>
          opt.toLowerCase().includes('ssr') ||
          opt.toLowerCase().includes('csr') ||
          opt.toLowerCase().includes('server') ||
          opt.toLowerCase().includes('client')
        )
        if (technicalOnly) {
          return true
        }
      }

      return false
    },

    getState(): CommunicationState {
      return { ...state }
    },

    resolveClarification(request: ClarificationRequest, response: ClarificationResponse): {
      resolved: boolean
      followUpNeeded: boolean
      followUpQuestion?: ClarificationRequest
      updatedContext: string
    } {
      // Remove from pending
      const idx = state.pendingClarifications.findIndex((r) => r.id === request.id)
      if (idx >= 0) {
        state.pendingClarifications.splice(idx, 1)
      }

      // Check if follow-up is needed
      if (response.isFollowUp) {
        // Create a follow-up question based on the00 answer
        const followUpGap: ClarificationGap = {
          type: 'missing_info',
          description: `Could you clarify your answer? You selected "${response.selectedOption}" but I need more details.`,
          options: ['Provide more details', 'Use default', 'Cancel'],
          defaultOption: 'Use default',
        }

        const followUpQuestion = this.formatQuestion(followUpGap)

        return {
          resolved: false,
          followUpNeeded: true,
          followUpQuestion,
          updatedContext: `Follow-up needed for: ${request.gap.description}`,
        }
      }

      // Fully resolved
      return {
        resolved: true,
        followUpNeeded: false,
        updatedContext: response.updatedContext,
      }
    },
  }

  return engine
}