/**
 * OpenClaw Channel Config API — Manage individual channel configurations
 *
 * GET /api/openclaw/channels/config?channel=telegram  — Get channel config + field definitions
 * PUT /api/openclaw/channels/config?channel=telegram  — Update channel config
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ─── Channel Field Definitions ───────────────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'select'
  options?: string[]
  placeholder?: string
}

const CHANNEL_FIELDS: Record<string, FieldDef[]> = {
  telegram: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...' },
    { key: 'chatId', label: 'Chat ID', type: 'text', placeholder: '-1001234567890' },
    { key: 'allowedUsers', label: 'Allowed Users', type: 'text', placeholder: 'user1,user2,user3' },
  ],
  discord: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'MTk4NjIy...' },
    { key: 'guildId', label: 'Guild ID', type: 'text', placeholder: '123456789012345678' },
    { key: 'channelId', label: 'Channel ID', type: 'text', placeholder: '123456789012345678' },
  ],
  slack: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
    { key: 'workspace', label: 'Workspace', type: 'text', placeholder: 'my-workspace' },
    { key: 'channel', label: 'Channel', type: 'text', placeholder: '#general' },
  ],
  webchat: [
    { key: 'port', label: 'Port', type: 'number', placeholder: '8080' },
    { key: 'corsOrigins', label: 'CORS Origins', type: 'text', placeholder: 'http://localhost:3000' },
    { key: 'authMode', label: 'Auth Mode', type: 'select', options: ['none', 'token', 'oauth'] },
  ],
  whatsapp: [
    { key: 'phoneNumber', label: 'Phone Number', type: 'text', placeholder: '+84901234567' },
    { key: 'apiToken', label: 'API Token', type: 'password', placeholder: 'EAAx...' },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'password', placeholder: 'my_verify_token' },
  ],
  signal: [
    { key: 'phoneNumber', label: 'Phone Number', type: 'text', placeholder: '+84901234567' },
    { key: 'signalCliPath', label: 'signal-cli Path', type: 'text', placeholder: '/usr/bin/signal-cli' },
  ],
}

const VALID_CHANNELS = Object.keys(CHANNEL_FIELDS)

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  webchat: 'WebChat',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
}

// ─── GET — Get channel config ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')

    if (!channel || !VALID_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `Loại kênh không hợp lệ. Các kênh hợp lệ: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      )
    }

    const dbConfig = await db.channelConfig.findUnique({ where: { channelType: channel } })

    let parsedConfig: Record<string, unknown> = {}
    if (dbConfig?.config) {
      try {
        parsedConfig = JSON.parse(dbConfig.config)
      } catch {
        parsedConfig = {}
      }
    }

    return NextResponse.json({
      channelType: channel,
      label: CHANNEL_LABELS[channel],
      enabled: dbConfig?.enabled ?? false,
      connectedAt: dbConfig?.connectedAt ?? null,
      config: parsedConfig,
      fields: CHANNEL_FIELDS[channel],
    })
  } catch (error) {
    console.error('[Channel Config GET] Error:', error)
    return NextResponse.json({ error: 'Không thể tải cấu hình kênh' }, { status: 500 })
  }
}

// ─── PUT — Update channel config ─────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')

    if (!channel || !VALID_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `Loại kênh không hợp lệ. Các kênh hợp lệ: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { config: newConfig, enabled } = body

    if (newConfig === undefined && enabled === undefined) {
      return NextResponse.json(
        { error: 'Phải cung cấp ít nhất config hoặc enabled' },
        { status: 400 }
      )
    }

    // Fetch existing config to merge
    const existing = await db.channelConfig.findUnique({ where: { channelType: channel } })

    let mergedConfig: Record<string, unknown> = {}
    if (existing?.config) {
      try {
        mergedConfig = JSON.parse(existing.config)
      } catch {
        mergedConfig = {}
      }
    }

    // Merge new config into existing
    if (newConfig !== undefined && typeof newConfig === 'object') {
      mergedConfig = { ...mergedConfig, ...newConfig }
    }

    // Determine enabled state
    const finalEnabled = enabled !== undefined ? enabled : (existing?.enabled ?? false)

    // Determine connectedAt
    const now = new Date()
    let connectedAt: Date | null = existing?.connectedAt ?? null
    if (finalEnabled && !connectedAt) {
      connectedAt = now
    } else if (!finalEnabled) {
      connectedAt = null
    }

    const record = await db.channelConfig.upsert({
      where: { channelType: channel },
      update: {
        config: JSON.stringify(mergedConfig),
        enabled: finalEnabled,
        connectedAt,
      },
      create: {
        channelType: channel,
        config: JSON.stringify(mergedConfig),
        enabled: finalEnabled,
        connectedAt,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Cấu hình kênh ${CHANNEL_LABELS[channel]} đã được cập nhật`,
      channel: {
        channelType: record.channelType,
        enabled: record.enabled,
        config: mergedConfig,
        connectedAt: record.connectedAt,
      },
    })
  } catch (error) {
    console.error('[Channel Config PUT] Error:', error)
    return NextResponse.json({ error: 'Không thể cập nhật cấu hình kênh' }, { status: 500 })
  }
}
