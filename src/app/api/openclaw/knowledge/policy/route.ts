/**
 * Knowledge Access Policy API — CRUD for KnowledgeAccessPolicy
 *
 * GET /api/openclaw/knowledge/policy — Return current policy for default agent
 * PUT /api/openclaw/knowledge/policy — Update/create policy
 *
 * PUT body: {
 *   allowRead?: boolean,
 *   allowWrite?: boolean,
 *   allowDelete?: boolean,
 *   allowedCollections?: string,
 *   allowedLabels?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_AGENT_ID = 'default'

export async function GET() {
  try {
    let policy = await db.knowledgeAccessPolicy.findUnique({
      where: { agentId: DEFAULT_AGENT_ID },
    })

    // Create default policy if none exists
    if (!policy) {
      policy = await db.knowledgeAccessPolicy.create({
        data: {
          agentId: DEFAULT_AGENT_ID,
          allowRead: true,
          allowWrite: true,
          allowDelete: false,
          allowedCollections: 'theopus_documents,theopus_chunks',
          allowedLabels: '*',
        },
      })
    }

    return NextResponse.json({
      policy: {
        id: policy.id,
        agentId: policy.agentId,
        allowRead: policy.allowRead,
        allowWrite: policy.allowWrite,
        allowDelete: policy.allowDelete,
        allowedCollections: policy.allowedCollections,
        allowedLabels: policy.allowedLabels,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch policy', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { allowRead, allowWrite, allowDelete, allowedCollections, allowedLabels } = body

    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {}
    if (typeof allowRead === 'boolean') updateData.allowRead = allowRead
    if (typeof allowWrite === 'boolean') updateData.allowWrite = allowWrite
    if (typeof allowDelete === 'boolean') updateData.allowDelete = allowDelete
    if (typeof allowedCollections === 'string') updateData.allowedCollections = allowedCollections
    if (typeof allowedLabels === 'string') updateData.allowedLabels = allowedLabels

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const policy = await db.knowledgeAccessPolicy.upsert({
      where: { agentId: DEFAULT_AGENT_ID },
      create: {
        agentId: DEFAULT_AGENT_ID,
        allowRead: (updateData.allowRead as boolean) ?? true,
        allowWrite: (updateData.allowWrite as boolean) ?? true,
        allowDelete: (updateData.allowDelete as boolean) ?? false,
        allowedCollections: (updateData.allowedCollections as string) ?? 'theopus_documents,theopus_chunks',
        allowedLabels: (updateData.allowedLabels as string) ?? '*',
      },
      update: updateData,
    })

    return NextResponse.json({
      policy: {
        id: policy.id,
        agentId: policy.agentId,
        allowRead: policy.allowRead,
        allowWrite: policy.allowWrite,
        allowDelete: policy.allowDelete,
        allowedCollections: policy.allowedCollections,
        allowedLabels: policy.allowedLabels,
      },
      updated: true,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update policy', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
