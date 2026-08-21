'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Brain, Loader2, CheckCircle2, XCircle, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ==================== TYPES ====================

interface AutoLearnRecord {
  id: string
  agentName: string
  query: string
  confidence: number
  provider: string
  entitiesCount: number | null
  relationshipsCount: number | null
  chunkSaved: boolean
  status: 'completed' | 'failed' | 'pending'
  createdAt: string
}

interface AutoLearnStats {
  totalRecords: number
  completedRecords: number
  failedRecords: number
  pendingRecords: number
  totalEntities: number
  totalRelationships: number
  totalChunks: number
}

// ==================== COMPONENT ====================

export default function AutoLearnSection() {
  const [records, setRecords] = useState<AutoLearnRecord[]>([])
  const [stats, setStats] = useState<AutoLearnStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-learn')
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setStats(data.stats || null)
      }
    } catch (err) {
      console.error('[AutoLearn] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const formatNumber = (n: number) => n.toLocaleString('vi-VN')

  const statusColor: Record<string, string> = {
    completed: 'text-emerald-400',
    failed: 'text-red-400',
    pending: 'text-amber-400',
  }
  const statusBg: Record<string, string> = {
    completed: 'bg-emerald-950/50',
    failed: 'bg-red-950/50',
    pending: 'bg-amber-950/50',
  }
  const providerColorMap: Record<string, { color: string; bg: string }> = {
    nvidia: { color: 'text-green-400', bg: 'bg-green-950/50' },
  }

  return (
    <div className="nc-wrap nc-lime">
    <Card className="nc-panel nc-md nc-border-lime">
      <CardHeader className="pb-1">
        <div className="flex flex-col items-center gap-1">
          <CardTitle className="text-base font-bold tracking-widest text-center text-white">AUTO-LEARN</CardTitle>
          <p className="text-[10px] text-stone-400">Agent tự bổ sung kiến thức vào Knowledge Base khi DB chưa đủ thông tin</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-stone-100">{formatNumber(stats.totalRecords)}</p>
                <p className="text-[9px] text-stone-400">Tổng bản ghi</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-emerald-400">{formatNumber(stats.completedRecords)}</p>
                <p className="text-[9px] text-stone-400">Hoàn thành</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-red-400">{formatNumber(stats.failedRecords)}</p>
                <p className="text-[9px] text-stone-400">Thất bại</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-amber-400">{formatNumber(stats.pendingRecords)}</p>
                <p className="text-[9px] text-stone-400">Đang xử lý</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-cyan-400">{formatNumber(stats.totalEntities)}</p>
                <p className="text-[9px] text-stone-400">Entities</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-violet-400">{formatNumber(stats.totalRelationships)}</p>
                <p className="text-[9px] text-stone-400">Relationships</p>
              </div>
              <div className="nc-panel nc-sm nc-border-lime p-2.5 text-center">
                <p className="text-lg font-bold text-pink-400">{formatNumber(stats.totalChunks)}</p>
                <p className="text-[9px] text-stone-400">Chunks Qdrant</p>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="nc-panel nc-sm nc-border-lime p-3">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-xs font-semibold text-stone-300">Cách hoạt động</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-stone-400">
              <div className="flex items-start gap-1.5">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-rose-950/50 text-rose-400 flex items-center justify-center text-[9px] font-bold">1</span>
                <span>Agent trả lời câu hỏi → Kiểm tra <span className="text-amber-400">confidence</span> (0.5–0.85)</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-rose-950/50 text-rose-400 flex items-center justify-center text-[9px] font-bold">2</span>
                <span>LLM trích xuất <span className="text-cyan-400">entities</span> + <span className="text-violet-400">relationships</span> + key facts</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-rose-950/50 text-rose-400 flex items-center justify-center text-[9px] font-bold">3</span>
                <span>Lưu vào <span className="text-green-400">Qdrant</span> (vector) + <span className="text-orange-400">Neo4j</span> (graph) + <span className="text-blue-400">SQLite</span></span>
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="nc-panel nc-sm nc-border-lime overflow-hidden">
            <div className="flex items-center gap-2 mb-0 px-3 py-2 bg-slate-950/60 border-b border-cyan-400/35">
              <GraduationCap className="h-3.5 w-3.5 text-stone-400" />
              <span className="text-xs font-semibold text-stone-300">Bản ghi Auto-Learn</span>
              <span className="text-[10px] text-stone-500 ml-auto">Tự cập nhật mỗi 10s</span>
            </div>
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-stone-400" />
                <span className="text-xs text-stone-500">Đang tải...</span>
              </div>
            ) : records.length === 0 ? (
              <div className="py-6 text-center">
                <Brain className="h-8 w-8 mx-auto mb-2 text-stone-600" />
                <p className="text-xs text-stone-500">Chưa có bản ghi Auto-Learn.</p>
                <p className="text-[10px] text-stone-600 mt-1">Khi Agent chat với confidence 0.5–0.85, kiến thức sẽ tự động được bổ sung.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto dialog-scrollbar">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-950/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-cyan-400/35">
                      <th className="py-2 px-2 text-left font-semibold text-stone-300">Agent</th>
                      <th className="py-2 px-2 text-left font-semibold text-stone-300">Query</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Conf</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Provider</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Ent</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Rel</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Chunk</th>
                      <th className="py-2 px-2 text-center font-semibold text-stone-300">Status</th>
                      <th className="py-2 px-2 text-right font-semibold text-stone-300">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, idx) => {
                      const pc = providerColorMap[rec.provider] || { color: 'text-stone-400', bg: 'bg-stone-950/50' }
                      const timeAgo = Math.round((Date.now() - new Date(rec.createdAt).getTime()) / 60000)
                      const timeStr = timeAgo < 60 ? `${timeAgo}m` : timeAgo < 1440 ? `${Math.round(timeAgo / 60)}h` : `${Math.round(timeAgo / 1440)}d`
                      return (
                        <tr key={rec.id} className={`${idx % 2 === 0 ? 'bg-cyan-950/10' : ''} hover:bg-slate-950/50 transition-colors border-b border-stone-700/30`}>
                          <td className="py-2 px-2">
                            <span className="text-[10px] font-medium text-white truncate max-w-[80px] inline-block align-middle">{rec.agentName}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[10px] text-stone-300 truncate max-w-[150px] inline-block align-middle" title={rec.query}>{rec.query}</span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[10px] font-semibold tabular-nums ${rec.confidence >= 0.7 ? 'text-emerald-400' : rec.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                              {(rec.confidence * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${pc.bg} ${pc.color} font-medium`}>{rec.provider}</span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[10px] tabular-nums text-cyan-400">{rec.entitiesCount || '—'}</span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[10px] tabular-nums text-violet-400">{rec.relationshipsCount || '—'}</span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            {rec.chunkSaved ? <CheckCircle2 className="h-3 w-3 text-emerald-400 inline" /> : <XCircle className="h-3 w-3 text-stone-600 inline" />}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusBg[rec.status] || 'bg-stone-950/50'} ${statusColor[rec.status] || 'text-stone-400'} font-medium`}>
                              {rec.status === 'completed' ? '✓' : rec.status === 'failed' ? '✗' : '…'}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span className="text-[10px] text-stone-500 tabular-nums">{timeStr}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}