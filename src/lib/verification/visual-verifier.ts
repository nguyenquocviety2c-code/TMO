/**
 * Layer 4.3: Visual Verification
 *
 * Kiểm tra UI hiển thị đúng:
 *   - Render Check: Page có hiển thị không?
 *   - Layout Check: Responsive đúng?
 *   - Interaction Check: Button click hoạt động? Form submit?
 *   - Error Check: Console errors?
 *
 * Note: Sử dụng Playwright nếu có, nếu không thì dùng fetch đơn giản.
 */

import type {
  VerificationResult,
  VerificationError,
  VisualVerifyOptions,
  VisualAction,
} from './types'

// ==================== CONSTANTS ====================

const DEFAULT_TIMEOUT = 45_000 // 45s
const DEV_SERVER_URL = 'http://localhost:3000'

// ==================== MAIN ORCHESTRATOR ====================

/**
 * Chạy toàn bộ visual verification.
 *
 * @param options - Cấu hình từng loại check
 * @returns VerificationResult với errors
 */
export async function runVisualVerification(
  options: VisualVerifyOptions = {}
): Promise<VerificationResult> {
  const startTime = Date.now()
  const {
    checkRender = true,
    checkLayout = false,
    checkInteraction = false,
    checkConsoleErrors = true,
    urls = [DEV_SERVER_URL],
    timeout = DEFAULT_TIMEOUT,
  } = options

  const errors: VerificationError[] = []
  const checkResults: string[] = []

  try {
    // Kiểm tra xem có Playwright không
    const hasPlaywright = await checkPlaywrightAvailable()

    for (const url of urls) {
      // 1. Render Check
      if (checkRender) {
        if (hasPlaywright) {
          const renderErrors = await checkPageRenderWithPlaywright(url, timeout)
          errors.push(...renderErrors)
        } else {
          const renderErrors = await checkPageRenderWithFetch(url, timeout)
          errors.push(...renderErrors)
        }
        checkResults.push(`Render (${url}): checked`)
      }

      // 2. Layout Check
      if (checkLayout && hasPlaywright) {
        const layoutErrors = await checkLayoutResponsive(url, timeout)
        errors.push(...layoutErrors)
        checkResults.push(`Layout (${url}): checked`)
      }

      // 3. Interaction Check
      if (checkInteraction && hasPlaywright) {
        const interactionErrors = await checkInteractions(url, timeout)
        errors.push(...interactionErrors)
        checkResults.push(`Interaction (${url}): checked`)
      }

      // 4. Console Error Check
      if (checkConsoleErrors && hasPlaywright) {
        const consoleErrors = await checkConsoleErrorsWithPlaywright(url, timeout)
        errors.push(...consoleErrors)
        checkResults.push(`Console (${url}): checked`)
      }
    }

    // Nếu không có Playwright và cần check nâng cao → warning
    if (!hasPlaywright && (checkLayout || checkInteraction || checkConsoleErrors)) {
      errors.push({
        type: 'render',
        severity: 'low',
        message: 'Playwright not available. Advanced visual checks (layout, interaction, console) skipped. Install playwright for full visual verification.',
        suggestion: 'Run: bun add -d playwright',
      })
    }

    const duration = Date.now() - startTime
    const passed = errors.filter((e) => e.severity !== 'low').length === 0

    return {
      verifier: 'visual',
      passed,
      errors,
      warnings: [],
      duration,
      summary: `Visual verification: ${passed ? 'PASSED' : 'FAILED'} (${errors.length} errors). ${checkResults.join(', ')}`,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      verifier: 'visual',
      passed: false,
      errors: [
        {
          type: 'render',
          severity: 'critical',
          message: `Visual verification failed with exception: ${errorMsg}`,
          suggestion: 'Check if dev server is running and browser is available',
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
      summary: `Visual verification: FAILED (exception: ${errorMsg})`,
    }
  }
}

// ==================== PLAYWRIGHT CHECK ====================

/**
 * Kiểm tra xem Playwright có available không.
 * Kiểm tra cả package install và browser binaries.
 */
async function checkPlaywrightAvailable(): Promise<boolean> {
  try {
    // Thử dynamic import
    const playwright = await import('playwright')
    
    // Kiểm tra browser binaries có được install chưa
    const chromium = playwright.chromium
    if (!chromium) {
      console.warn('Playwright chromium not available')
      return false
    }
    
    // Thử launch browser để verify binary tồn tại
    try {
      const browser = await chromium.launch({ headless: true })
      await browser.close()
      return true
    } catch (launchErr) {
      console.warn('Playwright browser launch failed:', launchErr instanceof Error ? launchErr.message : String(launchErr))
      return false
    }
  } catch {
    return false
  }
}

// ==================== RENDER CHECK ====================

/**
 * Kiểm tra page render với Playwright.
 */
async function checkPageRenderWithPlaywright(
  url: string,
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })

      // Kiểm tra page không trắng
      const bodyText = await page.evaluate(() => document.body.innerText)
      if (!bodyText || bodyText.trim().length === 0) {
        errors.push({
          type: 'render',
          severity: 'high',
          message: `Page at ${url} rendered empty (white page)`,
          suggestion: 'Check for hydration errors or runtime exceptions',
        })
      }

      // Kiểm tra không có error boundary
      const errorBoundary = await page.$eval('body', (el) => el.textContent?.includes('Application error') || false)
      if (errorBoundary) {
        errors.push({
          type: 'render',
          severity: 'high',
          message: `Error boundary detected at ${url}`,
          suggestion: 'Check for unhandled exceptions in React components',
        })
      }
    } finally {
      await browser.close()
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'render',
      severity: 'high',
      message: `Render check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check if page is accessible and dev server is running',
    })
    return errors
  }
}

/**
 * Kiểm tra page render với fetch (đơn giản, không cần browser).
 */
async function checkPageRenderWithFetch(
  url: string,
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      errors.push({
        type: 'render',
        severity: 'high',
        message: `Page at ${url} returned status ${response.status}`,
        suggestion: 'Check if route exists and server is running',
      })
      return errors
    }

    const html = await response.text()

    // Kiểm tra HTML không rỗng
    if (!html || html.trim().length < 100) {
      errors.push({
        type: 'render',
        severity: 'high',
        message: `Page at ${url} returned very short HTML (${html?.length || 0} chars)`,
        suggestion: 'Check for SSR errors or empty page content',
      })
    }

    // Kiểm tra không có error text trong HTML
    if (html.includes('Application error') || html.includes('Internal Server Error')) {
      errors.push({
        type: 'render',
        severity: 'high',
        message: `Error text found in HTML at ${url}`,
        suggestion: 'Check server-side rendering and API routes',
      })
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'render',
      severity: 'high',
      message: `Fetch render check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check network connectivity and dev server status',
    })
    return errors
  }
}

