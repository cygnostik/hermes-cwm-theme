import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const responses = new Map([
  ['/', [new URL('./index.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/preview.mjs', [new URL('./preview.mjs', import.meta.url), 'text/javascript']],
  ['/plugin.js', [new URL('../dist/cyberwarmachine/desktop/plugin.js', import.meta.url), 'text/javascript']]
])
export async function startPreview(port = 0) {
  const data = new Map(await Promise.all([...responses].map(async ([route, [file, type]]) => [route, [await readFile(file), type]])))
  const server = createServer((req, res) => {
    const route = new URL(req.url, 'http://127.0.0.1').pathname
    if (route === '/sdk.mjs') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      return res.end("export const THEMES_AREA = 'themes';")
    }
    if (route === '/favicon.ico') return res.writeHead(204).end()
    const found = data.get(route)
    if (!found) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': found[1], 'Cache-Control': 'no-store' })
    return res.end(found[0])
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startPreview(Number(process.env.CWM_PREVIEW_PORT ?? 0))
  console.log(server.url)
}
