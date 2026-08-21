/**
 * Unified Gateway Tool Definitions — Single Source of Truth
 *
 * ALL 36 Gateway tools (17 HTTP + 19 Bridge) in OpenAI function calling format.
 * This file is the ONLY place where tool definitions should be maintained.
 *
 * Access paths:
 *   - HTTP tools (17): web_search, web_fetch, memory_search, memory_get,
 *     sessions_list, sessions_history, session_status, sessions_yield,
 *     agents_list, message, tts, skill_workshop, browser, canvas,
 *     create_goal, get_goal, update_goal
 *   - Bridge tools (19): exec, read, write, edit, apply_patch, code_execution,
 *     process, sessions_spawn, sessions_send, cron, heartbeat_respond,
 *     gateway, nodes, update_plan, x_search, image, image_generate,
 *     music_generate, video_generate
 *
 * Consumers:
 *   - /api/openclaw/chat/route.ts — getToolDefinitionsForLLM()
 *   - /lib/code-team/tool-executor.ts — GATEWAY_TOOL_DEFINITIONS
 *   - /lib/standalone-agents.ts — Omega tool list
 */

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

// ==================== HTTP-ACCESSIBLE TOOLS (17) ====================

const HTTP_TOOLS: ToolDefinition[] = [
  // ── Web & Search ──
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Tìm kiếm trên web qua Gateway. Trả về kết quả với nội dung tóm tắt. Dùng khi cần tìm thông tin mới nhất trên internet.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Câu hỏi tìm kiếm' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch nội dung trang web từ URL qua Gateway. Trả về text content. Dùng khi cần đọc bài viết, docs, hoặc API references.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL trang web cần đọc' },
        },
        required: ['url'],
      },
    },
  },

  // ── Memory ──
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description: 'Tìm kiếm semantic trong memory (ký ức agent) qua Gateway. Trả về memories liên quan đến câu hỏi.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Câu hỏi tìm kiếm trong memory' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_get',
      description: 'Đọc memory files qua Gateway. Trả về nội dung memory tại đường dẫn cụ thể.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn memory file' },
        },
        required: ['path'],
      },
    },
  },

  // ── Sessions ──
  {
    type: 'function',
    function: {
      name: 'sessions_list',
      description: 'Liệt kê tất cả sessions trên Gateway. Dùng khi cần xem các phiên làm việc đang hoạt động.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sessions_history',
      description: 'Xem lịch sử chat của một session trên Gateway. Dùng khi cần xem lại cuộc trò chuyện.',
      parameters: {
        type: 'object',
        properties: {
          sessionKey: { type: 'string', description: 'Session key để xem lịch sử' },
        },
        required: ['sessionKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'session_status',
      description: 'Xem trạng thái session (model, usage, progress) trên Gateway.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID cần kiểm tra' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sessions_yield',
      description: 'Yield session control — nhường quyền điều khiển session cho agent khác.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID cần yield' },
        },
        required: ['session_id'],
      },
    },
  },

  // ── Agents ──
  {
    type: 'function',
    function: {
      name: 'agents_list',
      description: 'Liệt kê tất cả agents trên Gateway. Dùng khi cần xem các agent khả dụng.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'message',
      description: 'Gửi tin nhắn đến một session/agent trên Gateway. Dùng khi cần giao tiếp với agent khác.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Nội dung tin nhắn' },
          channel: { type: 'string', description: 'Kênh gửi tin nhắn (tùy chọn)' },
        },
        required: ['text'],
      },
    },
  },

  // ── Media ──
  {
    type: 'function',
    function: {
      name: 'tts',
      description: 'Text-to-speech qua Gateway. Chuyển văn bản thành giọng nói.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Văn bản cần chuyển thành giọng nói' },
          voice: { type: 'string', description: 'Giọng đọc (tùy chọn)' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skill_workshop',
      description: 'Tạo/chỉnh sửa skills qua Gateway Skill Workshop. Dùng khi cần tạo skill mới hoặc sửa skill hiện có.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'edit', 'list', 'delete'], description: 'Hành động cần thực hiện' },
          name: { type: 'string', description: 'Tên skill (cho create/edit/delete)' },
          content: { type: 'string', description: 'Nội dung SKILL.md (cho create/edit)' },
        },
        required: ['action'],
      },
    },
  },

  // ── Browser & Canvas ──
  {
    type: 'function',
    function: {
      name: 'browser',
      description: 'Điều khiển browser qua Gateway. Có thể navigate, click, screenshot, type. Dùng khi cần duyệt web tự động.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['navigate', 'click', 'screenshot', 'type', 'scroll', 'wait'], description: 'Hành động browser' },
          url: { type: 'string', description: 'URL (cho navigate)' },
          selector: { type: 'string', description: 'CSS selector (cho click/type)' },
          text: { type: 'string', description: 'Text (cho type action)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas',
      description: 'Vẽ/tạo hình trên canvas qua Gateway. Dùng cho visual workspace, tạo diagram, chart.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['draw', 'clear', 'render', 'export'], description: 'Hành động canvas' },
          content: { type: 'string', description: 'Nội dung cần vẽ (SVG, text, etc.)' },
        },
        required: ['action'],
      },
    },
  },

  // ── Goals & Planning ──
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description: 'Tạo goal/objective mới trên Gateway. Dùng khi cần theo dõi tiến độ công việc.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'Mô tả goal cần đạt được' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Mức ưu tiên' },
        },
        required: ['objective'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_goal',
      description: 'Xem goal hiện tại trên Gateway. Trả về mục tiêu đang theo dõi và tiến độ.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goal',
      description: 'Cập nhật trạng thái goal trên Gateway. Dùng khi hoàn thành hoặc thay đổi tiến độ.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['in_progress', 'completed', 'failed', 'paused'], description: 'Trạng thái mới' },
          note: { type: 'string', description: 'Ghi chú cập nhật (tùy chọn)' },
        },
        required: ['status'],
      },
    },
  },
]

