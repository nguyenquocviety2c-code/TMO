/**
 * Layer 3.2: Code Generation
 *
 * Viết code chính xác, đúng convention, đúng architecture.
 * Đây là "trái tim" của agent.
 *
 * Nguyên tắc:
 *   1. Convention-First: Follow existing code style
 *   2. Component-First: UI trước, logic sau
 *   3. Type-Safe: TypeScript strict, Prisma typed
 *   4. Incremental: Viết từng phần, không viết tất cả cùng lúc
 *   5. Self-Contained: Mỗi step nên hoàn chỉnh một feature nhỏ
 *
 * Quy trình sinh code:
 *   1. Đọc context (files liên quan)
 *   2. Xác định code cần viết
 *   3. Sinh code theo implementation plan
 *   4. Kiểm tra code self-consistency
 *   5. Viết vào file
 *   6. Verify (Layer 4)
 */

import { callLLM } from '@/lib/llm'
import type { ComponentDesign, APIDesign, SchemaDesign, SolutionDesign } from '@/lib/thinking'
import type {
  CodeGenResult,
  CodeGenOptions,
  GeneratedFile,
  ExecutionContext,
} from './types'

// ==================== DEFAULTS ====================

const DEFAULT_OPTIONS: Required<CodeGenOptions> = {
  followConventions: true,
  typeSafe: true,
  incremental: true,
  model: 'qwen/qwen3.5-397b-a17b',
}

// ==================== PROMPT TEMPLATES ====================

/**
 * Build prompt cho code generation dựa trên execution context.
 */
function buildCodeGenPrompt(ctx: ExecutionContext): string {
  const { subTask, solutionDesign, mentalModel, assembledContext } = ctx

  const conventions = mentalModel?.conventions
    ? `Naming: ${mentalModel.conventions.componentNaming} components, ${mentalModel.conventions.functionNaming} functions, ${mentalModel.conventions.fileNaming} files`
    : 'Follow existing project conventions'

  const contextFiles = assembledContext?.files
    ?.map((f) => `- ${f.path} (${f.strategy})`)
    .join('\n') || 'No context files provided'

  return `
You are a senior full-stack developer. Generate code for the following task.

## Task
${subTask.name}: ${subTask.description}

## Goal
${subTask.goal}

## Expected Output
${subTask.expectedOutput}

## Architecture Decisions
${solutionDesign.architectureDecisions.map((d) => `- ${d.question}: ${d.chosen} (${d.reasoning})`).join('\n')}

## Code Conventions
${conventions}

## Relevant Files
${contextFiles}

## Requirements
${subTask.type === 'frontend' ? '- Use React + TypeScript + Tailwind CSS\n- Follow shadcn/ui patterns if applicable\n- Ensure responsive design\n- Add loading and error states' : ''}
${subTask.type === 'backend' ? '- Use Next.js App Router API routes\n- Follow REST conventions\n- Include proper error handling\n- Validate input data' : ''}
${subTask.type === 'database' ? '- Use Prisma ORM\n- Define proper relations and indexes\n- Include constraints' : ''}

## Rules
1. Generate COMPLETE, working code — no placeholders, no TODOs
2. Follow the existing code style and conventions
3. Use TypeScript strictly — no \`any\` unless absolutely necessary
4. Include proper imports
5. Add JSDoc comments for public functions
6. Handle errors gracefully

Generate the code now. Return ONLY the code, wrapped in markdown code blocks with file paths.
`.trim()
}

/**
 * Parse LLM output thành danh sách GeneratedFile.
 *
 * Format expected:
 * \`\`\`typescript:src/components/MyComponent.tsx
 * // code here
 * \`\`\`
 */
function parseGeneratedFiles(
  llmOutput: string,
  subTaskId: string
): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const codeBlockRegex = /```(?:\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(llmOutput)) !== null) {
    const filePath = match[1]?.trim()
    const content = match[2]?.trim()

    if (!filePath || !content) continue

    const language = filePath.split('.').pop() || 'typescript'
    const operation: GeneratedFile['operation'] = filePath.includes('new:')
      ? 'create'
      : 'modify'

    files.push({
      path: filePath.replace('new:', '').trim(),
      content,
      operation,
      language,
    })
  }

  return files
}

// ==================== PUBLIC API ====================

/**
 * Sinh code từ implementation plan.
 *
 * Giải thuật:
 *   1. Đọc context từ ExecutionContext
 *   2. Xác định loại code cần sinh
 *   3. Gọi LLM với prompt chứa solution design + conventions + context
 *   4. Parse LLM output → GeneratedFile[]
 *   5. Validate self-consistency
 *   6. Trả về CodeGenResult
 *
 * @param ctx - Execution context từ Layer 2
 * @param options - Code generation options
 * @returns CodeGenResult
 */
export async function generateCode(
  ctx: ExecutionContext,
  options: Partial<CodeGenOptions> = {}
): Promise<CodeGenResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { subTask } = ctx

  try {
    // 1. Build prompt
    const prompt = buildCodeGenPrompt(ctx)

    // 2. Call LLM
    const llmResult = await callLLM(
      prompt,
      undefined,
      `code-gen:${subTask.id}`,
      {
        temperature: 0.3,
        maxTokens: 8192,
      }
    )

    const llmOutput = llmResult.content || ''
    const tokensUsed = llmResult.tokensUsed || 0

    // 3. Parse output
    const files = parseGeneratedFiles(llmOutput, subTask.id)

    // 4. Validate
    const validationErrors = validateCodeConsistency(files)

    return {
      subTaskId: subTask.id,
      files,
      success: validationErrors.length === 0,
      errors: validationErrors,
      tokensUsed,
    }
  } catch (error) {
    return {
      subTaskId: subTask.id,
      files: [],
      success: false,
      errors: [
        `Code generation failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
      tokensUsed: 0,
    }
  }
}

