import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = new URL('../dist/cyberwarmachine/desktop/plugin.js', import.meta.url)

test('shipped module registers exactly one native theme; unrelated and terminal skin names cannot mount its scenery', () => {
  const emitted = readFileSync(source, 'utf8')
  assert.deepEqual(emitted.match(/^import .*$/gm), ["import { THEMES_AREA } from '@hermes/plugin-sdk'"])
  const root = { dataset: { hermesTheme: 'cyberwarmachine-cli' } }
  let disconnected = false
  const observer = class {
    observe(node, options) { assert.equal(node, root); assert.ok(options.attributeFilter.includes('data-hermes-theme')) }
    disconnect() { disconnected = true }
  }
  const entries = [], disposers = []
  const plugin = vm.runInNewContext(emitted.replace(/^import .*$/m, '').replace('export default', 'plugin ='), {
    THEMES_AREA: 'native-theme-area', document: { documentElement: root }, MutationObserver: observer,
    cancelAnimationFrame() {}, plugin: null
  })
  assert.equal(plugin.id, 'cyberwarmachine')
  plugin.register({ register: entry => entries.push(entry), onDispose: fn => disposers.push(fn) })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].area, 'native-theme-area')
  assert.equal(entries[0].data.label, 'CyberWarMachine')
  assert.equal(entries[0].data.name, plugin.id)
  assert.notEqual(entries[0].data.colors.background, entries[0].data.darkColors.background)
  assert.match(entries[0].data.typography.fontUrl, /^data:text\/css/)
  assert.equal(disposers.length, 1)
  disposers[0]()
  assert.ok(disconnected)
})