// ==================== BRIDGE TOOLS (19 — session-context) ====================

const BRIDGE_TOOLS: ToolDefinition[] = [
  // ── Runtime & Files ──
  {
    type: 'function',
    function: {
      name: 'exec',
      description: 'Thực thi shell command qua Gateway Bridge. Dùng khi cần chạy lệnh terminal, cài packages, build project, v.v. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Lệnh shell cần thực thi' },
          cwd: { type: 'string', description: 'Working directory (tùy chọn)' },
          timeout: { type: 'number', description: 'Timeout tính bằng ms (tùy chọn, default: 30000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Đọc nội dung file qua Gateway Bridge. Trả về text content. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn file cần đọc' },
          encoding: { type: 'string', description: 'Encoding (default: utf-8)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Ghi nội dung vào file qua Gateway Bridge. Tạo file mới hoặc ghi đè. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn file cần ghi' },
          content: { type: 'string', description: 'Nội dung cần ghi vào file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Chỉnh sửa file qua Gateway Bridge — thay thế một đoạn text bằng đoạn text mới. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn file cần chỉnh sửa' },
          old_text: { type: 'string', description: 'Đoạn text cần thay thế' },
          new_text: { type: 'string', description: 'Đoạn text mới' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply patch/diff vào file qua Gateway Bridge. Dùng khi cần áp dụng nhiều thay đổi cùng lúc. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn file cần patch' },
          patch: { type: 'string', description: 'Nội dung patch (unified diff format)' },
        },
        required: ['path', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_execution',
      description: 'Thực thi Python code qua Gateway Bridge. Dùng khi cần chạy code Python, tính toán, xử lý data. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code cần thực thi' },
          language: { type: 'string', enum: ['python', 'javascript', 'typescript'], description: 'Ngôn ngữ lập trình (default: python)' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'process',
      description: 'Quản lý processes qua Gateway Bridge — liệt kê, kill, hoặc kiểm tra processes đang chạy. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'kill', 'status'], description: 'Hành động quản lý process' },
          pid: { type: 'number', description: 'Process ID (cho kill/status)' },
        },
        required: ['action'],
      },
    },
  },

  // ── Multi-Agent ──
  {
    type: 'function',
    function: {
      name: 'sessions_spawn',
      description: 'Tạo session mới (spawn) qua Gateway Bridge. Dùng khi cần khởi chạy agent trong session riêng biệt. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Tên agent cần spawn' },
          prompt: { type: 'string', description: 'Prompt khởi tạo cho session mới' },
        },
        required: ['agent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sessions_send',
      description: 'Gửi tin nhắn đến session khác qua Gateway Bridge. Dùng khi cần giao tiếp giữa các sessions. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID cần gửi đến' },
          message: { type: 'string', description: 'Nội dung tin nhắn' },
        },
        required: ['session_id', 'message'],
      },
    },
  },

  // ── Automation ──
  {
    type: 'function',
    function: {
      name: 'cron',
      description: 'Quản lý cron jobs qua Gateway Bridge. Lên lịch tác vụ chạy tự động. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'delete', 'update'], description: 'Hành động quản lý cron' },
          schedule: { type: 'string', description: 'Cron expression (cho create/update)' },
          task: { type: 'string', description: 'Mô tả tác vụ (cho create)' },
          job_id: { type: 'string', description: 'Job ID (cho delete/update)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'heartbeat_respond',
      description: 'Phản hồi heartbeat qua Gateway Bridge. Dùng để duy trì kết nối session. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Trạng thái heartbeat' },
        },
        required: [],
      },
    },
  },

  // ── System ──
  {
    type: 'function',
    function: {
      name: 'gateway',
      description: 'Quản lý Gateway qua Bridge — xem status, config, restart. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'config', 'restart', 'reload'], description: 'Hành động quản lý Gateway' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nodes',
      description: 'Quản lý nodes qua Gateway Bridge — liệt kê, thêm, xóa compute nodes. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'remove', 'status'], description: 'Hành động quản lý nodes' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Cập nhật execution plan qua Gateway Bridge. Dùng khi cần điều chỉnh kế hoạch thực thi. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'Mô tả plan mới hoặc cập nhật' },
          step: { type: 'number', description: 'Step number cần cập nhật (tùy chọn)' },
        },
        required: ['plan'],
      },
    },
  },

  // ── Web (session-context) ──
  {
    type: 'function',
    function: {
      name: 'x_search',
      description: 'Tìm kiếm bài viết trên X/Twitter qua Gateway Bridge. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Câu hỏi tìm kiếm trên X/Twitter' },
          limit: { type: 'number', description: 'Số kết quả trả về (default: 10)' },
        },
        required: ['query'],
      },
    },
  },

  // ── Media Generation (session-context) ──
  {
    type: 'function',
    function: {
      name: 'image',
      description: 'Phân tích/nhận diện hình ảnh qua Gateway Bridge. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL hình ảnh cần phân tích' },
          prompt: { type: 'string', description: 'Câu hỏi về hình ảnh (tùy chọn)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Tạo hình ảnh AI qua Gateway Bridge. Dùng khi cần tạo ảnh từ mô tả text. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Mô tả hình ảnh cần tạo' },
          size: { type: 'string', enum: ['256x256', '512x512', '1024x1024'], description: 'Kích thước ảnh (default: 1024x1024)' },
          style: { type: 'string', description: 'Style ảnh (tùy chọn: realistic, anime, artistic, etc.)' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'music_generate',
      description: 'Tạo nhạc AI qua Gateway Bridge. Dùng khi cần tạo âm nhạc từ mô tả. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Mô tả âm nhạc cần tạo (thể loại, nhạc cụ, phong cách)' },
          duration: { type: 'number', description: 'Thời lượng tính bằng giây (tùy chọn)' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'video_generate',
      description: 'Tạo video AI qua Gateway Bridge. Dùng khi cần tạo video từ mô tả text. Yêu cầu Bridge connection.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Mô tả video cần tạo' },
          duration: { type: 'number', description: 'Thời lượng tính bằng giây (tùy chọn)' },
        },
        required: ['prompt'],
      },
    },
  },
]