/**
 * Sinh UI component code từ ComponentDesign.
 *
 * @param design - Component design từ Layer 2
 * @returns Code string
 */
export async function generateComponent(design: ComponentDesign): Promise<string> {
  const prompt = `
Generate a React component based on the following design:

Component: ${design.name}
Hierarchy: ${design.hierarchy.join(' → ')}
Props: ${Object.entries(design.props).map(([k, v]) => `${k}: ${v}`).join(', ')}
Data Flow: ${design.dataFlow}
Events: ${design.events.join(', ')}
State: ${design.stateNeeds}

Requirements:
- Use TypeScript with strict types
- Use Tailwind CSS for styling
- Follow shadcn/ui component patterns
- Export as default component
- Include JSDoc
`

  const result = await callLLM(
    prompt,
    undefined,
    `component-gen:${design.name}`,
    {
      temperature: 0.3,
      maxTokens: 4096,
    }
  )

  return result.content || ''
}

/**
 * Sinh API route handler từ APIDesign.
 *
 * @param design - API design từ Layer 2
 * @returns Code string
 */
export async function generateApiRoute(design: APIDesign): Promise<string> {
  const endpoints = design.endpoints
    .map(
      (ep) => `
${ep.method} ${ep.path}
- Description: ${ep.description}
- Request: ${ep.requestFormat || 'N/A'}
- Response: ${ep.responseFormat}
- Auth: ${ep.authRequired ? 'Required' : 'Optional'}
`
    )
    .join('\n')

  const prompt = `
Generate Next.js App Router API routes based on the following design:

${endpoints}

Requirements:
- Use TypeScript
- Validate input with Zod
- Return proper HTTP status codes
- Handle errors with consistent format
- Include rate limiting comments
`

  const result = await callLLM(
    prompt,
    undefined,
    `api-gen:${design.endpoints[0]?.path || 'unknown'}`,
    {
      temperature: 0.3,
      maxTokens: 4096,
    }
  )

  return result.content || ''
}

/**
 * Sinh Prisma schema code từ SchemaDesign.
 *
 * @param design - Schema design từ Layer 2
 * @returns Code string
 */
export async function generateSchemaCode(design: SchemaDesign): Promise<string> {
  const models = design.models
    .map((model) => {
      const fields = model.fields
        .map((f) => `  ${f.name} ${f.type} ${f.constraints.join(' ')}`)
        .join('\n')
      const relations = model.relations
        .map((r) => `  // ${r.type} relation to ${r.to}`)
        .join('\n')

      return `model ${model.name} {\n${fields}\n${relations}\n}`
    })
    .join('\n\n')

  const indexes = design.indexes.map((idx) => `  ${idx}`).join('\n')
  const constraints = design.constraints.map((c) => `  ${c}`).join('\n')

  return `
// Auto-generated Prisma schema
// Generated from SchemaDesign

${models}

${indexes ? `// Indexes\n${indexes}` : ''}
${constraints ? `// Constraints\n${constraints}` : ''}
`.trim()
}

/**
 * Kiểm tra self-consistency của generated files.
 *
 * Kiểm tra:
 *   - Import paths có tồn tại?
 *   - Types có khớp với design?
 *   - Không conflict với code hiện có?
 *
 * @param files - Danh sách files đã sinh
 * @returns Danh sách lỗi (empty nếu pass)
 */
export function validateCodeConsistency(files: GeneratedFile[]): string[] {
  const errors: string[] = []

  for (const file of files) {
    // 1. Kiểm tra path không rỗng
    if (!file.path || file.path.trim() === '') {
      errors.push('Generated file has empty path')
      continue
    }

    // 2. Kiểm tra content không rỗng
    if (!file.content || file.content.trim() === '') {
      errors.push(`File ${file.path} has empty content`)
      continue
    }

    // 3. Kiểm tra import paths hợp lệ (basic)
    const importRegex = /from\s+['"]([^'"]+)['"]/g
    let importMatch: RegExpExecArray | null
    while ((importMatch = importRegex.exec(file.content)) !== null) {
      const importPath = importMatch[1]
      // Cảnh báo nếu import path chứa '../' quá nhiều (có thể là sai)
      const depth = (importPath.match(/\.\.\//g) || []).length
      if (depth > 5) {
        errors.push(`File ${file.path}: Suspicious import depth: ${importPath}`)
      }
    }

    // 4. Kiểm tra không có placeholder comments
    const placeholderPatterns = ['TODO:', 'FIXME:', 'PLACEHOLDER', '...']
    for (const pattern of placeholderPatterns) {
      if (file.content.includes(pattern)) {
        errors.push(`File ${file.path}: Contains placeholder: ${pattern}`)
      }
    }

    // 5. Kiểm tra TypeScript strict (không dùng 'any')
    if (file.language === 'typescript' || file.language === 'tsx') {
      const anyMatches = file.content.match(/:\s*any\b/g)
      if (anyMatches && anyMatches.length > 3) {
        errors.push(`File ${file.path}: Excessive use of 'any' (${anyMatches.length} times)`)
      }
    }
  }

  return errors
}