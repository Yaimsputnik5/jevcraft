'use strict';
// The pace of this bot's own runs from mobs, measured (note 2162): the run_from
// option said 'the bot sprints about 5.6 blocks a second' and priced each
// mob against that, but the walk away goes by the pathfinder's route through
// trees, rock and the dark. Over the six full runs (2026-10-25 18:00Z to
// 10-26 06:40Z) the body moved a median 2.9 blocks a second in the four
// seconds after a run_from pick, a third of the 156 runs under 2: slower than
// a zombie (2.3) a third of the time. Of the day's 54 deaths, 13 came within
// seconds of run_from or retreat, zombies at the bot's back the whole minute.
// Each run's first four seconds are measured here and said at the next ask.
const FLEET = Object.freeze({ from: '2026-10-25 18:00Z', to: '2026-10-26 06:40Z', runs: 156, median: 2.9, quarter: 1.5 });
const SPRINT = 5.6, WATCH_MS = 4000, KEEP = 20;

function note(state, { blocks, seconds, mob, now = Date.now() }) {
  if (!state || !(seconds > 0.5)) return;
  const bps = Math.round(blocks / seconds * 10) / 10;
  state.runPaces = [...(state.runPaces || []), { at: now, bps, mob }].slice(-KEEP);
}
// Four seconds after a run begins, where the body has got to from where it began; a body gone farther than any run
// takes it (a death and its respawn) is not counted.
function watch(survival, bot, from, mob, save) {
  const t0 = Date.now();
  setTimeout(() => {
    try {
      const p = bot.entity?.position;
      if (!p || !(bot.health > 0) || !from) return;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d > 30) return;
      note(survival.state, { blocks: d, seconds: (Date.now() - t0) / 1000, mob });
      save?.();
    } catch (_) { /* the record is not the run */ }
  }, WATCH_MS);
}
// The bot's own pace from its runs so far, three or more of them: median, lower quarter, count.
function paceOf(state) {
  const runs = (state?.runPaces || []).map(r => r.bps).sort((a, b) => a - b);
  if (runs.length < 3) return null;
  return { runs: runs.length, median: runs[Math.floor(runs.length / 2)], quarter: runs[Math.floor(runs.length / 4)] };
}
// The run's pace to price a chase by: the bot's own where it has one, the fleet's record where not.
const runPace = pace => pace?.median ?? FLEET.median;
function says(pace) {
  if (pace) return `a sprint on open ground is ${SPRINT} blocks a second; this bot's own last ${pace.runs} runs from mobs made a median ${pace.median} blocks a second over their first four seconds, a quarter of them under ${pace.quarter}`;
  return `a sprint on open ground is ${SPRINT} blocks a second; on the six full runs (${FLEET.from} to ${FLEET.to}) ${FLEET.runs} runs from mobs made a median ${FLEET.median} blocks a second over their first four seconds, a quarter under ${FLEET.quarter}: the walk's route through trees, rock and the dark is not the sprint`;
}

module.exports = { note, watch, paceOf, runPace, says, FLEET, SPRINT, WATCH_MS };
