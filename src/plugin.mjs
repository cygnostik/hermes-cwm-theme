// Borealis (MIT, Adolanium) informed the fixed scene / theme observer design.
// The CWM composition, shader, and runtime are separate from the original scene.
import { THEMES_AREA } from '@hermes/plugin-sdk'

const ID = 'cyberwarmachine'
const theme = {
  name: ID, label: 'CyberWarMachine',
  description: 'Cold-lit steel and drifting phosphor haze. A CyberWarMachine environment for Hermes.',
  ...__PALETTE__,
  typography: {
    fontSans: '"Oxanium CWM", system-ui, sans-serif',
    fontMono: '"Departure Mono CWM", ui-monospace, monospace',
    fontUrl: __FONT_URL__
  },
  customCSS: __CSS__
}
const FRAGMENT = __FRAGMENT__
const VERTEX = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
const FRAME_MS = 1000 / 24
const SWEEP_MS = 2800

function makeProgram(gl) {
  const shaders = []
  let program, buffer, okay = false
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type)
      if (!shader) return null
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
    }
    program = gl.createProgram()
    if (!program) return null
    for (const shader of shaders) gl.attachShader(program, shader)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    buffer = gl.createBuffer()
    if (!buffer) return null
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    okay = true
    return { program, buffer, size: gl.getUniformLocation(program, 'uSize'), time: gl.getUniformLocation(program, 'uTime'), art: gl.getUniformLocation(program, 'uArt'), sweep: gl.getUniformLocation(program, 'uSweep') }
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
    if (!okay) {
      if (program) gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
    }
  }
}

function makeStage() {
  const stage = document.createElement('div')
  stage.dataset.cwmStage = ''
  stage.setAttribute('aria-hidden', 'true')
  const art = document.createElement('div')
  art.dataset.cwmMonument = ''
  const canvas = document.createElement('canvas')
  canvas.dataset.cwmHaze = ''
  stage.append(art, canvas)
  document.body.prepend(stage)
  document.documentElement.dataset.cwmMounted = ''
  let gl
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false })
  } catch { /* No WebGL: keep the exact artwork and quiet background. */ }
  if (!gl) {
    canvas.remove()
    return () => stage.remove()
  }
  let gpu = makeProgram(gl)
  let raf = 0, last = null, elapsed = 0, deadline = 0, width = 0, height = 0
  let artFrame
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = motion.matches
  let pendingUntil = 0, sweepStart = null
  const visible = () => width > 0 && height > 0 && !document.hidden && gpu
  function clearSweep() { pendingUntil = 0; sweepStart = null }
  function paint(time, sweep = 1) {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(gpu.size, canvas.width, canvas.height)
    gl.uniform1f(gpu.time, time)
    gl.uniform1f(gpu.sweep, sweep)
    gl.uniform4fv(gpu.art, artFrame)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  function stop() {
    cancelAnimationFrame(raf)
    raf = 0
    last = null
    deadline = 0
  }
  function tick(now) {
    raf = 0
    if (!visible() || reduced) return
    if (last !== null) elapsed += Math.min(100, now - last)
    last = now
    if (now >= deadline) {
      deadline = deadline && now - deadline < FRAME_MS ? deadline + FRAME_MS : now + FRAME_MS
      if (pendingUntil) {
        if (now < pendingUntil) sweepStart = now
        pendingUntil = 0
      }
      const progress = sweepStart === null ? 1 : Math.min(1, (now - sweepStart) / SWEEP_MS)
      if (progress === 1) sweepStart = null
      paint(elapsed / 1000 + 9, progress)
    }
    raf = requestAnimationFrame(tick)
  }
  function sync() {
    stop()
    if (!visible()) {
      if (sweepStart !== null || document.hidden || !gpu) clearSweep()
      return
    }
    if (reduced) paint(elapsed / 1000 + 9)
    else raf = requestAnimationFrame(tick)
  }
  function resize() {
    width = canvas.clientWidth
    height = canvas.clientHeight
    if (width && height) {
      const bounds = art.getBoundingClientRect(), frame = canvas.getBoundingClientRect()
      artFrame = [(bounds.left - frame.left) / width, (bounds.top - frame.top) / height, bounds.width / width, bounds.height / height]
      const scale = Math.max(3, width / 680, height / 420)
      canvas.width = Math.ceil(width / scale)
      canvas.height = Math.ceil(height / scale)
    }
    sync()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  const changeMotion = event => { reduced = event.matches; if (reduced) clearSweep(); sync() }
  const lose = event => { event.preventDefault(); gpu = null; clearSweep(); stop() }
  const restore = () => { gpu = makeProgram(gl); resize() }
  // Desktop's explicit workspace New Chat pushes a fresh #/ history entry,
  // even from #/ itself. Back/forward, startup restores, and repaint are not new chats.
  const navigation = window.navigation
  const changeEntry = event => {
    clearSweep()
    if (event.navigationType !== 'push' || location.hash !== '#/' || reduced || document.hidden || !gpu) return
    // The workspace may still be swapping the outgoing transcript when the route lands.
    pendingUntil = performance.now() + 1000
  }
  canvas.addEventListener('webglcontextlost', lose)
  canvas.addEventListener('webglcontextrestored', restore)
  motion.addEventListener('change', changeMotion)
  document.addEventListener('visibilitychange', sync)
  navigation?.addEventListener('currententrychange', changeEntry)
  resize()
  return () => {
    stop()
    observer.disconnect()
    canvas.removeEventListener('webglcontextlost', lose)
    canvas.removeEventListener('webglcontextrestored', restore)
    motion.removeEventListener('change', changeMotion)
    document.removeEventListener('visibilitychange', sync)
    navigation?.removeEventListener('currententrychange', changeEntry)
    if (gpu) { gl.deleteBuffer(gpu.buffer); gl.deleteProgram(gpu.program) }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    stage.remove()
  }
}

const owns = name => name === ID || /^cyberwarmachine-accent-[0-9a-f]{6}$/i.test(name)
function observeTheme() {
  const root = document.documentElement
  let disposeStage
  const unmount = () => {
    disposeStage?.()
    disposeStage = undefined
    delete root.dataset.cwmMounted
  }
  const sync = () => {
    if (owns(root.dataset.hermesTheme ?? '')) disposeStage ??= makeStage()
    else if (disposeStage) unmount()
  }
  const observer = new MutationObserver(sync)
  observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  sync()
  return () => { observer.disconnect(); if (disposeStage) unmount() }
}

export default {
  id: ID, name: 'CyberWarMachine', defaultEnabled: false,
  register(ctx) {
    ctx.register({ id: ID, area: THEMES_AREA, data: theme })
    ctx.onDispose(observeTheme())
  }
}
