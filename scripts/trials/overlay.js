'use strict';
// A live overlay of Jev's decisions for a watching player (note 1913; the
// user, 2026-10-19: "is there any way to overlay a live view of jev's
// decision making when spectating?"). Tails the port's current flight
// record and, for each decision, puts the question, the choice and Jev's
// weights on the watcher's action bar (title ... actionbar) and the chosen
// option's own words in the watcher's chat (tellraw), through the server's
// console pipe. Only the watcher is touched; Jev gets nothing.
//   node scripts/trials/overlay.js <player name> <port>
//   (beside spectate.sh, which puts the same player in Spectator on Jev)
const fs = require('fs'), path = require('path');
const [name, portArg] = process.argv.slice(2);
if (!name || !portArg) { console.error('usage: node scripts/trials/overlay.js <player name> <port>'); process.exit(1); }
// The servers live in the main checkout, whatever worktree this runs from.
const port = Number(portArg), ROOT = (() => { try { return path.resolve(require('child_process').execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), '..'); } catch (_) { return path.join(__dirname, '..', '..'); } })();
const server = path.join(ROOT, port === 25581 ? '.clean-run' : `.clean-run-${port}`);
const consolePath = path.join(server, 'console.in');
const worldOf = () => (fs.readFileSync(path.join(server, 'server.properties'), 'utf8').match(/^level-name=(.*)$/m) || [])[1];
const logOf = world => ['first-days', 'midgame'].map(k => path.join(ROOT, 'artifacts', `${k}-${world}.log`)).find(f => fs.existsSync(f));
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, ' ');
const send = line => { try { fs.appendFileSync(consolePath, line + '\n'); } catch (_) {} };
const actionbar = text => send(`title ${name} actionbar {"text":"${esc(text.slice(0, 120))}"}`);
const chat = (text, color = 'gray') => send(`tellraw ${name} {"text":"${esc(text.slice(0, 480))}","color":"${color}"}`);
const words = k => String(k).replace(/_/g, ' ');

let lastChat = 0, lastKey = null;
function show(d) {
  const dec = d.decision, step = d.step || {};
  if (!dec || !dec.id) return;
  const j = (dec.judgments || [])[0] || {}, p = j.probabilities || {};
  const picked = (dec.path || [])[0] || j.choice || '?';
  const top = Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${words(k)} ${Math.round(v * 100)}`).join(' | ');
  const health = dec.state?.health, food = dec.state?.food;
  const bar = `${words(dec.id)}: ${words(picked).toUpperCase()}   [${top}]${health != null ? `   hp ${Math.round(health * 10) / 10} food ${food ?? '?'}` : ''}`;
  const key = `${dec.id}|${picked}|${dec.at}`;
  if (key === lastKey) return; lastKey = key;
  actionbar(bar);
  const now = Date.now();
  if (now - lastChat < 1500) return; lastChat = now;
  const opt = dec.options?.[picked];
  const text = opt == null ? '' : typeof opt === 'string' ? opt : typeof opt.description === 'string' ? opt.description : opt.description?.action || opt.description?.does || JSON.stringify(opt.description || opt).slice(0, 300);
  const noneGood = j.choice === 'none_good' ? ` (Jev: none good ${Math.round((p.none_good || 0) * 100)}%; the least bad taken)` : '';
  chat(`[${(dec.at || '').slice(11, 19)}Z] ${words(dec.id)} -> ${words(picked)}${noneGood}${step.action ? `  (step: ${words(step.action)})` : ''}`, 'yellow');
  if (text) chat(`  ${text}`, 'gray');
}

let world = worldOf(), file = logOf(world), pos = file ? fs.statSync(file).size : 0, rest = '';
chat(`overlay on: ${world} (${file ? path.basename(file) : 'no log yet'})`, 'green');
console.log(`overlay for ${name} on ${port}: ${world} -> ${file}`);
setInterval(() => {
  try {
    const w = worldOf();
    if (w !== world || !file) { world = w; file = logOf(w); pos = file ? fs.statSync(file).size : 0; rest = ''; if (file) chat(`overlay: now ${world}`, 'green'); return; }
    const size = fs.statSync(file).size;
    if (size < pos) { pos = 0; rest = ''; }
    if (size === pos) return;
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(Math.min(size - pos, 4 * 1024 * 1024));
    fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd); pos += buf.length;
    const chunk = rest + buf.toString('utf8'), lines = chunk.split('\n'); rest = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('{')) continue;
      let d; try { d = JSON.parse(line); } catch (_) { continue; }
      if (d.death) { chat(`JEV DIED at ${JSON.stringify(d.death.position)} in ${d.death.dimension}`, 'red'); continue; }
      show(d);
    }
  } catch (err) { /* the log rotates; try again */ }
}, 400);
