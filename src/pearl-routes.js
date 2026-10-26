'use strict';
// Every way to ender pearls from where the bot stands, as answers to the
// stall's and the rung's questions while the pearls are the rung in hand.
//
// The ladder (game-progress.js) takes one route by rule: a barter when gold
// is carried and a piglin is in view, a bastion's gold, the warped forest
// (one known, or a sweep for one), and only when every one of those rests,
// home. When the route it took stalled, the stall's question offered ways
// to keep at that same route and nothing else. On 25600
// (mid-242-ae-nether-2-fortress-2, note 588) both warped forests known had
// walks that came no nearer, the sweep for a third turned on a ledge of its
// own stairs for ten minutes, and Jev answered none_good seven times,
// 0.45 to 0.75: the Overworld's endermen, the forests taken up again, and
// the rods it had set aside were not among the answers. Here each route
// that is real from here is an option, said with what it would meet; a
// route that is not (no gold to barter with) is said as not offered, and
// why, so a missing move is not a route that cannot be taken.
const { isSetAside, attemptsFor } = require('./progress');

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const minutesLeft = (until, now) => Math.max(1, Math.ceil((until - now) / 60000));
const count = (bot, name) => (bot.inventory?.items?.() || []).filter(i => i.name === name).reduce((n, i) => n + i.count, 0);
const inNether = bot => /nether/.test(String(bot.game?.dimension || ''));
const BLOCKS = /^(netherrack|cobblestone|cobbled_deepslate|blackstone|basalt|dirt|stone|deepslate|andesite|diorite|granite|tuff|soul_soil|end_stone|oak_planks|spruce_planks|birch_planks|jungle_planks|acacia_planks|dark_oak_planks|mangrove_planks|cherry_planks|crimson_planks|warped_planks|bamboo_planks|pale_oak_planks)$/;
const blocksCarried = bot => (bot.inventory?.items?.() || []).filter(i => BLOCKS.test(i.name)).reduce((n, i) => n + i.count, 0);

// What changing the route has come to, said on each change of it (note
// 1138): the changes of the last hour and the pearls held before the first
// of them and now; whether it is day in the Overworld, where endermen spawn
// in the dark; and the endermen in view here. 25591 (2026-10-03 23:28 to
// 23:54Z), eight pearls held of thirteen, crossed its portal six times and
// gained none: the hunt left at its question, the stall's question offered
// "go back to the Overworld for the pearls" (taken at 23:38 and 23:41Z, in
// the Overworld's morning) and there "go back into the Nether" (23:40 and
// 23:53Z), each said as if it were the first.
const HOUR = 3600000, LOG_MOST = 16;
const pearlsHeld = (bot, goal) => { try { const n = require('./eye-need').need(bot, goal); return n.pearls + n.eyes + (n.stashed?.pearls || 0) + (n.stashed?.eyes || 0); } catch (_) { return count(bot, 'ender_pearl'); } };
function noteChange(bot, goal, to, now) {
  const log = goal.pearlRouteLog ||= [];
  log.push({ at: now, to, pearls: pearlsHeld(bot, goal) });
  while (log.length > LOG_MOST) log.shift();
}
function changesSay(bot, goal, now) {
  const log = (goal.pearlRouteLog || []).filter(e => now - e.at <= HOUR);
  if (!log.length) return '';
  const over = log.filter(e => e.to === 'overworld').length, back = log.length - over, held = pearlsHeld(bot, goal), gained = held - log[0].pearls;
  return ` In the last hour the pearls' route was changed ${plural(log.length, 'time')} (${[over ? `to the Overworld ${over}` : null, back ? `back to the Nether ${back}` : null].filter(Boolean).join(', ')}), the first ${plural(Math.max(1, Math.round((now - log[0].at) / 60000)), 'minute')} ago: ${gained > 0 ? `${plural(gained, 'pearl')} gained since` : 'no pearl gained since'}, ${held} held now.`;
}
// The Overworld's hour, which the server tells in every dimension: dark
// from 13000 to 23000 of the day's 24000 ticks, twenty ticks a second.
function overworldHourSays(bot) {
  const t = bot.time?.timeOfDay;
  if (!Number.isFinite(t)) return '';
  const mins = ticks => Math.max(1, Math.round(ticks / 1200));
  return t >= 13000 && t < 23000 ? ` It is night in the Overworld now, about ${plural(mins(23000 - t), 'minute')} of dark left.`
    : ` It is day in the Overworld now, about ${plural(mins(((13000 - t) + 24000) % 24000), 'minute')} until dark: endermen spawn on the surface only in the dark, and by day are met only in caves.`;
}
function endermenHereSays(bot) {
  const here = bot.entity?.position;
  const n = Object.values(bot.entities || {}).filter(e => e.name === 'enderman' && e.isValid !== false && e.position && e.position.distanceTo(here) <= 48).length;
  return n ? ` Here, ${n === 1 ? '1 enderman is' : `${n} endermen are`} within forty-eight blocks now.` : ' No enderman is within forty-eight blocks here now.';
}

