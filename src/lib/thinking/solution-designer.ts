/**
 * Layer 2.2: Solution Design
 *
 * Thiết kế giải pháp cho mỗi sub-task trước khi code.
 * Luồng xử lý:
 *   1. makeArchitectureDecisions()  → Chọn approach phù hợp
 *   2. designComponents()             → Thiết kế UI component tree
 *   3. designSchema()                 → Thiết kế database schema
 *   4. designAPI()                    → Thiết kế API contracts
 *   5. designState()                  → Thiết kế state management
 */

import { callLLM } from '@/lib/llm'
import type { IntentResult, MentalModel } from '@/lib/intake'
import type {
  SubTask,
  SolutionDesign,
  ArchitectureDecision,
  ComponentDesign,
  SchemaDesign,
  APIDesign,
  StateDesign,
  SolutionDesignerOptions,
} from './types'

// ==================== MAIN FUNCTION ====================

/**
 * Thiết kế giải pháp cho một sub-task.
 *
 * @param subTask - Sub-task cần thiết kế
 * @param intentResult - Kết quả phân tích intent từ Layer 1
 * @param mentalModel - Mental model của project từ Layer 1
 * @param options - Cấu hình solution design
 * @returns SolutionDesign
 */
export async function designSolution(
  subTask: SubTask,
  intentResult: IntentResult,
  mentalModel: MentalModel,
  options: SolutionDesignerOptions = {},
): Promise<SolutionDesign> {
  const { useLLM = true } = options

  // Step 1: Architecture decisions
  const architectureDecisions = makeArchitectureDecisions(subTask, intentResult)

  // Step 2-5: Design theo loại sub-task
  let componentDesigns: ComponentDesign[] = []
  let schemaDesign: SchemaDesign | undefined
  let apiDesign: APIDesign | undefined
  let stateDesign: StateDesign | undefined

  if (useLLM) {
    try {
      const llmDesign = await generateDesignWithLLM(subTask, intentResult, mentalModel)
      componentDesigns = llmDesign.componentDesigns || []
      schemaDesign = llmDesign.schemaDesign
      apiDesign = llmDesign.apiDesign
      stateDesign = llmDesign.stateDesign
    } catch (err) {
      console.warn('[SolutionDesigner] LLM failed, using heuristic design:', err)
      // Fallback: heuristic design
      if (subTask.type === 'frontend') {
        componentDesigns = designComponentsHeuristic(subTask, intentResult)
        stateDesign = designStateHeuristic(subTask, intentResult)
      }
      if (subTask.type === 'backend' || subTask.type === 'integration') {
        apiDesign = designAPIHeuristic(subTask, intentResult)
      }
      if (subTask.type === 'database') {
        schemaDesign = designSchemaHeuristic(subTask, intentResult)
      }
    }
  } else {
    // Heuristic design
    if (subTask.type === 'frontend') {
      componentDesigns = designComponentsHeuristic(subTask, intentResult)
      stateDesign = designStateHeuristic(subTask, intentResult)
    }
    if (subTask.type === 'backend' || subTask.type === 'integration') {
      apiDesign = designAPIHeuristic(subTask, intentResult)
    }
    if (subTask.type === 'database') {
      schemaDesign = designSchemaHeuristic(subTask, intentResult)
    }
  }

  return {
    architectureDecisions,
    componentDesigns,
    schemaDesign,
    apiDesign,
    stateDesign,
    implementationNotes: generateImplementationNotes(subTask, intentResult),
  }
}

// ==================== STEP 1: ARCHITECTURE DECISIONS ====================

/**
 * Đưa ra architecture decisions dựa trên constraints.
 */
