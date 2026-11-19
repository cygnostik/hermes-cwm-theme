import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

import { startPreview } from '../preview/server.mjs'
import { colors, darkColors } from '../src/palette.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.CWM_PLAYWRIGHT || 'playwright')
const out = new URL(`../evidence/${new Date().toISOString().replaceAll(':', '-')}/`, import.meta.url)
await mkdir(out, { recursive: true })
const luminance = color => color.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
  .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0)
const contrasts = {}
for (const [mode, c] of Object.entries({ light: colors, dark: darkColors })) {
  contrasts[mode] = {}
  for (const [ink, paper] of [['foreground','background'],['foreground','sidebarBackground'],['cardForeground','card'],['mutedForeground','card'],['mutedForeground','muted'],['primaryForeground','primary'],['popoverForeground','popover'],['destructiveForeground','destructive']]) {
    const [lo, hi] = [luminance(c[ink]), luminance(c[paper])].sort((a,b) => a-b)
    const ratio = (hi + .05)/(lo + .05)
    contrasts[mode][`${ink}/${paper}`] = +ratio.toFixed(2)
    assert.ok(ratio >= 4.5, `${mode} ${ink}/${paper}: ${ratio}`)
  }
}
const app = await startPreview()
let browser
try {
  browser = await chromium.launch({ executablePath: chromium.executablePath(), args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errors = [], external = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === app.url) return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  await context.addInitScript(() => {
    const original = WebGLRenderingContext.prototype.drawArrays
    window.draws = 0
    window.hazePixel = 0
    WebGLRenderingContext.prototype.drawArrays = function (...args) {
      const called = original.apply(this, args)
      if (!this.canvas.matches('[data-cwm-haze]')) return called
      window.draws++
      const w = this.drawingBufferWidth, h = this.drawingBufferHeight
      const pixel = new Uint8Array(w * h * 4)
      this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixel)
      let max = 0, weighted = 0, total = 0
      for (let i = 3; i < pixel.length; i += 4) { const a = pixel[i]; max = Math.max(max, a); total += a; weighted += a * ((i >> 2) % w) }
      window.hazePixel = max
      window.hazeCentroid = weighted / (w * total)
      const art = this.canvas.previousElementSibling.getBoundingClientRect()
      const stage = this.canvas.getBoundingClientRect()
      const samples = [[.47,.14],[.58,.18],[.66,.12],[.46,.40],[.69,.28],[.70,.43],[.32,.42]]
      window.steel = samples.map(([x,y]) => {
        const col = Math.floor((art.x - stage.x + art.width * x) / stage.width * w)
        const row = Math.floor((1 - (art.y - stage.y + art.height * y) / stage.height) * h)
        const i = (row * w + col) * 4
        return [pixel[i + 2], pixel[i + 3]]
      })
      return called
    }
  })
  const track = p => {
    p.on('pageerror', error => errors.push(error.message))
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  }
  const page = await context.newPage(); track(page)
  const open = p => p.goto(`${app.url}/?test`)
  const stage = '[data-cwm-stage]', haze = '[data-cwm-haze]', scene = '[data-cwm-monument]'
  const shot = (p, file) => p.screenshot({ path: new URL(file, out).pathname, timeout: 10000 })
  const state = () => page.evaluate(() => ({ draws, hazePixel, hazeCentroid }))
  await open(page)
  await page.waitForFunction(() => window.hazePixel > 0)
  const font = await page.evaluate(async () => {
    const families = ['650 50px "Oxanium CWM"', '400 11px "Departure Mono CWM"']
    await Promise.all(families.map(f => document.fonts.load(f)))
    return [...document.fonts].map(f => [f.family, f.status])
  })
  assert.ok(font.some(([f, s]) => f.includes('Oxanium CWM') && s === 'loaded'))
  assert.ok(font.some(([f, s]) => f.includes('Departure Mono CWM') && s === 'loaded'))
  const art = await page.locator(scene).evaluate(async e => {
    const style = getComputedStyle(e)
    const image = new Image(); image.src = style.backgroundImage.slice(5, -2); await image.decode()
    return { dimensions: [image.naturalWidth, image.naturalHeight], width: e.clientWidth, pointerEvents: style.pointerEvents }
  })
  assert.deepEqual(art.dimensions, [806, 804]); assert.ok(art.width > 600); assert.equal(art.pointerEvents, 'none')
  const steel = () => page.evaluate(() => window.steel.slice(0, 3))
  const resting = await steel()
  await page.waitForTimeout(360)
  assert.deepEqual(await steel(), resting, 'steel stays still until New Chat')
  await page.evaluate(() => history.pushState({}, '', '#/'))
  await page.waitForFunction(previous => window.steel.slice(0, 3)
    .some(([blue, alpha], i) => alpha > 100 && blue - previous[i][0] >= 10), resting, { timeout: 3000 })
  const first = await state()
  await shot(page, 'dark.png')
  await page.waitForFunction(start => Math.abs(window.hazeCentroid - start) > .001, first.hazeCentroid)
  const later = await state()
  assert.ok(later.draws > first.draws)
  await shot(page, 'dark-later.png')
  await page.waitForFunction(previous => window.draws > 0 && JSON.stringify(window.steel.slice(0, 3)) === JSON.stringify(previous), resting)
  // Past the end, haze still runs but all the sampled upper faces stay at rest.
  await page.waitForTimeout(3000)
  assert.deepEqual(await steel(), resting)
  await page.evaluate(() => history.pushState({}, '', '#/settings'))
  await page.evaluate(() => history.back())
  await page.waitForFunction(() => location.hash === '#/')
  await page.waitForTimeout(800)
  assert.deepEqual(await steel(), resting, 'returning to a draft through history does not replay the sweep')

  // Native fresh sessions can have the intro splash disabled and the stock
  // statue enabled independently. Neither changes whether the transcript is empty.
  await page.locator('.intro').evaluate(e => {
    e.hidden = true; e.removeAttribute('data-slot')
    const status = document.createElement('span')
    status.dataset.fixtureStatus = ''
    status.setAttribute('role', 'status')
    document.querySelector('form').append(status)
  })
  await page.waitForTimeout(120)
  assert.equal(await page.locator(stage).evaluate(e => getComputedStyle(e).opacity), '1', 'empty native chat with no intro must show the full scene')
  assert.equal(await page.locator('[data-native-backdrop]').evaluate(e => getComputedStyle(e).display), 'none')
  assert.equal(await page.locator('[data-tree-group]').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)')
  const noIntro = await state()
  await page.waitForFunction(before => draws > before, noIntro.draws)
  await shot(page, 'empty-without-intro.png')
  await page.locator('[data-fixture-status]').evaluate(e => e.remove())
  await page.locator('[data-slot="aui_thread-viewport"]').evaluate(e => {
    const loading = document.createElement('div')
    loading.dataset.slot = 'aui_response-loading'
    e.append(loading)
  })
  assert.equal(await page.locator(stage).evaluate(e => getComputedStyle(e).opacity), '0.27')
  assert.equal(await page.locator(haze).evaluate(e => getComputedStyle(e).display), 'none')
  await page.locator('[data-slot="aui_response-loading"]').evaluate(e => e.remove())
  await page.locator('.intro').evaluate(e => { e.hidden = false; e.dataset.slot = 'aui_intro' })

  await page.getByRole('button', { name: 'Light mode' }).click()
  assert.equal(await page.locator('html').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(3, 8, 16)')
  await shot(page, 'light.png')
  await page.getByRole('button', { name: 'Sample chat' }).click()
  await page.waitForTimeout(160)
  const pausedChat = await state()
  await page.waitForTimeout(220)
  assert.equal((await state()).draws, pausedChat.draws)
  await shot(page, 'light-sample-chat.png')
  await page.getByRole('button', { name: 'Dark mode' }).click()
  await shot(page, 'dark-sample-chat.png')
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await page.waitForFunction(before => draws > before, pausedChat.draws)
  await page.waitForFunction(previous => window.steel.slice(0, 3)
    .some(([blue], i) => blue - previous[i][0] >= 10), resting, { timeout: 3000 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(160)
  const still = await state(); assert.ok(still.hazePixel > 0)
  assert.deepEqual(await steel(), resting, 'enabling reduced motion immediately settles the steel')
  await page.waitForTimeout(230)
  assert.deepEqual(await state(), still)
  await shot(page, 'reduced.png')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(before => draws > before, still.draws)
  await page.waitForTimeout(800)
  assert.deepEqual(await steel(), resting, 'disabling reduced motion does not replay the skipped sweep')

  const canLose = await page.locator(haze).evaluate(c => {
    const ext = c.getContext('webgl').getExtension('WEBGL_lose_context')
    if (!ext) return false
    c.addEventListener('webglcontextlost', () => { window.contextLost = true }, { once: true })
    window.contextExtension = ext; ext.loseContext(); return true
  })
  assert.equal(canLose, true)
  await page.waitForFunction(() => window.contextLost)
  const lost = await state(); await page.waitForTimeout(130)
  assert.equal((await state()).draws, lost.draws)
  assert.equal(await page.locator(scene).isVisible(), true)
  await page.evaluate(() => window.contextExtension.restoreContext())
  await page.waitForFunction(before => draws > before, lost.draws)

  await page.evaluate(() => cwmFixture.paint('cyberwarmachine-accent-345678'))
  assert.equal(await page.locator(stage).count(), 1)
  await page.evaluate(() => cwmFixture.paint('cyberwarmachine-cli'))
  await page.locator(stage).waitFor({ state: 'detached' })
  assert.equal(await page.locator('html').getAttribute('data-cwm-mounted'), null)
  assert.notEqual(await page.locator('[data-native-backdrop]').evaluate(e => getComputedStyle(e).display), 'none')
  await page.evaluate(() => cwmFixture.paint())
  await page.locator(stage).waitFor()
  await page.evaluate(() => cwmFixture.dispose())
  await page.locator(stage).waitFor({ state: 'detached' })
  await page.evaluate(() => { cwmFixture.paint('default'); cwmFixture.paint() })
  assert.equal(await page.locator(stage).count(), 0)

  const narrow = await context.newPage(); track(narrow)
  await narrow.setViewportSize({ width: 390, height: 760 }); await open(narrow)
  await narrow.locator(stage).waitFor()
  assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth), 390)
  await shot(narrow, 'narrow.png')
  const fallback = await context.newPage(); track(fallback)
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      return name === 'webgl' ? null : original.call(this, name, ...args)
    }
  })
  await open(fallback)
  await fallback.locator(scene).waitFor()
  assert.equal(await fallback.locator(haze).count(), 0)
  await shot(fallback, 'no-webgl.png')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  const receipt = { browser: browser.version(), viewport: [1440, 900], contrast: contrasts, fonts: font, haze: { first, later, reduced: still }, external, errors }
  await writeFile(new URL('verification.json', out), JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify(receipt, null, 2)); console.log(`Evidence: ${out.pathname}`)
} finally {
  await browser?.close()
  await app.close()
}
