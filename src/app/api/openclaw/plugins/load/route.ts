import { NextResponse } from 'next/server'
import { loadAllPlugins } from '@/lib/plugin-runner'

export const dynamic = 'force-dynamic'

// POST: Load all plugins from installed skills
export async function POST() {
  try {
    const result = await loadAllPlugins()
    return NextResponse.json({
      success: true,
      loaded: result.loaded,
      failed: result.failed,
      results: result.results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load plugins', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

// GET: List currently loaded plugins
export async function GET() {
  const { getLoadedPlugins } = await import('@/lib/plugin-runner')
  const plugins = getLoadedPlugins()
  return NextResponse.json({
    plugins: plugins.map(p => ({
      slug: p.slug,
      name: p.manifest.name,
      version: p.manifest.version,
      toolCount: p.manifest.tools?.length || 0,
      tools: p.manifest.tools?.map(t => t.name) || [],
      loadedAt: p.loadedAt,
    })),
    total: plugins.length,
  })
}
