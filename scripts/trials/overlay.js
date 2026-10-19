'use strict';
// A live overlay of Jev's decisions for a watching player (note 1913; the
// user, 2026-10-19: "is there any way to overlay a live view of jev's
// decision making when spectating?"). Tails the port's current flight
// record and, for each decision, puts the question, the choice and its
// weight and the options not taken with theirs in the watcher's chat (tellraw), through the server's console pipe.
// The action bar was tried first and dropped: it fades in a second and
// fights the chat (the user, 2026-10-19). Only the watcher is touched; Jev gets nothing.
//   node scripts/trials/overlay.js <player name> <port>
//   (beside spectate.sh, which puts the same player in Spectator on Jev)
const fs = require('fs'), path = require('path');
const [name, portArg, ...flags] = process.argv.slice(2);
if (!name || !portArg) { console.error('usage: node scripts/trials/overlay.js <player name> <port> [--chase [back] [up]]'); process.exit(1); }
// --chase: a chase camera (the user, 2026-10-19: "Is there any option to spectate from a little farther back? I hit f5 but it's very zoomed in"). Locked on Jev the camera sits at its eyes and F5 only turns it; so the watcher is let go of Jev and, every half second, set behind and above it, looking at it: `execute at Jev run tp <name> ^ ^up ^-back facing entity Jev eyes`. A spectator passes through blocks, so the ground is no matter. Default 8 back, 4 up.
const chaseAt = flags.indexOf('--chase'), chase = chaseAt >= 0 ? { back: Number(flags[chaseAt + 1]) || 8, up: Number(flags[chaseAt + 2]) || 4 } : null;
// The servers live in the main checkout, whatever worktree this runs from.
const port = Number(portArg), ROOT = (() => { try { return path.resolve(require('child_process').execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), '..'); } catch (_) { return path.join(__dirname, '..', '..'); } })();
const server = path.join(ROOT, port === 25581 ? '.clean-run' : `.clean-run-${port}`);
const consolePath = path.join(server, 'console.in');
const worldOf = () => (fs.readFileSync(path.join(server, 'server.properties'), 'utf8').match(/^level-name=(.*)$/m) || [])[1];
const logOf = world => ['first-days', 'midgame'].map(k => path.join(ROOT, 'artifacts', `${k}-${world}.log`)).find(f => fs.existsSync(f));
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, ' ');
const send = line => { try { fs.appendFileSync(consolePath, line + '\n'); } catch (_) {} };
const chat = (text, color = 'gray') => send(`tellraw ${name} {"text":"${esc(text.slice(0, 480))}","color":"${color}"}`);
const words = k => String(k).replace(/_/g, ' ');

let lastChat = 0, lastKey = null;
function show(d) {
  const dec = d.decision, step = d.step || {};
  if (!dec || !dec.id) return;
  const key = `${dec.id}|${dec.at}`;
  if (key === lastKey) return; lastKey = key;
  const j = (dec.judgments || [])[0] || {}, p = j.probabilities || {};
  const picked = (dec.path || [])[0] || j.choice || '?';
  const now = Date.now();
  if (now - lastChat < 1200) return; lastChat = now;
  // The question, the choice and its weight in yellow; the options not taken with theirs in dark gray (the user, 2026-10-19: "we should also show briefly the options that weren't chosen"); the chosen option's words were shown too and dropped (the user, 2026-10-19: 'The rationale is overwhelming').
  const pct = k => p[k] != null ? ` ${Math.round(p[k] * 100)}%` : '';
  const noneGood = j.choice === 'none_good' ? ` (Jev: none good${pct('none_good')}, the least bad taken)` : '';
  chat(`[${(dec.at || '').slice(11, 19)}Z] ${words(dec.id)} -> ${words(picked).toUpperCase()}${pct(picked)}${noneGood}${step.action && step.action !== picked ? `  (step: ${words(step.action)})` : ''}`, 'yellow');
  const others = Object.keys(dec.options || {}).filter(k => k !== picked && k !== 'none_good').sort((a, b) => (p[b] || 0) - (p[a] || 0)).slice(0, 7).map(k => `${words(k)}${pct(k)}`);
  if (others.length) chat(`  not taken: ${others.join(' | ')}`, 'dark_gray');
}

let world = worldOf(), file = logOf(world), pos = file ? fs.statSync(file).size : 0, rest = '';
chat(`overlay on: ${world} (${file ? path.basename(file) : 'no log yet'})`, 'green');
console.log(`overlay for ${name} on ${port}: ${world} -> ${file}`);
// Command feedback off on this server (the user, 2026-10-19: every console command's echo filled the watcher's chat); the rule touches only those echoes, Jev running no commands.
send('gamerule send_command_feedback false');
// Yaw only (rotated ~ 0): with the pitch in it the camera swung over and under Jev whenever it looked up or down, which mining does all day; four moves a second.
if (chase) { send(`execute as ${name} run spectate`); setInterval(() => send(`execute at Jev rotated ~ 0 run tp ${name} ^ ^${chase.up} ^-${chase.back} facing entity Jev eyes`), 250); chat(`chase camera on: ${chase.back} back, ${chase.up} up (Shift frees you; rejoin to lock on again)`, 'green'); }
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
