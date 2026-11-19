import { mkdir, readFile, copyFile, writeFile, rename } from 'node:fs/promises'
import * as palette from '../src/palette.mjs'

const url = name => new URL(`../${name}`, import.meta.url)
const text = name => readFile(url(name), 'utf8')
const data = async (name, mime) => `data:${mime};base64,${(await readFile(url(name))).toString('base64')}`
const [mark, oxanium, departure, css, shader, source] = await Promise.all([
  data('src/assets/battle-worn-monument.webp', 'image/webp'),
  data('src/assets/Oxanium-wght.woff2', 'font/woff2'),
  data('src/assets/DepartureMono-Regular.woff2', 'font/woff2'),
  text('src/theme.css'), text('src/haze.glsl'), text('src/plugin.mjs')
])
const scope = ':root:is([data-hermes-theme="cyberwarmachine"], [data-hermes-theme^="cyberwarmachine-accent-"])'
const workspace = '[data-chat-surface][data-session-anchor="workspace"]'
const transcript = `${workspace} [data-slot="aui_thread-viewport"]`
const occupied = [
  `${transcript} :is([data-slot="aui_message-group"], [data-slot="aui_user-message-root"], [data-slot="aui_assistant-message-root"], [data-slot="aui_system-message-root"], [data-slot="aui_response-loading"], [data-slot="aui_background-resume"], [data-slot="aui_turn-activity"][data-state="active"])`,
  `${workspace} [data-slot="thread"] > [role="status"]`
].join(', ')
const emptyChat = `:has(${transcript}):not(:has(${occupied}))`
const fontCSS = `@font-face{font-family:"Oxanium CWM";src:url(${oxanium}) format("woff2");font-weight:200 800;font-display:swap}@font-face{font-family:"Departure Mono CWM";src:url(${departure}) format("woff2");font-weight:400;font-display:swap}`
const parts = {
  PALETTE: JSON.stringify(palette),
  FONT_URL: JSON.stringify(`data:text/css;base64,${Buffer.from(fontCSS).toString('base64')}`),
  CSS: JSON.stringify(css.replaceAll('__THEME_SCOPE__', scope).replaceAll('__EMPTY_CHAT__', emptyChat).replace('__MONUMENT__', mark)),
  FRAGMENT: JSON.stringify(shader)
}
const result = source.replace(/__(PALETTE|FONT_URL|CSS|FRAGMENT)__/g, (_, key) => parts[key])
const dest = 'dist/cyberwarmachine'
await mkdir(url(`${dest}/desktop/`), { recursive: true })
await mkdir(url(`${dest}/licenses/`), { recursive: true })
await copyFile(url('plugin.yaml'), url(`${dest}/plugin.yaml`))
for (const name of ['Borealis-MIT.txt', 'DepartureMono-LICENSE.txt', 'Oxanium-OFL.txt']) {
  await copyFile(url(`licenses/${name}`), url(`${dest}/licenses/${name}`))
}
const tmp = url(`${dest}/desktop/plugin-${process.pid}.tmp`)
await writeFile(tmp, result, { flag: 'wx' })
await rename(tmp, url(`${dest}/desktop/plugin.js`))
console.log(`Built ${dest}/desktop/plugin.js (${Buffer.byteLength(result)} bytes; no runtime dependencies)`)
