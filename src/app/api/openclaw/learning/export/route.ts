/**
 * Learning Export API
 *
 * GET — Export all agent learning data as JSON
 * Returns: insights, corrections, preferences, standing orders, learning logs
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId') || 'default'
    const format = searchParams.get('format') || 'json' // json | markdown

    const [insights, corrections, preferences, standingOrders, skills, recentLogs] = await Promise.all([
      db.agentInsight.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } }),
      db.agentCorrection.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } }),
      db.agentPreference.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } }),
      db.standingOrder.findMany({ where: { agentId }, orderBy: { priority: 'desc' } }),
      db.agentSkill.findMany({ where: { agentId }, orderBy: { installedAt: 'desc' } }),
      db.learningLog.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    if (format === 'markdown') {
      const lines: string[] = [
        `# Agent Memory Export`,
        ``,
        `**Agent ID**: ${agentId}`,
        `**Exported**: ${new Date().toISOString()}`,
        `**Insights**: ${insights.length} | **Corrections**: ${corrections.length} | **Preferences**: ${preferences.length}`,
        ``,
        `---`,
        ``,
        `## Insights`,
        ``,
      ]

      for (const i of insights) {
        lines.push(`- **[${i.type}]** ${i.content} (confidence: ${i.confidence}, source: ${i.source})`)
      }

      lines.push('', '## Corrections', '')
      for (const c of corrections) {
        lines.push(`- ❌ "${c.wrongAnswer}" → ✅ "${c.correctAnswer}"${c.reason ? ` (${c.reason})` : ''} ${c.applied ? '✓ Applied' : '⏳ Pending'}`)
      }

      lines.push('', '## Preferences', '')
      for (const p of preferences) {
        lines.push(`- **${p.preferenceKey}**: ${p.preferenceValue} (source: ${p.source})`)
      }

      lines.push('', '## Standing Orders', '')
      for (const o of standingOrders) {
        lines.push(`- ${o.enabled ? '✅' : '⏸️'} [${o.priority}] ${o.order}`)
      }

      lines.push('', '## Skills', '')
      for (const s of skills) {
        lines.push(`- ${s.enabled ? '✅' : '⏸️'} **${s.name}** (${s.slug}) v${s.version} [${s.source}]`)
      }

      return new NextResponse(lines.join('\n'), {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="agent-memory-${agentId}.md"` },
      })
    }

    // JSON format (default)
    const exportData = {
      version: '1.0.0',
      agentId,
      exportedAt: new Date().toISOString(),
      insights: insights.map(i => ({
        id: i.id,
        content: i.content,
        source: i.source,
        type: i.type,
        confidence: i.confidence,
        createdAt: i.createdAt.toISOString(),
      })),
      corrections: corrections.map(c => ({
        id: c.id,
        wrongAnswer: c.wrongAnswer,
        correctAnswer: c.correctAnswer,
        reason: c.reason,
        applied: c.applied,
        createdAt: c.createdAt.toISOString(),
      })),
      preferences: preferences.map(p => ({
        id: p.id,
        preferenceKey: p.preferenceKey,
        preferenceValue: p.preferenceValue,
        source: p.source,
        createdAt: p.createdAt.toISOString(),
      })),
      standingOrders: standingOrders.map(o => ({
        id: o.id,
        order: o.order,
        priority: o.priority,
        enabled: o.enabled,
        createdAt: o.createdAt.toISOString(),
      })),
      skills: skills.map(s => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        source: s.source,
        enabled: s.enabled,
        version: s.version,
        content: s.content,
        installedAt: s.installedAt.toISOString(),
      })),
      recentLogs: recentLogs.map(l => ({
        id: l.id,
        eventType: l.eventType,
        content: l.content,
        createdAt: l.createdAt.toISOString(),
      })),
    }

    return NextResponse.json(exportData)
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to export learning data', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