function makeArchitectureDecisions(subTask: SubTask, intentResult: IntentResult): ArchitectureDecision[] {
  const decisions: ArchitectureDecision[] = []
  const { constraints } = intentResult

  // REST vs WebSocket
  if (subTask.type === 'backend' || subTask.type === 'integration') {
    const needsRealtime = constraints.api === 'websocket' || subTask.description.toLowerCase().includes('real-time')
    decisions.push({
      question: 'REST hay WebSocket?',
      options: ['REST', 'WebSocket'],
      chosen: needsRealtime ? 'WebSocket' : 'REST',
      reasoning: needsRealtime ? 'Task yêu cầu real-time' : 'REST đơn giản, đủ cho use case này',
      tradeoffs: needsRealtime
        ? ['WebSocket: real-time nhưng phức tạp hơn', 'REST: đơn giản nhưng không real-time']
        : ['REST: đơn giản, dễ debug', 'WebSocket: không cần thiết cho use case này'],
    })
  }

  // SSR vs CSR
  if (subTask.type === 'frontend') {
    const isDataHeavy = subTask.description.toLowerCase().includes('data') || subTask.description.toLowerCase().includes('list')
    decisions.push({
      question: 'SSR hay CSR?',
      options: ['SSR', 'CSR'],
      chosen: isDataHeavy ? 'SSR' : 'CSR',
      reasoning: isDataHeavy ? 'Data-heavy page nên dùng SSR' : 'CSR đủ cho page này',
      tradeoffs: isDataHeavy
        ? ['SSR: SEO tốt, first load nhanh', 'CSR: interactive nhanh hơn']
        : ['CSR: đơn giản, không cần server', 'SSR: không cần thiết cho page này'],
    })
  }

  // Server Action vs API Route
  if (subTask.type === 'backend' && constraints.framework === 'next.js') {
    decisions.push({
      question: 'Server Action hay API Route?',
      options: ['Server Action', 'API Route'],
      chosen: 'Server Action',
      reasoning: 'Next.js App Router ưu tiên Server Actions cho form submissions',
      tradeoffs: ['Server Action: đơn giản, không cần API endpoint riêng', 'API Route: linh hoạt hơn cho external clients'],
    })
  }

  // Local state vs Global state
  if (subTask.type === 'frontend') {
    decisions.push({
      question: 'Local state hay Global state?',
      options: ['Local state', 'Global state'],
      chosen: 'Local state',
      reasoning: 'Ưu tiên local state, chỉ dùng global state khi cần share giữa nhiều components',
      tradeoffs: ['Local state: đơn giản, dễ debug', 'Global state: cần thiết cho shared data'],
    })
  }

  return decisions
}

// ==================== STEP 2: COMPONENT DESIGN ====================

/**
 * Thiết kế UI components (heuristic).
 */
function designComponentsHeuristic(subTask: SubTask, intentResult: IntentResult): ComponentDesign[] {
  const components: ComponentDesign[] = []

  // Tạo component chính
  components.push({
    name: `${subTask.name}Component`,
    hierarchy: [subTask.name],
    props: {
      data: 'any',
      onAction: '() => void',
    },
    dataFlow: 'unidirectional',
    events: ['onClick', 'onSubmit', 'onChange'],
    stateNeeds: 'local',
  })

  // Nếu có form
  if (subTask.description.toLowerCase().includes('form')) {
    components.push({
      name: `${subTask.name}Form`,
      hierarchy: [subTask.name, 'Form'],
      props: {
        initialData: 'any',
        onSubmit: '(data: any) => void',
      },
      dataFlow: 'unidirectional',
      events: ['onSubmit', 'onChange', 'onValidate'],
      stateNeeds: 'local',
    })
  }

  return components
}

// ==================== STEP 3: SCHEMA DESIGN ====================

/**
 * Thiết kế database schema (heuristic).
 */
function designSchemaHeuristic(subTask: SubTask, _intentResult: IntentResult): SchemaDesign {
  return {
    models: [
      {
        name: `${subTask.name}Model`,
        fields: [
          { name: 'id', type: 'String', constraints: ['@id', '@default(uuid())'] },
          { name: 'createdAt', type: 'DateTime', constraints: ['@default(now())'] },
          { name: 'updatedAt', type: 'DateTime', constraints: ['@updatedAt'] },
        ],
        relations: [],
      },
    ],
    indexes: [],
    constraints: [],
  }
}

// ==================== STEP 4: API DESIGN ====================

/**
 * Thiết kế API endpoints (heuristic).
 */
