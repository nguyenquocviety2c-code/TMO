/**
 * Learning Import API
 *
 * POST — Import agent learning data from JSON
 * Body: FormData with 'file' field containing JSON, or JSON body directly
 * Query: ?mode=skip | overwrite | merge (default: skip)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'skip' // skip | overwrite | merge
    const agentId = searchParams.get('agentId') || 'default'

    // Parse import data
    let importData: Record<string, unknown>
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
      const text = await file.text()
      importData = JSON.parse(text)
    } else {
      importData = await request.json()
    }

    if (!importData || typeof importData !== 'object') {
      return NextResponse.json({ error: 'Invalid import data' }, { status: 400 })
    }

    const stats = {
      insights: { imported: 0, skipped: 0, updated: 0 },
      corrections: { imported: 0, skipped: 0, updated: 0 },
      preferences: { imported: 0, skipped: 0, updated: 0 },
      standingOrders: { imported: 0, skipped: 0, updated: 0 },
      skills: { imported: 0, skipped: 0, updated: 0 },
    }

    // Import insights
    const insights = (importData.insights as Array<Record<string, unknown>>) || []
    for (const insight of insights) {
      const content = String(insight.content || '')
      if (!content) continue

      const existing = await db.agentInsight.findFirst({
        where: { agentId, content },
      })

      if (existing && mode === 'skip') {
        stats.insights.skipped++
        continue
      }

      if (existing && mode === 'overwrite') {
        await db.agentInsight.update({
          where: { id: existing.id },
          data: {
            source: String(insight.source || 'import'),
            type: String(insight.type || 'factual'),
            confidence: Number(insight.confidence) || 0.5,
          },
        })
        stats.insights.updated++
        continue
      }

      // Create new (or merge = create if not exists)
      await db.agentInsight.create({
        data: {
          agentId,
          content,
          source: String(insight.source || 'import'),
          type: String(insight.type || 'factual'),
          confidence: Number(insight.confidence) || 0.5,
        },
      })
      stats.insights.imported++
    }

    // Import corrections
    const corrections = (importData.corrections as Array<Record<string, unknown>>) || []
    for (const correction of corrections) {
      const wrongAnswer = String(correction.wrongAnswer || '')
      const correctAnswer = String(correction.correctAnswer || '')
      if (!wrongAnswer || !correctAnswer) continue

      const existing = await db.agentCorrection.findFirst({
        where: { agentId, wrongAnswer, correctAnswer },
      })

      if (existing && mode === 'skip') {
        stats.corrections.skipped++
        continue
      }

      if (existing && mode === 'overwrite') {
        await db.agentCorrection.update({
          where: { id: existing.id },
          data: {
            reason: String(correction.reason || null),
            applied: Boolean(correction.applied),
          },
        })
        stats.corrections.updated++
        continue
      }

      await db.agentCorrection.create({
        data: {
          agentId,
          wrongAnswer,
          correctAnswer,
          reason: String(correction.reason || null),
          applied: Boolean(correction.applied),
        },
      })
      stats.corrections.imported++
    }

    // Import preferences (upsert)
    const preferences = (importData.preferences as Array<Record<string, unknown>>) || []
    for (const pref of preferences) {
      const preferenceKey = String(pref.preferenceKey || '')
      const preferenceValue = String(pref.preferenceValue || '')
      if (!preferenceKey) continue

      if (mode === 'skip') {
        const existing = await db.agentPreference.findUnique({
          where: { agentId_preferenceKey: { agentId, preferenceKey } },
        })
        if (existing) {
          stats.preferences.skipped++
          continue
        }
      }

      await db.agentPreference.upsert({
        where: { agentId_preferenceKey: { agentId, preferenceKey } },
        create: {
          agentId,
          preferenceKey,
          preferenceValue,
          source: String(pref.source || 'import'),
        },
        update: mode === 'overwrite' ? {
          preferenceValue,
          source: String(pref.source || 'import'),
        } : {},
      })
      stats.preferences.imported++
    }

    // Import standing orders
    const standingOrders = (importData.standingOrders as Array<Record<string, unknown>>) || []
    for (const order of standingOrders) {
      const orderText = String(order.order || '')
      if (!orderText) continue

      const existing = await db.standingOrder.findFirst({
        where: { agentId, order: orderText },
      })

      if (existing && mode === 'skip') {
        stats.standingOrders.skipped++
        continue
      }

      if (existing && mode === 'overwrite') {
        await db.standingOrder.update({
          where: { id: existing.id },
          data: {
            priority: Number(order.priority) || 0,
            enabled: Boolean(order.enabled ?? true),
          },
        })
        stats.standingOrders.updated++
        continue
      }

      await db.standingOrder.create({
        data: {
          agentId,
          order: orderText,
          priority: Number(order.priority) || 0,
          enabled: Boolean(order.enabled ?? true),
        },
      })
      stats.standingOrders.imported++
    }

    // Import skills
    const importSkills = (importData.skills as Array<Record<string, unknown>>) || []
    for (const skill of importSkills) {
      const slug = String(skill.slug || '')
      const name = String(skill.name || '')
      if (!slug || !name) continue

      const existing = await db.agentSkill.findUnique({
        where: { agentId_slug: { agentId, slug } },
      })

      if (existing && mode === 'skip') {
        stats.skills.skipped++
        continue
      }

      if (existing && mode === 'overwrite') {
        await db.agentSkill.update({
          where: { id: existing.id },
          data: {
            name,
            content: String(skill.content || ''),
            source: String(skill.source || 'import'),
            enabled: Boolean(skill.enabled ?? true),
            version: String(skill.version || '1.0.0'),
          },
        })
        stats.skills.updated++
        continue
      }

      await db.agentSkill.create({
        data: {
          agentId,
          slug,
          name,
          content: String(skill.content || ''),
          source: String(skill.source || 'import'),
          enabled: Boolean(skill.enabled ?? true),
          version: String(skill.version || '1.0.0'),
        },
      })
      stats.skills.imported++
    }

    // Log the import event
    await db.learningLog.create({
      data: {
        agentId,
        eventType: 'pattern',
        content: JSON.stringify({
          action: 'import',
          mode,
          stats,
        }),
      },
    })

    return NextResponse.json({ success: true, stats })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to import learning data', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
