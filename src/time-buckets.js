'use strict';
// What a stretch of play went on, by what the bot was doing (note 2080):
// one bucket per moment, the first that holds. Shared by the run's own
// per-rung tally (stillness.js noteTrail, said on the strategy's rungs) and
// scripts/trials/time-lost.js over the flight records.
const WAITING = /^(wait_in_shelter|wait_in_pocket_not_night|wait_for_dawn|sleep|sleep_in_bed|sleeping|hold_pocket|wait_out|seal_and_wait|until_day|await_)/;
// Work that stands still where it is done: not stuck for staying put.
const STILL_WORK = /^(smelt|craft|eat|cook|fill_bucket|cast_portal|place|hold_|shield|fight|corner|cap_|pillar|bunker|seal|low_ceiling|stance|defend|swing|block_creeper|enchant|trade|sleep|loot|stock_stash|take_|chest)/;
const STUCK_STEP = /^(detour|work_free|unstuck|recover_|stillness|differently|relocate)/;
const TRAVEL = /^(walk|go_to|cross|return_to|reach_|find_|explore|search_|swim|boat|to_lava|approach|fortress_leg|leg_|ascend|descend|climb|dig_to_|travel|head_|back_to|corpse_run|bridge|span|staircase|surface|follow|path|toward|nether_gather|scout)/;
const FIGHT = /^(escape|encounter|retreat|run_from|hunt|stalk|kill|attack|off_|leave_lava|swim_to|straight_up|creeper|shot|dig_down_to_them|out_of)/;
const WORK = /^(mine|night_mine|tunnel|dig|gather|collect|chop|wood|harvest|acquire|smelt|craft|cook|trade|fish|food|shear|bake|brew|plant|farm|strip|wool|stock|obsidian)/;
const BUCKETS = ['work', 'travel', 'fight', 'waiting', 'stuck', 'other'];
// How each is said beside a rung.
const WORDS = { work: 'at the work itself (mining, tunnelling, smelting, crafting)', travel: 'on walks, climbs and searches', fight: 'on mobs', waiting: 'waiting (nights, dawns, pockets)', stuck: 'stuck in one place (within 3 blocks for a minute and a half, or working free of a stall)', other: 'on the rest (between steps, eating, the portal)' };
// Stuck: within this of where it stood this long before.
const STUCK_BLOCKS = 3, STUCK_MS = 90000;

function bucketOf(doing, stuck = false) {
  const d = String(doing || 'between_steps');
  // A detour by what was chosen for it (note 2104): mining near by or a
  // night mine is work, the wait for a rest to end is waiting; the rest of
  // a stall's ways (look around, differently, work free) stay stuck. Every
  // detour was stuck: full-6 (2026-10-25 13:40 to 16:04Z) counted 21 minutes
  // stuck of which 17 were the night mine it chose.
  const detour = /^detour:(.+)$/.exec(d);
  if (detour) {
    // The wait Jev chose inside a held rest (wait_it_out, note 2130) is waiting too (note 2156): time-lost
    // read full-1's seven minutes of it (2026-10-26 05:10-05:45Z) as 'stuck 26%'.
    if (detour[1] === 'until_rest_ends' || detour[1] === 'wait_it_out') return 'waiting';
    const b = bucketOf(detour[1], stuck);
    return b === 'other' ? 'stuck' : b;
  }
  if (WAITING.test(d)) return 'waiting';
  if (STUCK_STEP.test(d)) return 'stuck';
  if (stuck && !STILL_WORK.test(d)) return 'stuck';
  if (TRAVEL.test(d)) return 'travel';
  if (FIGHT.test(d)) return 'fight';
  if (WORK.test(d)) return 'work';
  return 'other';
}

// A rung's tally said: "about 34 minutes of play: 12 at the work itself ...".
function bucketsSays(tally) {
  if (!tally) return '';
  const total = BUCKETS.reduce((n, b) => n + (tally[b] || 0), 0);
  if (total < 120000) return '';
  const parts = BUCKETS.filter(b => (tally[b] || 0) >= 60000).sort((a, b) => tally[b] - tally[a]).map(b => `${Math.round(tally[b] / 60000)} ${WORDS[b]}`);
  return parts.length ? ` Of its ${Math.round(total / 60000)} minutes of play so far: ${parts.join('; ')}.` : '';
}

module.exports = { bucketOf, bucketsSays, BUCKETS, WORDS, STUCK_BLOCKS, STUCK_MS };