function designAPIHeuristic(subTask: SubTask, _intentResult: IntentResult): APIDesign {
  const endpoints = [
    {
      method: 'GET' as const,
      path: `/api/${subTask.name.toLowerCase().replace(/\s+/g, '-')}`,
      description: `Lấy danh sách ${subTask.name}`,
      responseFormat: 'JSON array',
      errorFormat: '{ error: string }',
      authRequired: false,
    },
    {
      method: 'POST' as const,
      path: `/api/${subTask.name.toLowerCase().replace(/\s+/g, '-')}`,
      description: `Tạo mới ${subTask.name}`,
      requestFormat: 'JSON object',
      responseFormat: 'JSON object',
      errorFormat: '{ error: string }',
      authRequired: false,
    },
  ]

  return { endpoints }
}

// ==================== STEP 5: STATE DESIGN ====================

/**
 * Thiết kế state management (heuristic).
 */
function designStateHeuristic(subTask: SubTask, _intentResult: IntentResult): StateDesign {
  return {
    stores: [
      {
        name: `${subTask.name}State`,
        type: 'local',
        shape: { data: 'any', loading: 'boolean', error: 'string | null' },
        updateMethod: 'setter',
      },
    ],
  }
}

// ==================== LLM-BASED DESIGN ====================

/**
 * Sinh solution design bằng LLM.
 */
async function generateDesignWithLLM(
  subTask: SubTask,
  intentResult: IntentResult,
  mentalModel: MentalModel,
): Promise<Partial<SolutionDesign>> {
  const prompt = buildSolutionDesignPrompt(subTask, intentResult, mentalModel)

  const result = await callLLM(
    prompt,
    'Bạn là một kiến trúc sư phần mềm. Thiết kế giải pháp chi tiết cho sub-task. Output JSON.',
    'solution_design',
    { temperature: 0.3, maxTokens: 4000 }
  )

  // Parse JSON
  const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) || result.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('LLM did not return valid JSON for solution design')
  }

  const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])

  return {
    architectureDecisions: parsed.architectureDecisions || [],
    componentDesigns: parsed.componentDesigns || [],
    schemaDesign: parsed.schemaDesign,
    apiDesign: parsed.apiDesign,
    stateDesign: parsed.stateDesign,
    implementationNotes: parsed.implementationNotes || [],
  }
}

/**
 * Build prompt cho LLM solution design.
 */
function buildSolutionDesignPrompt(
  subTask: SubTask,
  intentResult: IntentResult,
  mentalModel: MentalModel,
): string {
  return `Thiết kế giải pháp cho sub-task sau:

Sub-task: ${subTask.name}
Type: ${subTask.type}
Description: ${subTask.description}
Goal: ${subTask.goal}

Intent: ${intentResult.taskType}
Framework: ${intentResult.constraints.framework || 'N/A'}
Database: ${intentResult.constraints.database || 'N/A'}
API: ${intentResult.constraints.api || 'N/A'}

Project structure:
- Pages: ${mentalModel.structure.pages.length} files
- Components: ${mentalModel.structure.components.length} files
- APIs: ${mentalModel.structure.apis.length} files

Output JSON với format:
{
  "architectureDecisions": [...],
  "componentDesigns": [...],
  "schemaDesign": { ... },
  "apiDesign": { ... },
  "stateDesign": { ... },
  "implementationNotes": [...]
}`
}

// ==================== HELPERS ====================

/**
 * Sinh implementation notes.
 */
function generateImplementationNotes(subTask: SubTask, intentResult: IntentResult): string[] {
  const notes: string[] = []

  if (intentResult.constraints.framework === 'next.js') {
    notes.push('Sử dụng Next.js App Router')
  }

  if (intentResult.constraints.styling === 'tailwind') {
    notes.push('Sử dụng Tailwind CSS cho styling')
  }

  if (intentResult.constraints.database === 'prisma') {
    notes.push('Sử dụng Prisma ORM cho database')
  }

  if (subTask.type === 'frontend') {
    notes.push('Đảm bảo responsive design')
    notes.push('Thêm error boundaries')
    notes.push('Thêm loading states')
  }

  if (intentResult.ambiguities.length > 0) {
    notes.push(`Ambiguities cần clarification: ${intentResult.ambiguities.join(', ')}`)
  }

  return notes
}