// ==================== LAYOUT CHECK ====================

/**
 * Kiểm tra responsive layout với Playwright.
 */
async function checkLayoutResponsive(
  url: string,
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    try {
      // Mobile viewport
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(url, { waitUntil: 'networkidle', timeout })

      const mobileOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })

      if (mobileOverflow) {
        errors.push({
          type: 'layout',
          severity: 'medium',
          message: `Horizontal overflow detected on mobile at ${url}`,
          suggestion: 'Check CSS for fixed widths or overflow issues',
        })
      }

      // Desktop viewport
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(url, { waitUntil: 'networkidle', timeout })

      const desktopOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })

      if (desktopOverflow) {
        errors.push({
          type: 'layout',
          severity: 'medium',
          message: `Horizontal overflow detected on desktop at ${url}`,
          suggestion: 'Check CSS for fixed widths or overflow issues',
        })
      }
    } finally {
      await browser.close()
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'layout',
      severity: 'medium',
      message: `Layout check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check Playwright installation and browser availability',
    })
    return errors
  }
}

// ==================== INTERACTION CHECK ====================

/**
 * Kiểm tra interactions với Playwright.
 */
async function checkInteractions(
  url: string,
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })

      // Kiểm tra các button có clickable không
      const buttons = await page.$$('button')
      for (let i = 0; i < Math.min(buttons.length, 5); i++) {
        const button = buttons[i]
        const isVisible = await button.isVisible().catch(() => false)
        if (!isVisible) {
          errors.push({
            type: 'interaction',
            severity: 'low',
            message: `Button ${i + 1} is not visible at ${url}`,
            suggestion: 'Check CSS visibility or conditional rendering',
          })
        }
      }

      // Kiểm tra form submit (nếu có)
      const forms = await page.$$('form')
      if (forms.length > 0) {
        const form = forms[0]
        const submitButton = await form.$('button[type="submit"]')
        if (!submitButton) {
          errors.push({
            type: 'interaction',
            severity: 'low',
            message: `Form without submit button found at ${url}`,
            suggestion: 'Add a submit button to the form',
          })
        }
      }
    } finally {
      await browser.close()
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'interaction',
      severity: 'medium',
      message: `Interaction check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check Playwright installation and page accessibility',
    })
    return errors
  }
}

// ==================== CONSOLE ERROR CHECK ====================

/**
 * Kiểm tra console errors với Playwright.
 */
async function checkConsoleErrorsWithPlaywright(
  url: string,
  timeout: number
): Promise<VerificationError[]> {
  const errors: VerificationError[] = []
  const consoleMessages: string[] = []

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text())
      }
    })

    // Listen for page errors
    page.on('pageerror', (error) => {
      consoleMessages.push(error.message)
    })

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })

      // Đợi thêm 1s để capture async console errors
      await page.waitForTimeout(1000)
    } finally {
      await browser.close()
    }

    // Filter out known false positives
    const filteredMessages = consoleMessages.filter((msg) => {
      // Bỏ qua các warnings không quan trọng
      const falsePositives = [
        'Download the React DevTools',
        'webpack-internal:',
        'hot-update.json',
      ]
      return !falsePositives.some((fp) => msg.includes(fp))
    })

    for (const msg of filteredMessages) {
      errors.push({
        type: 'console',
        severity: 'medium',
        message: `Console error: ${msg.slice(0, 200)}`,
        suggestion: 'Check browser console for full error details',
      })
    }

    return errors
  } catch (err) {
    errors.push({
      type: 'console',
      severity: 'medium',
      message: `Console check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Check Playwright installation and page accessibility',
    })
    return errors
  }
}