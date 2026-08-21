/**
 * Wallpaper Upload API — Upload and serve background wallpaper image
 *
 * POST /api/wallpaper — Upload a new wallpaper image (PNG/JPG/WebP)
 * GET  /api/wallpaper — Get current wallpaper info
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const WALLPAPER_DIR = path.join(process.cwd(), 'public', 'bg')
const WALLPAPER_PATH = path.join(WALLPAPER_DIR, 'wallpaper_user.png')
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/jpg']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('wallpaper') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, WebP` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB` },
        { status: 400 }
      )
    }

    // Ensure directory exists
    if (!existsSync(WALLPAPER_DIR)) {
      await mkdir(WALLPAPER_DIR, { recursive: true })
    }

    // Remove old wallpaper files
    const oldFiles = ['wallpaper_user.png', 'wallpaper_user.jpg', 'wallpaper_user.webp']
    for (const f of oldFiles) {
      const oldPath = path.join(WALLPAPER_DIR, f)
      if (existsSync(oldPath)) {
        await unlink(oldPath)
      }
    }

    // Determine extension
    const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg'
    const savePath = path.join(WALLPAPER_DIR, `wallpaper_user${ext}`)

    // Write file
    const arrayBuffer = await file.arrayBuffer()
    await writeFile(savePath, Buffer.from(arrayBuffer))

    console.log(`[Wallpaper] Saved new wallpaper: ${savePath} (${(arrayBuffer.byteLength / 1024).toFixed(0)}KB)`)

    // Add cache-busting timestamp so the browser fetches the new image
    const url = `/bg/wallpaper_user${ext}?t=${Date.now()}`

    return NextResponse.json({
      success: true,
      url,
      size: arrayBuffer.byteLength,
      type: file.type,
    })
  } catch (error) {
    console.error('[Wallpaper] Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Check if user wallpaper exists
    const extensions = ['.png', '.jpg', '.webp']
    for (const ext of extensions) {
      const filePath = path.join(WALLPAPER_DIR, `wallpaper_user${ext}`)
      if (existsSync(filePath)) {
        return NextResponse.json({
          exists: true,
          url: `/bg/wallpaper_user${ext}?t=${Date.now()}`,
        })
      }
    }

    // Check for AI-generated wallpaper
    if (existsSync(path.join(WALLPAPER_DIR, 'wallpaper_tmp.png'))) {
      return NextResponse.json({
        exists: true,
        url: `/bg/wallpaper_tmp.png?t=${Date.now()}`,
      })
    }

    return NextResponse.json({ exists: false, url: null })
  } catch (error) {
    return NextResponse.json({ exists: false, url: null })
  }
}