// The routes, as { options: { key: { description, run } }, notOffered: [..] }.
// `actions.navigate` walks toward a piglin for a barter.
function pearlRoutes(bot, goal, { now = Date.now(), save = () => {}, actions = {} } = {}) {
  const options = {}, notOffered = [];
  const here = bot.entity?.position;
  if (!here || goal.kind !== 'win') return { options, notOffered };
  const exploration = require('./exploration');
  const blocks = blocksCarried(bot);
  const carried = `${plural(blocks, 'block')} carried to bridge or pillar with`;
  if (inNether(bot)) {
    // The warped forests known, their walks resting: taken up again, the
    // rest lifted and the pearl step walks there.
    let forests = [];
    try { forests = exploration.knownLandmarks(bot, goal, 'warped_forest', 1024); } catch (_) { forests = []; }
    const tripKey = l => `${l.kind}:${l.x},${l.z}`;
    const resting = forests.filter(k => isSetAside(goal, 'landmark_trip', tripKey(k.landmark), now));
    for (const k of resting.slice(0, 2)) {
      const l = k.landmark, key = tripKey(l), dy = Number.isFinite(l.y) ? Math.round(l.y - here.y) : 0;
      const entry = attemptsFor(goal).entries[require('./progress').keyOf('landmark_trip', key)];
      const w = l.lastWalk;
      const walked = w ? ` The last walk there, from (${w.from.x}, ${w.from.y}, ${w.from.z}), began ${w.began} blocks off and ended ${w.ended}${w.why ? `: ${w.why}` : ''}`.replace(/[.!?]?$/, m => m || '.') : '';
      const target = { x: l.x, y: Number.isFinite(l.y) ? l.y : Math.round(here.y), z: l.z };
      // Keyed by the number the forest was given when first offered (keys.js,
      // note 749).
      options[`pearls_forest_${require('./decisions/keys').id(goal, 'warped_forest', { x: l.x, z: l.z }, { near: 16, base: 1 })}`] = { target, surveyTo: target,
        description: `Go for the warped forest at (${l.x}, ${l.z}) again, ${k.distance} blocks off${dy ? ` and ${Math.abs(dy)} ${dy > 0 ? 'up' : 'down'}` : ''}: endermen spawn there in numbers, and the pearls are its hunt. Its walk rests ${plural(minutesLeft(entry.until, now), 'minute')} more (${entry.why}); chosen, the rest is lifted and the pearl step walks there, bridging and digging as the walk does, ${carried}.${walked}`,
        run: async () => { attemptsFor(goal).clear('landmark_trip', key); attemptsFor(goal).clear('rung', 'warped_pearls'); delete goal.pearlRoute; save(); } };
    }
    // The sweep for another forest, when it rests and no forest known is
    // open (an open one is what the pearl step walks to first).
    const openForest = forests.some(k => !isSetAside(goal, 'landmark_trip', tripKey(k.landmark), now));
    if (!openForest && isSetAside(goal, 'rung', 'warped_search', now)) {
      const entry = attemptsFor(goal).entries[require('./progress').keyOf('rung', 'warped_search')];
      options.pearls_search = { description: `Sweep the Nether for another warped forest, legs of sixty-four blocks on a heading at a time, walking and digging through the netherrack, ${carried}. The sweep rests ${plural(minutesLeft(entry.until, now), 'minute')} more (${entry.why}); chosen, the rest is lifted and the sweep starts afresh from here.`,
        run: async () => { attemptsFor(goal).clear('rung', 'warped_search'); attemptsFor(goal).clear('rung', 'warped_pearls'); delete goal.warpedSearch; delete goal.pearlRoute; save(); } };
    }
    // The endermen here (note 2223; Fable, 2026-10-26 14:30Z): 25596's pearls today (2.9 an hour, the fleet's 0.9) came
    // from endermen met in the open Nether by the hunt step, and no way to the pearls from the stall named them: the
    // sweep for a forest, the barter and the Overworld were the offers. Offered while one is within forty-eight; chosen,
    // the ladder's pearl order is the hunt (pearl-order.js stageFor hunt_enderman), held half an hour or until none is left.
    {
      const endermen = Object.values(bot.entities || {}).filter(e => e.name === 'enderman' && e.isValid !== false && e.position && e.position.distanceTo(here) <= 48).sort((a, b) => a.position.distanceTo(here) - b.position.distanceTo(here));
      if (endermen.length && goal.pearlOrder?.pick !== 'hunt_enderman') {
        const near = endermen[0], d = Math.round(near.position.distanceTo(here));
        options.pearls_endermen_here = { target: { x: Math.round(near.position.x), y: Math.round(near.position.y), z: Math.round(near.position.z) },
          description: `Hunt the ${endermen.length === 1 ? 'enderman' : `${endermen.length} endermen`} here, the nearest ${d} blocks off: struck with the sword and never looked in the eye (a sword's blow does not make it teleport; an arrow does), about half drop a pearl, 40 health each; the hunt holds while one is within forty-eight blocks. ${require('./pearl-record').endermanSays()}${require('./pearl-record').runSays(goal, 'hunt_enderman')}`,
          run: async () => { goal.pearlOrder = { pick: 'hunt_enderman', at: now, until: now + 30 * 60000, offered: ['enderman'], pearlsAt: count(bot, 'ender_pearl'), deathsAt: (goal.survival?.deaths || []).length, because: 'chosen at the stall: endermen here' }; delete goal.pearlRoute; save(); } };
      }
    }
    // A barter: gold to throw, and piglins about but none near enough for
    // the ladder's own barter (which needs one within 32).
    // Gold to throw is gold left once a gold piece is worn: three ingots
    // and no gold piece is no barter (note 616).
    const bartering = require('./bartering');
    const gold = bartering.barterGold(bot).throwable;
    const piglins = Object.values(bot.entities || {}).filter(e => e.name === 'piglin' && e.isValid !== false && e.position)
      .map(e => ({ e, d: e.position.distanceTo(here) })).sort((a, b) => a.d - b.d);
    if (gold > 0 && piglins.length && !bartering.barterReady(bot, goal) && actions.navigate) {
      const near = piglins[0];
      options.pearls_barter = { target: { x: Math.round(near.e.position.x), y: Math.round(near.e.position.y), z: Math.round(near.e.position.z) },
        description: `Barter with piglins for pearls: gold enough for ${plural(gold, 'ingot')} to throw, ${require('./pearl-record').barterRateSays()}, ${bartering.barterGold(bot).dressed ? 'a gold piece worn first or they turn on the bot' : 'golden boots made from four more first and worn, or they turn on the bot'}. ${plural(piglins.length, 'piglin')} about, the nearest ${Math.round(near.d)} blocks off; chosen, the bot walks toward it and barters once one is within thirty-two.`,
        run: async (task) => {
          const { goals } = require('mineflayer-pathfinder');
          const p = near.e.position;
          await actions.navigate(bot, task, new goals.GoalNear(p.x, p.y, p.z, 12), { timeoutMs: 45000, stallMs: 8000 });
        } };
    } else if (gold <= 0) {
      let bastion = false;
      try { bastion = bartering.bastionKnown(bot, goal); } catch (_) { bastion = false; }
      const short = bartering.barterGoldSays(bot);
      if (!bastion) notOffered.push(`a barter with piglins: ${short || 'no gold carried'} (${require('./pearl-record').barterRateSays()}) and no bastion known to take gold from${piglins.length ? `; ${plural(piglins.length, 'piglin')} about, the nearest ${Math.round(piglins[0].d)} blocks off` : ''}`);
    } else if (!piglins.length) notOffered.push(`a barter with piglins: gold enough for ${plural(gold, 'ingot')} carried, but no piglin about`);
    // Back to the Overworld for its endermen (and a cleric's pearls when
    // one is known), the pearls there before the Nether again.
    const { portalTrip, pearlRouteHeld, PEARL_ROUTE_MS } = require('./game-progress');
    const portals = (goal.portals || []).filter(p => /nether/.test(String(p.dimension || '')));
    if (portals.length && pearlRouteHeld(goal, now)?.pick !== 'overworld') {
      const cleric = Object.values(goal.trading?.offers || {}).some(o => (o.trades || []).some(t => t.outputItem?.name === 'ender_pearl' && !t.tradeDisabled));
      const rods = count(bot, 'blaze_rod');
      const portal = portals.slice().sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z))[0];
      options.pearls_overworld = { surveyTo: { x: portal.x, y: portal.y, z: portal.z }, description: `Go back to the Overworld for the pearls: endermen spawn in the dark there, in ones and twos anywhere on the surface, each dropping a pearl about half the time; a patrol hunts one in view and explores or goes on an expedition between${cleric ? ', and a cleric\'s pearl trade is known' : ''}. ${portalTrip(bot, goal)} Chosen, it holds half an hour or until the pearls are carried; ${plural(rods, 'blaze rod')} carried, and with rods still short the ladder comes back into the Nether for them after the pearls.${overworldHourSays(bot)}${endermenHereSays(bot)}${changesSay(bot, goal, now)}`,
        run: async () => { noteChange(bot, goal, 'overworld', now); goal.pearlRoute = { pick: 'overworld', at: now, until: now + PEARL_ROUTE_MS }; save(); } };
    } else if (!portals.length) notOffered.push('back to the Overworld for its endermen: no portal is remembered in the Nether');
  } else {
    // In the Overworld on the Overworld's route: the Nether's warped forest
    // instead, the route dropped.
    const { pearlRouteHeld } = require('./game-progress');
    const held = pearlRouteHeld(goal, now);
    if (held?.pick === 'overworld') options.pearls_nether = { description: `Drop the Overworld's hunt chosen ${plural(Math.max(1, Math.round((now - held.at) / 60000)), 'minute')} ago and go back into the Nether for a warped forest's endermen, where they spawn in numbers. ${require('./game-progress').portalTrip(bot, goal)}${overworldHourSays(bot)}${endermenHereSays(bot)}${changesSay(bot, goal, now)}`,
      run: async () => { noteChange(bot, goal, 'nether', now); delete goal.pearlRoute; save(); } };
  }
  return { options, notOffered };
}