// ==================== UNIFIED REGISTRY ====================

/** ALL 36 Gateway tools — single source of truth */
export const ALL_GATEWAY_TOOL_DEFINITIONS: ToolDefinition[] = [...HTTP_TOOLS, ...BRIDGE_TOOLS]

/** Lookup map: tool name → definition */
export const GATEWAY_TOOL_MAP: Record<string, ToolDefinition> = Object.fromEntries(
  ALL_GATEWAY_TOOL_DEFINITIONS.map(t => [t.function.name, t])
)

/** HTTP-accessible tool names */
export const HTTP_TOOL_NAMES: string[] = HTTP_TOOLS.map(t => t.function.name)

/** Bridge (session-context) tool names */
export const BRIDGE_TOOL_NAMES: string[] = BRIDGE_TOOLS.map(t => t.function.name)

/** ALL 36 Gateway tool names */
export const ALL_GATEWAY_TOOL_NAMES: string[] = ALL_GATEWAY_TOOL_DEFINITIONS.map(t => t.function.name)

/**
 * Get tool definitions for a list of tool names.
 * Returns only Gateway tools (no local tools).
 * Unknown tool names are silently skipped.
 */
export function getGatewayToolDefinitions(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map(name => GATEWAY_TOOL_MAP[name])
    .filter((def): def is ToolDefinition => def !== undefined)
}

/**
 * Get ALL 36 Gateway tool definitions (for agents that have full access).
 */
export function getAllGatewayToolDefinitions(): ToolDefinition[] {
  return ALL_GATEWAY_TOOL_DEFINITIONS
}

/**
 * Get tool definitions formatted for OpenAI-compatible LLM calls.
 * Returns Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>
 */
export function getGatewayToolDefsForLLM(toolNames: string[]): Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return getGatewayToolDefinitions(toolNames).map(t => ({
    type: t.type,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters as Record<string, unknown>,
    },
  }))
}

/**
 * Get ALL tool definitions formatted for LLM calls.
 */
export function getAllGatewayToolDefsForLLM(): Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return ALL_GATEWAY_TOOL_DEFINITIONS.map(t => ({
    type: t.type,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters as Record<string, unknown>,
    },
  }))
}
