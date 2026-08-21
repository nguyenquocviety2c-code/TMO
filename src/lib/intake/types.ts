/**
 * Layer 1: Intake & Comprehension — Shared Types
 *
 * Định nghĩa tất cả types/interfaces cho 3 quy trình:
 *   1.1 Intent Parsing
 *   1.2 Code Reading
 *   1.3 Context Assembly
 */

// ==================== 1.1 INTENT PARSING ====================

/** Loại tác vụ user yêu cầu */
export type TaskType = 'create' | 'modify' | 'fix' | 'analyze' | 'refactor' | 'hybrid'

/** Ràng buộc kỹ thuật trích xuất từ yêu cầu */
export interface TechnicalConstraints {
  framework?: string          // e.g. 'next.js', 'react'
  styling?: string             // e.g. 'tailwind', 'shadcn/ui'
  database?: string            // e.g. 'prisma', 'sqlite'
  api?: string                 // e.g. 'rest', 'websocket'
  performance?: string[]       // e.g. ['fast', 'responsive']
}

/** Kết quả phân tích intent */
export interface IntentResult {
  taskType: TaskType
  summary: string              // Tóm tắt 1 câu user muốn gì
  constraints: TechnicalConstraints
  ambiguities: string[]        // Các điểm mơ hồ cần clarification
  implicitRequirements: string[] // Yêu cầu ngầm (responsive, error handling...)
  confidence: number           // 0-1, độ tin cậy của phân tích
}

// ==================== 1.2 CODE READING ====================

/** Mental model của project sau khi đọc codebase */
export interface MentalModel {
  structure: ProjectStructure
  dependencies: DependencyGraph
  patterns: DetectedPattern[]
  conventions: CodeConventions
  readAt: Date
}

export interface ProjectStructure {
  pages: string[]              // Danh sách page files
  components: string[]         // Danh sách component files
  libs: string[]               // Danh sách library files
  apis: string[]               // Danh sách API route files
  configs: string[]            // Danh sách config files
}

export interface DependencyGraph {
  nodes: Map<string, string[]> // file → [files it imports]
  entryPoints: string[]        // Các file entry point
}

export interface DetectedPattern {
  type: 'ui-library' | 'orm' | 'state-management' | 'data-fetching' | 'realtime'
  name: string                 // e.g. 'shadcn/ui', 'prisma', 'zustand'
  confidence: number
}

export interface CodeConventions {
  componentNaming: 'PascalCase' | 'camelCase'
  functionNaming: 'camelCase' | 'snake_case'
  fileNaming: 'kebab-case' | 'PascalCase' | 'camelCase'
  importOrder: string[]        // e.g. ['react', 'next', 'third-party', 'local']
}

// ==================== 1.3 CONTEXT ASSEMBLY ====================

/** File được chọn để đưa vào context */
export interface SelectedFile {
  path: string
  relevance: number            // 0-1
  strategy: 'full' | 'summary' | 'signature'
  content?: string             // Nội dung đã compress (nếu strategy != full)
}

/** Context window sau khi assembly */
export interface AssembledContext {
  files: SelectedFile[]
  totalTokens: number
  compressionRatio: number     // original tokens / assembled tokens
  strategy: 'relevance' | 'dependency' | 'hybrid'
}

// ==================== SHARED ====================

/** Tin nhắn trong conversation history */
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Options cho intent parser */
export interface IntentParserOptions {
  useLLM?: boolean             // Mặc định: true
  model?: string               // Model dùng cho classification
}

/** Options cho code reader */
export interface CodeReaderOptions {
  forceRefresh?: boolean      // Bỏ cache, đọc lại
  maxFiles?: number            // Giới hạn số file đọc
}

/** Options cho context assembler */
export interface AssemblyOptions {
  maxTokens?: number           // Giới hạn token (mặc định: 8000)
  strategy?: 'relevance' | 'dependency' | 'hybrid'
  projectRoot?: string         // Đường dẫn gốc project (mặc định: process.cwd())
}
