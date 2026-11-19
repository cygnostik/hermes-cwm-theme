import plugin from '/plugin.js'

const root = document.documentElement
const style = document.head.appendChild(document.createElement('style'))
const disposers = []
let theme, active = true, dark = true
plugin.register({ register: ({ data }) => { theme = data }, onDispose: fn => disposers.push(fn) })
const font = document.head.appendChild(document.createElement('link'))
font.rel = 'stylesheet'
font.href = theme.typography.fontUrl
const appearance = document.querySelector('#appearance')
const sample = document.querySelector('#sample')
const themeButton = document.querySelector('#theme')
const intro = document.querySelector('.intro')
const conversation = document.querySelector('.conversation')
const slot = 'data-slot'
function paint(name = active ? theme.name : 'preview-default') {
  root.dataset.hermesTheme = name
  root.classList.toggle('dark', dark)
  const c = dark ? theme.darkColors : theme.colors
  for (const [key, value] of Object.entries({
    '--theme-foreground': c.foreground, '--theme-primary': c.primary, '--theme-background-seed': c.background,
    '--theme-sidebar-seed': c.sidebarBackground, '--theme-card-seed': c.card, '--theme-midground': c.midground,
    '--dt-primary-foreground': c.primaryForeground, '--fixture-border': c.border, '--fixture-muted': c.mutedForeground,
    '--dt-font-sans': theme.typography.fontSans, '--dt-font-mono': theme.typography.fontMono
  })) root.style.setProperty(key, value)
  style.textContent = active ? theme.customCSS : ''
  appearance.textContent = dark ? 'Light mode' : 'Dark mode'
  themeButton.textContent = active ? 'Theme on' : 'Theme off'
  themeButton.setAttribute('aria-pressed', String(active))
  document.querySelector('#state').textContent = active ? 'CYBERWARMACHINE' : 'PREVIEW DEFAULT'
}
appearance.addEventListener('click', () => { dark = !dark; paint() })
themeButton.addEventListener('click', () => { active = !active; paint() })
sample.addEventListener('click', () => {
  intro.hidden = !intro.hidden
  if (intro.hidden) intro.removeAttribute(slot); else intro.setAttribute(slot, 'aui_intro')
  conversation.hidden = !intro.hidden
  if (conversation.hidden) conversation.removeAttribute(slot)
  else conversation.setAttribute(slot, 'aui_message-group')
  history.pushState({}, '', intro.hidden ? '#/session/fixture' : '#/')
  sample.textContent = intro.hidden ? 'New session' : 'Sample chat'
})
document.querySelector('form').addEventListener('submit', event => event.preventDefault())
paint()
if (new URLSearchParams(location.search).has('test')) {
  window.cwmFixture = { paint, dispose: () => disposers.splice(0).forEach(fn => fn()) }
}
