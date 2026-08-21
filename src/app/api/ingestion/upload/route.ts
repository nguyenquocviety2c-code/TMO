/**
 * PDF Upload + Document Management API
 *
 * POST   /api/ingestion/upload           — upload PDF file(s), save to UPLOAD_DIR, create Qdrant metadata
 * GET    /api/ingestion/upload            — list documents (paginated)
 * GET    /api/ingestion/upload?documentId=xxx — get single document
 * DELETE /api/ingestion/upload?documentId=xxx — delete document + chunks + file
 *
 * Storage:
 *   - Filesystem: UPLOAD_DIR (default /tmp/theopus-uploads) — PDF binary saved here
 *   - Qdrant theopus_documents collection — document metadata (title, domain, status)
 *   - SQLite Document table — local buffer for fast access
 *
 * Returns:
 *   - POST: { documents: DocumentRecord[], errors: [{ file, error }] }
 *   - GET:  { documents: DocumentRecord[], total, page, pageSize }
 *   - DELETE: { success: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { qdrant, COLLECTION_DOCUMENTS, COLLECTION_CHUNKS, deleteChunksByDocument, deleteDocument } from '@/lib/qdrant'
import { db } from '@/lib/db'
import { uploadPdfToR2, deleteFromR2, r2KeyForPdf, isR2Configured } from '@/lib/r2-storage'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/theopus-uploads'

// ==================== ENSURE UPLOAD DIR EXISTS ====================

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  } catch {
    // ignore — dir may already exist
  }
}

// ==================== POST — UPLOAD PDF ====================

export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir()

    const formData = await request.formData()
    const files = formData.getAll('files')
    const domain = (formData.get('domain') as string) || 'mixed'

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Use field name "files" in FormData.' },
        { status: 400 }
      )
    }

    const uploadedDocs: Array<Record<string, unknown>> = []
    const errors: Array<{ file: string; error: string }> = []

    for (const file of files) {
      if (!(file instanceof File)) {
        errors.push({ file: 'unknown', error: 'Invalid file object' })
        continue
      }

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        errors.push({ file: file.name, error: 'Only PDF files are supported' })
        continue
      }

      // Validate file size (50 MB max — generous for textbooks)
      const MAX_FILE_SIZE = 50 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        errors.push({ file: file.name, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 50 MB` })
        continue
      }

      try {
        // Generate document ID (UUID)
        const documentId = crypto.randomUUID()

        // Generate safe filename: <documentId>_<original-name>
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filename = `${documentId}_${safeName}`
        const filePath = path.join(UPLOAD_DIR, filename)

        // Save PDF to filesystem
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        await fs.writeFile(filePath, buffer)

        // Phase 6: Upload to Cloudflare R2 (cloud backup — survives sandbox reset)
        // Non-blocking: if R2 fails, local file is still saved, user can retry sync later
        let r2Uploaded = false
        let r2Key: string | null = null
        if (isR2Configured()) {
          try {
            const r2Result = await uploadPdfToR2(documentId, file.name, buffer)
            if (r2Result.success) {
              r2Uploaded = true
              r2Key = r2Result.key
              console.log(`[Upload] R2 backup saved: ${r2Key} (${r2Result.size} bytes)`)
            } else {
              console.warn('[Upload] R2 backup failed (non-critical):', r2Result.error)
            }
          } catch (r2Err) {
            console.warn('[Upload] R2 upload error (non-critical):', r2Err instanceof Error ? r2Err.message : String(r2Err))
          }
        }

        // Create Qdrant document metadata (payload-only, no vector)
        const now = new Date().toISOString()
        const documentPayload = {
          title: file.name,
          file_path: filePath,
          // Phase 6: store R2 key so we can restore from cloud if local file is lost
          r2_key: r2Key,
          r2_uploaded: r2Uploaded,
          domain,
          status: 'uploaded',
          error_message: null,
          page_count: null,
          processing_steps: [],
          processing_percent: 0,
          created_at: now,
          updated_at: now,
        }

        // Use documentId as the Qdrant point ID (UUID)
        try {
          await qdrant.upsert(COLLECTION_DOCUMENTS, {
            wait: true,
            points: [
              {
                id: documentId,
                vector: [0.1], // theopus_documents uses size=1 placeholder vector (payload-only)
                payload: documentPayload,
              },
            ],
          })
        } catch (qdrantErr) {
          // If Qdrant fails, still keep the file on disk so user can retry
          console.error('[Upload] Qdrant upsert failed:', qdrantErr instanceof Error ? qdrantErr.message : String(qdrantErr))
          errors.push({
            file: file.name,
            error: `File saved to disk but Qdrant metadata failed: ${qdrantErr instanceof Error ? qdrantErr.message : 'unknown'}`,
          })
          continue
        }

        // Also create SQLite Document record (buffer for fast local access)
        try {
          await db.document.create({
            data: {
              id: documentId,
              title: file.name,
              filePath: filePath,
              domain,
              status: 'uploaded',
              pageCount: null,
            },
          })
        } catch (dbErr) {
          // Non-critical — Qdrant is source of truth for documents
          console.warn('[Upload] SQLite Document create failed (non-critical):', dbErr instanceof Error ? dbErr.message : String(dbErr))
        }

        uploadedDocs.push({
          id: documentId,
          title: file.name,
          file_path: filePath,
          domain,
          page_count: null,
          status: 'uploaded',
          error_message: null,
          processing_steps: [],
          processing_percent: 0,
          created_at: now,
          updated_at: now,
        })

        console.log(`[Upload] Saved: ${file.name} → ${filePath} (id=${documentId})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Upload] Failed to save ${file.name}:`, msg)
        errors.push({ file: file.name, error: msg })
      }
    }

    return NextResponse.json({
      documents: uploadedDocs,
      errors: errors.length > 0 ? errors : undefined,
      totalUploaded: uploadedDocs.length,
      totalErrors: errors.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Upload] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ==================== GET — LIST DOCUMENTS ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)
    const lite = searchParams.get('lite') === 'true'

    // Single document lookup
    if (documentId) {
      try {
        const points = await qdrant.retrieve(COLLECTION_DOCUMENTS, {
          ids: [documentId],
          with_payload: true,
          with_vector: false,
        })
        if (points.length === 0) {
          return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }
        const payload = points[0].payload as Record<string, unknown>
        return NextResponse.json({
          document: {
            id: points[0].id,
            ...payload,
          },
        })
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to fetch document: ${err instanceof Error ? err.message : 'unknown'}` },
          { status: 500 }
        )
      }
    }

    // List documents — use Qdrant scroll API for pagination
    try {
      const limit = Math.min(pageSize, 100) // cap at 100 per page
      const offset = (page - 1) * limit

      const scrollResult = await qdrant.scroll(COLLECTION_DOCUMENTS, {
        limit: limit + 1, // fetch 1 extra to know if there's a next page
        offset: offset > 0 ? offset : undefined,
        with_payload: true,
        with_vector: false,
      })

      const hasMore = scrollResult.points.length > limit
      const points = scrollResult.points.slice(0, limit)

      const documents = points.map(p => ({
        id: p.id,
        ...(p.payload as Record<string, unknown>),
      }))

      return NextResponse.json({
        documents,
        total: documents.length, // approximate — Qdrant scroll doesn't return total
        page,
        pageSize: limit,
        hasMore,
        lite,
      })
    } catch (err) {
      console.error('[Upload] GET list error:', err instanceof Error ? err.message : String(err))
      return NextResponse.json(
        { error: `Failed to list documents: ${err instanceof Error ? err.message : 'unknown'}` },
        { status: 500 }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ==================== DELETE — REMOVE DOCUMENT ====================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json({ error: 'documentId parameter is required' }, { status: 400 })
    }

    let deletedFromFs = false
    let deletedFromQdrant = false
    let deletedFromSqlite = false
    let deletedFromR2 = false
    let filePath: string | null = null
    let r2Key: string | null = null

    // Step 1: Get document metadata (need file_path + r2_key before deleting)
    try {
      const points = await qdrant.retrieve(COLLECTION_DOCUMENTS, {
        ids: [documentId],
        with_payload: true,
        with_vector: false,
      })
      if (points.length > 0) {
        filePath = (points[0].payload?.file_path as string) || null
        r2Key = (points[0].payload?.r2_key as string) || null
      }
    } catch {
      // proceed anyway
    }

    // Step 2: Delete file from filesystem
    if (filePath) {
      try {
        await fs.unlink(filePath)
        deletedFromFs = true
        console.log(`[Upload] Deleted file: ${filePath}`)
      } catch (err) {
        // File may already be gone — non-critical
        console.warn(`[Upload] File delete failed (non-critical):`, err instanceof Error ? err.message : String(err))
      }
    }

    // Step 2b: Delete from R2 (cloud backup)
    if (r2Key) {
      try {
        const r2Result = await deleteFromR2(r2Key)
        deletedFromR2 = r2Result.success
        if (deletedFromR2) {
          console.log(`[Upload] Deleted R2 backup: ${r2Key}`)
        } else {
          console.warn(`[Upload] R2 delete failed (non-critical):`, r2Result.error)
        }
      } catch (err) {
        console.warn(`[Upload] R2 delete error (non-critical):`, err instanceof Error ? err.message : String(err))
      }
    }

    // Step 3: Delete chunks from Qdrant
    try {
      await deleteChunksByDocument(documentId)
      console.log(`[Upload] Deleted chunks for document ${documentId}`)
    } catch (err) {
      console.warn(`[Upload] Chunks delete failed:`, err instanceof Error ? err.message : String(err))
    }

    // Step 4: Delete document metadata from Qdrant
    try {
      await deleteDocument(documentId)
      deletedFromQdrant = true
      console.log(`[Upload] Deleted Qdrant document ${documentId}`)
    } catch (err) {
      console.warn(`[Upload] Qdrant document delete failed:`, err instanceof Error ? err.message : String(err))
    }

    // Step 5: Delete SQLite Document record (if exists)
    try {
      await db.document.deleteMany({ where: { id: documentId } })
      deletedFromSqlite = true
    } catch {
      // non-critical
    }

    return NextResponse.json({
      success: deletedFromQdrant || deletedFromSqlite,
      deletedFromFs,
      deletedFromQdrant,
      deletedFromSqlite,
      deletedFromR2,
      documentId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Upload] DELETE error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
