'use client'

import { useState } from 'react'
import { Download, FileArchive, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const PARTS = [
  { name: 'Part 1/4', file: 'theopusflashlite-part-aa', size: '14 MB' },
  { name: 'Part 2/4', file: 'theopusflashlite-part-ab', size: '14 MB' },
  { name: 'Part 3/4', file: 'theopusflashlite-part-ac', size: '14 MB' },
  { name: 'Part 4/4', file: 'theopusflashlite-part-ad', size: '2.4 MB' },
]

export default function DownloadPage() {
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleDownload = (file: string) => {
    setDownloading(file)
    const a = document.createElement('a')
    a.href = `/${file}`
    a.download = file
    a.click()
    setDownloaded(prev => new Set(prev).add(file))
    setDownloading(null)
  }

  const handleDownloadAll = () => {
    PARTS.forEach((part, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = `/${part.file}`
        a.download = part.file
        a.click()
        setDownloaded(prev => new Set(prev).add(part.file))
      }, i * 1500)
    })
  }

  const allDownloaded = downloaded.size === PARTS.length

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 mb-2">
            <FileArchive className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Theopusflashlite v2.0</h1>
          <p className="text-gray-400 text-sm">Multi-Agent AI Platform — Full Source Code + .env</p>
        </div>

        {/* Archive Info */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5 space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-amber-400" />
            Thông tin gói tải
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-gray-400">Tổng dung lượng</div>
              <div className="font-mono font-semibold text-white">45 MB (4 parts)</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-gray-400">Định dạng</div>
              <div className="font-mono font-semibold text-white">tar.gz</div>
            </div>
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <p>✅ Bao gồm: source code, .env, .env.example, prisma, package.json, skills, mini-services, public assets</p>
            <p>❌ Loại trừ: node_modules (cài lại qua <code className="text-amber-400">bun install</code>), .next, .git, db runtime data</p>
          </div>
        </div>

        {/* Download Parts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Tải từng phần</h2>
            <button
              onClick={handleDownloadAll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Tải tất cả
            </button>
          </div>

          <div className="space-y-2">
            {PARTS.map((part) => (
              <div
                key={part.file}
                className="flex items-center justify-between bg-gray-800/50 rounded-lg border border-gray-700/50 p-3 hover:border-gray-600/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {downloaded.has(part.file) ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <FileArchive className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <div className="font-medium text-sm">{part.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{part.file} ({part.size})</div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(part.file)}
                  disabled={downloading === part.file}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {downloading === part.file ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : downloaded.has(part.file) ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {downloaded.has(part.file) ? 'Đã tải' : 'Tải'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Assembly Instructions */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5 space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            Hướng dẫn ghép file & chạy
          </h2>
          <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs space-y-2 text-green-400 overflow-x-auto">
            <p className="text-gray-500"># 1. Ghép 4 phần thành 1 file</p>
            <p>cat theopusflashlite-part-* &gt; theopusflashlite.tar.gz</p>
            <p className="text-gray-500 mt-2"># 2. Giải nén</p>
            <p>tar xzf theopusflashlite.tar.gz</p>
            <p className="text-gray-500 mt-2"># 3. Cài dependencies</p>
            <p>cd my-project</p>
            <p>bun install</p>
            <p className="text-gray-500 mt-2"># 4. Setup database</p>
            <p>bun run setup</p>
            <p className="text-gray-500 mt-2"># 5. Chạy app</p>
            <p>bun run dev</p>
            <p className="text-gray-500 mt-2"># (Optional) Cài Qdrant cho vector search</p>
            <p>docker run -p 6333:6333 qdrant/qdrant</p>
          </div>

          {allDownloaded && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-5 h-5" />
              Đã tải đủ 4 phần! Dùng lệnh <code className="bg-gray-900 px-1.5 py-0.5 rounded text-xs">cat theopusflashlite-part-* &gt; theopusflashlite.tar.gz</code> để ghép
            </div>
          )}
        </div>

        {/* Qdrant Note */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300 space-y-2">
          <p className="font-semibold">📌 Về Qdrant & Neo4j</p>
          <p>• <strong>Qdrant</strong>: Cài riêng (<code>docker run -p 6333:6333 qdrant/qdrant</code>). Collections tự tạo khi app chạy. Dữ liệu cũ không bao gồm trong gói.</p>
          <p>• <strong>Neo4j</strong>: Optional — chỉ cần cho Knowledge Graph. App vẫn chạy bình thường không có Neo4j.</p>
        </div>
      </div>
    </div>
  )
}
