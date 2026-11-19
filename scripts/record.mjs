import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

import { fileURLToPath } from 'node:url'
import { startPreview } from '../preview/server.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.CWM_PLAYWRIGHT || 'playwright')
const out = new URL(`../evidence/motion-${new Date().toISOString().replaceAll(':', '-')}/`, import.meta.url)
await mkdir(out, { recursive: true })
const preview = await startPreview()
let browser
try {
  browser = await chromium.launch({ executablePath: chromium.executablePath(), args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    recordVideo: { dir: fileURLToPath(out), size: { width: 1280, height: 800 } } })
  await context.route('**/*', route => new URL(route.request().url()).origin === preview.url ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto(preview.url)
  await page.locator('[data-cwm-stage]').waitFor()
  await page.waitForTimeout(600)
  await page.evaluate(() => history.pushState({}, '', '#/'))
  await page.waitForTimeout(4300)
  const video = page.video()
  await context.close()
  console.log(await video.path())
} finally {
  await browser?.close()
  await preview.close()
}
