'use strict';
// Leaving the fortress to come back better kitted, as a route on the
// fortress's own questions (note 2174; the user, 2026-10-26: add it). Over
// the six full runs' day to 2026-10-26 08:00Z 9 of the Nether's 16 deaths
// came in a fortress with wither skeletons or blazes about, and the only ways
// off a fortress question were to leave the mobs alone for two minutes
// (hunt_target defer), to leave for food (leave_nether, asked only with none
// carried), or to go home for blocks or a pickaxe (return_for_blocks, only
// with none). A bot at full health in two pieces of iron among four blazes
// had no route that said: go back now, make the rest of the kit, come again.
// Said with what is worn and held now against the full set, what the
// record says a blaze fight takes in each, the trip back, and that the way
// on from the Overworld is the ladder's question with the kit rungs priced.
const PIECES = Object.freeze({ helmet: 5, chestplate: 8, leggings: 7, boots: 4 });
const words = s => String(s || '').replaceAll('_', ' ');

// What is worn and held, and what of the iron set is short. -> { worn, points, missing, ingotsShort, sword, shield, food }
function kit(bot) {
  const slots = [5, 6, 7, 8].map(i => bot.inventory?.slots?.[i]?.name).filter(Boolean);
  const points = require('./combat-estimate').armourOf(slots).points;
  const missing = Object.keys(PIECES).filter(p => !slots.some(n => n.endsWith(`_${p}`)));
  const items = bot.inventory?.items?.() || [];
  const count = re => items.filter(i => re.test(i.name)).reduce((a, i) => a + i.count, 0);
  const ingotsShort = Math.max(0, missing.reduce((a, p) => a + PIECES[p], 0) - count(/^iron_ingot$/));
  const sword = items.map(i => i.name).find(n => /_sword$/.test(n)) || null;
  const shield = items.some(i => i.name === 'shield') || slots.length === 5;
  let food = 0; try { food = Math.round(require('./foraging').foodSupply(bot)); } catch (_) { food = 0; }
  return { worn: slots, points, missing, ingotsShort, sword, shield, food, ingots: count(/^iron_ingot$/) };
}

function kitSays(bot) {
  const k = kit(bot);
  const worn = k.worn.length ? `${k.worn.map(words).join(', ')} (${k.points} armour points)` : 'nothing (no armour)';
  const miss = k.missing.length ? `short of the iron set by ${k.missing.map(words).join(', ')}: ${k.missing.reduce((a, p) => a + PIECES[p], 0)} iron ingots, ${k.ingots} carried, ${k.ingotsShort} more to mine and smelt` : 'the full set';
  return `Worn now: ${worn}, ${miss}; held: ${k.sword ? words(k.sword) : 'no sword'}${k.shield ? ' and a shield' : ', no shield'}; food carried ${k.food} points.`;
}

// The option, or null where the trip back cannot begin from here or the bot is not in the Nether.
function option(bot, goal, actions, { where = 'the fortress' } = {}) {
  if (!/nether/.test(String(bot.game?.dimension || '')) || !actions?.returnOverworld) return null;
  const mh = require('./mob-hunt');
  let homeBy = null, start = null;
  try { homeBy = mh.portalBack(bot, goal, bot.entity.position); start = homeBy ? mh.portalTripStart(bot, goal, homeBy) : null; } catch (_) { return null; }
  if (!homeBy || !start?.ok) return null;
  const rods = (bot.inventory?.items?.() || []).filter(i => i.name === 'blaze_rod').reduce((a, i) => a + i.count, 0);
  let trip = ''; try { trip = require('./game-progress').portalTrip(bot, goal); } catch (_) { trip = ''; }
  const record = require('./kit-record').BEFORE_NETHER.iron_armour.says;
  const F = require('./nether-record').FLEET;
  const description = `Leave ${where} now and go back through the portal (${homeBy.says}) to come back better kitted. ${kitSays(bot)} The record: ${record}. On the full runs ${F.swarm} of the Nether's ${F.netherDeaths} deaths (${F.from} to ${F.to}) came in a fortress with wither skeletons or blazes about, and a death here drops everything carried${rods ? `, the ${rods} blaze rod${rods === 1 ? '' : 's'} among it` : ''}. ${trip} Back in the Overworld the ladder's next step is asked with the kit rungs priced (the iron to mine, the pieces to make, the food); the Nether is entered again by the same portal, and this fortress is remembered. Not a two-minute leave: the hunt here ends with the trip.`;
  return { description, run: async (task, save) => { goal.leaveNether = { reason: 'kit', pick: 'go_back', until: 0, at: Date.now() }; save?.(); bot.chat?.('Leaving the fortress for the rest of the kit. Back soon.'); await actions.returnOverworld(bot, task, goal, save); return 'returned'; } };
}

// For the Nether-first offer back in the Overworld: that the bot came out for the kit, and how long ago.
function cameOutForKitSays(goal, now = Date.now()) {
  const h = goal?.leaveNether;
  if (!h || h.reason !== 'kit') return '';
  const m = Math.round((now - h.at) / 60000);
  return ` The bot came out of the Nether ${m} minute${m === 1 ? '' : 's'} ago for the rest of the kit, as Jev chose (leave_for_kit); what it has made since is in the kit lines.`;
}

module.exports = { kit, kitSays, option, cameOutForKitSays, PIECES };