// In the Overworld, the warped sweep open again, which way to the pearls
// (note 2020). The ladder crossed for the sweep by rule whenever its rest
// ended, the Overworld's hunt only the fallback: full-1 (2026-10-21 23:30 to
// 2026-10-22 02:51Z), its rods banked, crossed four times for a sweep that
// found no warped forest, 73 minutes of play on the sweeps and none on the
// Overworld's endermen in the run, and came back each time with no pearl.
const SWEEP_ASK_MIN = 10;
// The Overworld's hunt said with its own way and record (note 2027): it was
// offered with no plan beside the sweep's eight legs, and full-1 chose the
// sweep seven times running (03:14 to 08:42Z) at 0.62 to 0.68. The lit
// runs' pearls came from endermen met at night work: stalking 21 and 42
// minutes and the fights at the slot 11 and 19 (their play clocks at
// 2026-10-22 10:00Z).
const OVERWORLD_HUNT_RECORD = ' The two runs that lit their portals had their pearls this way, from endermen met at night work: about 21 and 42 minutes stalking them and 11 and 19 fighting them from a slot, against no minutes on the sweep that found a forest.';
const shelterSays = goal => { const m = clockMin(goal, 'obtain_ender_pearls: wait_in_shelter') + clockMin(goal, 'obtain_ender_pearls: wait_for_dawn'); return m >= 30 ? ` This run has spent ${m} minutes of the pearls' time sealed in through nights, the hours endermen spawn.` : ''; };
// The four full runs' pearls by way (note 2025), from their play clocks at
// 2026-10-22 08:10Z: the two whose End portals were lit had hunted endermen
// where they met them (stalking and fighting) 39 and 86 minutes and swept
// for a warped forest 1 and 0; the two holding no pearl had swept 81 and 33
// minutes and hunted 6 and 2.
const ROUTE_RECORD = ' In the four full runs (to 2026-10-22 08:10Z), the two that made their twelve eyes and lit their portals had hunted endermen where they met them for 39 and 86 minutes and swept for a warped forest 1 and 0; the two holding no pearl had swept 81 and 33 minutes and hunted endermen 6 and 2.';
const clockMin = (goal, key) => Math.round((goal.gameProgress?.clock?.byDoing?.[key] || 0) / 60000);
const routeAsked = goal => clockMin(goal, 'obtain_ender_pearls: warped_search') >= SWEEP_ASK_MIN;
function routeTree(bot, goal) {
  const sweep = clockMin(goal, 'obtain_ender_pearls: warped_search'), patrol = clockMin(goal, 'obtain_ender_pearls: pearl_patrol') + clockMin(goal, 'obtain_ender_pearls: hunt_mob');
  const all = Object.entries(goal.gameProgress?.clock?.byDoing || {}).filter(([k]) => k.startsWith('obtain_ender_pearls:')).reduce((n, [, v]) => n + v, 0);
  const held = pearlsHeld(bot, goal);
  const record = ` On the pearls in this run so far: about ${Math.round(all / 60000)} minutes of play, ${sweep} of them on sweeps for a warped forest and ${patrol} on the Overworld's endermen; ${held} pearl${held === 1 ? '' : 's'} or eye${held === 1 ? '' : 's'} held now.`;
  const { portalTrip } = require('./game-progress');
  let trip = ''; try { trip = ` ${portalTrip(bot, goal)}`; } catch (_) { trip = ''; }
  return {
    warped_forest: { description: `Cross into the Nether and sweep for a warped forest, where endermen spawn by day and night alike, eight legs of 64 blocks; a sweep that finds none rests half an hour.${trip}${record}${ROUTE_RECORD}` },
    overworld_hunt: { description: `Hunt the Overworld's endermen: they spawn in the dark on the surface, in ones and twos, each dropping a pearl about half the time, tall and slow to turn on a player who does not look at them. The patrol takes on any enderman in view, struck from under a roof two high or with the back to a wall so it cannot reach over, and with none in view does the work at hand on the surface (wood, food, ore, a shelter) and takes any that comes; the night is its time, not spent sealed in.${OVERWORLD_HUNT_RECORD}${shelterSays(goal)}${overworldHourSays(bot)}${endermenHereSays(bot)} The crossing is not made; held half an hour.${record}${ROUTE_RECORD}` },
  };
}
async function askRoute(bot, task, goal, save, actions = {}) {
  const now = Date.now(), { PEARL_ROUTE_MS } = require('./game-progress');
  const decision = await require('./decisions').decide('pearl_route', { client: actions.client || task.opportunityClient, bot, task, goal, save, tree: routeTree(bot, goal),
    state: { pearlsHeld: pearlsHeld(bot, goal), dimension: 'overworld' } });
  if (decision.stale) return false;
  const pick = decision.path.at(-1);
  noteChange(bot, goal, pick === 'overworld_hunt' ? 'overworld' : 'nether', now);
  goal.pearlRoute = { pick: pick === 'overworld_hunt' ? 'overworld' : 'nether', at: now, until: now + PEARL_ROUTE_MS, asked: 'pearl_route' }; save();
  return false;
}

module.exports = { pearlRoutes, blocksCarried, changesSay, overworldHourSays, noteChange, routeAsked, routeTree, askRoute, SWEEP_ASK_MIN };
