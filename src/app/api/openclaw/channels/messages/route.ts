/**
 * OpenClaw Channel Messages API — View and reply to channel messages
 *
 * GET  /api/openclaw/channels/messages?channel=telegram&limit=50  — Get recent messages
 * POST /api/openclaw/channels/messages                            — Send a reply
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── Mock Messages ───────────────────────────────────────────────────────────

interface MockMessage {
  id: string
  channel: string
  direction: 'inbound' | 'outbound'
  sender: string
  content: string
  timestamp: string
  agentReplied: boolean
  agentReply: string | null
}

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: 'msg_001',
    channel: 'telegram',
    direction: 'inbound',
    sender: 'Nguyễn Văn A',
    content: 'QuickSort là gì?',
    timestamp: '2026-03-04T10:30:00Z',
    agentReplied: true,
    agentReply: 'QuickSort là thuật toán sắp xếp phân chia (divide-and-conquer). Nó chọn một phần tử làm pivot, phân chia mảng thành hai phần nhỏ hơn và lớn hơn pivot, rồi đệ quy sắp xếp từng phần.',
  },
  {
    id: 'msg_002',
    channel: 'telegram',
    direction: 'inbound',
    sender: 'Trần Thị B',
    content: 'Cách cài đặt Python trên Ubuntu?',
    timestamp: '2026-03-04T10:35:00Z',
    agentReplied: true,
    agentReply: 'Bạn có thể cài đặt Python trên Ubuntu bằng lệnh: sudo apt update && sudo apt install python3 python3-pip. Khuyến nghị dùng pyenv để quản lý nhiều phiên bản Python.',
  },
  {
    id: 'msg_003',
    channel: 'discord',
    direction: 'inbound',
    sender: 'Lê Minh C',
    content: 'Sự khác nhau giữa REST và GraphQL?',
    timestamp: '2026-03-04T11:00:00Z',
    agentReplied: true,
    agentReply: 'REST trả về dữ liệu cố định theo endpoint, còn GraphQL cho phép client chỉ định chính xác dữ liệu cần lấy trong một request duy nhất. GraphQL giảm over-fetching nhưng phức tạp hơn ở server side.',
  },
  {
    id: 'msg_004',
    channel: 'discord',
    direction: 'inbound',
    sender: 'Phạm Hoàng D',
    content: 'Docker compose là gì?',
    timestamp: '2026-03-04T11:15:00Z',
    agentReplied: true,
    agentReply: 'Docker Compose là công cụ định nghĩa và chạy nhiều container Docker cùng lúc. Bạn sử dụng file YAML để cấu hình các service, rồi chạy docker compose up để khởi động tất cả.',
  },
  {
    id: 'msg_005',
    channel: 'slack',
    direction: 'inbound',
    sender: 'Hoàng Thị E',
    content: 'Hướng dẫn sử dụng Git rebase',
    timestamp: '2026-03-04T11:30:00Z',
    agentReplied: true,
    agentReply: 'Git rebase tích hợp các commit từ nhánh này vào nhánh khác bằng cách "chơi lại" commit. Dùng: git rebase main. Lưu ý: không rebase nhánh public đã push để tránh xung đột lịch sử.',
  },
  {
    id: 'msg_006',
    channel: 'slack',
    direction: 'inbound',
    sender: 'Võ Thành F',
    content: 'Cách tối ưu query PostgreSQL?',
    timestamp: '2026-03-04T11:45:00Z',
    agentReplied: false,
    agentReply: null,
  },
  {
    id: 'msg_007',
    channel: 'webchat',
    direction: 'inbound',
    sender: 'Khách G',
    content: 'Machine Learning khác AI thế nào?',
    timestamp: '2026-03-04T12:00:00Z',
    agentReplied: true,
    agentReply: 'AI là lĩnh vực rộng tạo máy móc thông minh, còn Machine Learning là tập con của AI — tập trung vào việc máy tự học từ dữ liệu mà không cần lập trình tường minh mỗi quy tắc.',
  },
  {
    id: 'msg_008',
    channel: 'webchat',
    direction: 'inbound',
    sender: 'Khách H',
    content: 'Cách deploy Next.js lên Vercel?',
    timestamp: '2026-03-04T12:10:00Z',
    agentReplied: true,
    agentReply: 'Để deploy Next.js lên Vercel: 1) Push code lên GitHub, 2) Đăng nhập vercel.com, 3) Import repository, 4) Nhấn Deploy. Vercel tự động nhận diện Next.js và tối ưu build.',
  },
  {
    id: 'msg_009',
    channel: 'whatsapp',
    direction: 'inbound',
    sender: '+84901234567',
    content: 'Thời tiết hôm nay thế nào?',
    timestamp: '2026-03-04T12:30:00Z',
    agentReplied: true,
    agentReply: 'Tôi là trợ lý kỹ thuật, không có dữ liệu thời tiết real-time. Bạn có thể xem tại weather.com hoặc ứng dụng thời tiết trên điện thoại.',
  },
  {
    id: 'msg_010',
    channel: 'whatsapp',
    direction: 'inbound',
    sender: '+84907654321',
    content: 'Hướng dẫn cài đặt Node.js',
    timestamp: '2026-03-04T12:45:00Z',
    agentReplied: false,
    agentReply: null,
  },
  {
    id: 'msg_011',
    channel: 'signal',
    direction: 'inbound',
    sender: '+84987654321',
    content: 'Cách mã hóa dữ liệu bằng AES?',
    timestamp: '2026-03-04T13:00:00Z',
    agentReplied: true,
    agentReply: 'AES (Advanced Encryption Standard) là thuật toán mã hóa đối xứng. Trong Node.js, dùng crypto.createCipheriv() với algorithm "aes-256-cbc", cung cấp key 32 bytes và IV 16 bytes.',
  },
  {
    id: 'msg_012',
    channel: 'signal',
    direction: 'inbound',
    sender: '+84912345678',
    content: 'Sự khác biệt giữa TCP và UDP?',
    timestamp: '2026-03-04T13:15:00Z',
    agentReplied: true,
    agentReply: 'TCP đảm bảo truyền dữ liệu tin cậy, có thứ tự, còn UDP truyền nhanh hơn nhưng không đảm bảo. TCP dùng cho web/email, UDP dùng cho streaming/game.',
  },
  {
    id: 'msg_013',
    channel: 'telegram',
    direction: 'outbound',
    sender: 'Agent',
    content: 'Chào bạn! Tôi có thể giúp gì về kỹ thuật hôm nay?',
    timestamp: '2026-03-04T09:00:00Z',
    agentReplied: false,
    agentReply: null,
  },
  {
    id: 'msg_014',
    channel: 'discord',
    direction: 'outbound',
    sender: 'Agent',
    content: '🔔 Thông báo: Hệ thống đã cập nhật phiên bản mới v2.5.0',
    timestamp: '2026-03-04T08:00:00Z',
    agentReplied: false,
    agentReply: null,
  },
]

// ─── GET — Get recent messages ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel') || 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    const validChannels = ['telegram', 'discord', 'slack', 'webchat', 'whatsapp', 'signal', 'all']
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { error: `Kênh không hợp lệ: ${channel}. Các kênh hợp lệ: ${validChannels.join(', ')}` },
        { status: 400 }
      )
    }

    let filtered = channel === 'all'
      ? MOCK_MESSAGES
      : MOCK_MESSAGES.filter((m) => m.channel === channel)

    // Sort by timestamp descending
    filtered = filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply limit
    filtered = filtered.slice(0, limit)

    return NextResponse.json({
      messages: filtered,
      total: filtered.length,
      channel,
    })
  } catch (error) {
    console.error('[Channel Messages GET] Error:', error)
    return NextResponse.json({ error: 'Không thể tải tin nhắn kênh' }, { status: 500 })
  }
}

// ─── POST — Send a reply ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { channel, messageId, content } = body

    if (!channel || !messageId || !content) {
      return NextResponse.json(
        { error: 'Thiếu thông tin: cần channel, messageId và content' },
        { status: 400 }
      )
    }

    const validChannels = ['telegram', 'discord', 'slack', 'webchat', 'whatsapp', 'signal']
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { error: `Kênh không hợp lệ: ${channel}` },
        { status: 400 }
      )
    }

    // Find the original message (from mock data)
    const originalMsg = MOCK_MESSAGES.find((m) => m.id === messageId && m.channel === channel)

    if (!originalMsg) {
      return NextResponse.json(
        { error: `Không tìm thấy tin nhắn ${messageId} trên kênh ${channel}` },
        { status: 404 }
      )
    }

    // Create mock reply record
    const reply = {
      id: `reply_${Date.now()}`,
      originalMessageId: messageId,
      channel,
      direction: 'outbound' as const,
      sender: 'Agent',
      content,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      message: `Đã gửi phản hồi trên kênh ${channel}`,
      reply,
    })
  } catch (error) {
    console.error('[Channel Messages POST] Error:', error)
    return NextResponse.json({ error: 'Không thể gửi phản hồi' }, { status: 500 })
  }
}
