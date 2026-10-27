const $ = id => document.getElementById(id), log = $('log'), main = $('main')
let s = {}
const paint = () => {
  $('open').hidden = !s.url
  if (!s.installed) { main.textContent = 'Install'; main.disabled = false; $('msg').textContent = s.nvidia ? 'First time: installs Python, PyTorch and the engine (several GB, a few minutes).' : 'No supported graphics chip was found (an NVIDIA card, or a Mac with Apple Silicon): the engine installs, but cannot make pictures on this computer yet.' }
  else if (s.running) { main.textContent = 'Stop'; main.disabled = false; $('msg').textContent = s.url ? 'Running. The page is open in your browser.' : 'Starting…' }
  else { main.textContent = 'Launch'; main.disabled = false; $('msg').textContent = 'Ready.' }
}
main.onclick = async () => { main.disabled = true; if (!s.installed) await window.phosphene.install(); else if (s.running) await window.phosphene.stop(); else await window.phosphene.launch() }
$('open').onclick = () => window.phosphene.open()
window.phosphene.onLog(l => { log.textContent += l + (l.endsWith('\n') ? '' : '\n'); log.scrollTop = log.scrollHeight })
window.phosphene.onStatus(x => { s = x; paint() })
window.phosphene.status().then(x => { s = x; paint() })
