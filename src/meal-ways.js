'use strict';
// The routine meal as Jev's question (note 2103): which food carried, the raw
// meat cooked first, or no meal yet. The vitals step ate at hunger sixteen
// with the food the code ranked first and asked nothing: on the fresh runs
// full-5, full-6 and full-7 (2026-10-24 19:42Z to 2026-10-25 16:00Z) it made
// about 298 of 303 meals, 260 of them raw meat, with eight stone and fuel
// carried at 118 of 141. The user, 2026-10-25: "why do we need auto eat",
// "I'm suspicious of anything hardcoded".
const { chooseFood, lastResortFoods, safeFood, sideEffectSays } = require('./vitals');

const round = n => Math.round(n * 10) / 10;
const words = s => String(s).replaceAll('_', ' ');

// What the game does with hunger, said on every meal question.
function hungerSays(bot) {
  const food = bot.food ?? 20, health = round(bot.health ?? 20), sat = round(bot.foodSaturation ?? 0);
  return `Hunger ${food} of 20 (saturation ${sat}), health ${health} of 20. In the game health comes back by itself only at hunger 18 or more` +
    `${health < 20 ? (food >= 18 ? ' (it is coming back now)' : ' (it is not coming back now)') : ''}; sprinting stops at hunger 6; at 0 hunger takes health. ` +
    'Saturation is spent before hunger falls, and a meal adds no hunger past 20.';
}

// Each food carried once by name, best first by the vitals' own ranking.
function foodsCarried(bot) {
  const items = bot.inventory?.items?.() || [], f = bot.registry?.foodsByName || {};
  const named = new Map();
  for (const i of items) {
    if (!f[i.name] || !(safeFood(bot, i) || lastResortFoods.has(i.name))) continue;
    const had = named.get(i.name);
    named.set(i.name, { item: had?.item || i, n: (had?.n || 0) + i.count });
  }
  const best = chooseFood(bot)?.name;
  return [...named.entries()].sort(([a], [b]) => (b === best) - (a === best) || (f[b].foodPoints - f[a].foodPoints)).map(([name, v]) => ({ name, ...v }));
}

// The ways: eat_<food> for each food carried, cook_then_eat where a furnace
// can be put down here, eat_later. `cook(item)` cooks one raw kind; without
// it the cook is not offered. Each way's run gives the food to eat, or null.
function mealWays(bot, { cook = null, goal = null } = {}) {
  const f = bot.registry?.foodsByName || {}, food = bot.food ?? 20, health = round(bot.health ?? 20);
  const ways = {};
  const carried = foodsCarried(bot), totalPts = carried.reduce((t, c) => t + c.n * (f[c.name]?.foodPoints || 0), 0);
  // The last food carried said as the last (note 2129): full-5 (2026-10-26
  // 02:42Z, health 20, hunger 16) ate its one cooked porkchop at 0.97 with
  // four of its points past 20 lost, was told nothing of what came after,
  // and seven minutes later stood at 4.3 health with nothing to eat, hunger
  // 16, for twenty minutes of the night.
  let known = null; try { known = require('./healing').nearestFood(bot, goal); } catch (_) { known = null; }
  const lastSays = c => c.n === 1 && totalPts === (f[c.name]?.foodPoints || 0)
    ? ` It is the last food carried: eaten, nothing carried heals after it${health >= 20 ? ', and health is full now, so it eats back hunger alone' : ''}; the food known from here: ${known?.length ? known.join('; ') : 'none known'}.` : '';
  // The cook as it would be (note 2109): a raw food's own option says what
  // eating it raw gives up, in the cook's minutes.
  let c0 = null; try { c0 = cook ? require('./work').cookable(bot) : null; } catch (_) { c0 = null; }
  const cookSecs = item => item.n * 10 + (c0?.furnace ? 2 : 6);
  for (const c of carried) {
    const pts = f[c.name].foodPoints, sat = round(f[c.name].saturation ?? 0), to = Math.min(20, food + pts);
    const waste = food + pts - 20;
    const cooked = require('./vitals').COOKED[c.name];
    const rawSays = cooked && f[cooked] ? ` Raw: cooked it gives ${f[cooked].foodPoints}.` : '';
    const effect = sideEffectSays(c.name);
    const asCooked = c0?.ready ? c0.items.find(i => i.raw === c.name) : null;
    const rawCost = asCooked ? require('./work').rawCostSays(asCooked, cookSecs(asCooked)) : '';
    ways[`eat_${c.name}`] = {
      description: `Eat a ${words(c.name)} now (${c.n} carried): about two seconds standing still, ${pts} hunger and ${sat} saturation, hunger ${food} to ${to}` +
        `${waste > 0 ? `, ${waste} of its points past 20 lost` : ''}.${rawSays}${rawCost}${effect ? ` ${effect[0].toUpperCase()}${effect.slice(1)}.` : ''}${lastSays(c)}`,
      run: async () => c.item,
    };
  }
  let c = null; try { c = cook ? require('./work').cookable(bot) : null; } catch (_) { c = null; }
  if (c?.ready) {
    const first = c.items.slice().sort((x, y) => (y.after - y.now) - (x.after - x.now))[0];
    const secs = first.n * 10 + (c.furnace ? 2 : 6);
    const gain = first.after - first.now;
    let among = null; try { among = require('./risk').standingAmong(bot, secs, { what: 'at the furnace' }); } catch (_) { among = null; }
    const w = require('./work');
    ways.cook_then_eat = {
      description: `Cook the ${first.n} ${words(first.raw)} carried first, then eat: ${first.now} food points raw, ${first.after} cooked (+${gain}); ` +
        `${c.furnace ? `the ${words(c.furnace)} carried` : `a furnace of eight of the ${words(c.stone)} carried`} put down here, ${words(c.fuel)} for fuel, ` +
        `about ${secs} seconds standing at it before the meal.${w.cookTimeSays(gain, secs)}${among ? ` ${among.says}` : ''}`,
      run: async () => { await cook(first); return chooseFood(bot); },
    };
  }
  ways.eat_later = {
    description: `Eat nothing now and go on with the work: asked again when hunger or health falls.${totalPts ? ` Kept, the ${totalPts} food point${totalPts === 1 ? '' : 's'} carried ${totalPts === 1 ? 'is' : 'are'} the meal for a hurt later: health comes back only at hunger 18 or more, and from hunger ${food} ${food >= 18 ? 'it comes back now' : `that takes ${18 - food} point${18 - food === 1 ? '' : 's'} eaten first`}.` : ''}`,
    run: async () => { bot._mealLater = { food, health: bot.health ?? 20, at: Date.now() }; return null; },
  };
  return ways;
}

// Asked again only once hunger or health has fallen since "later".
function laterHolds(bot) {
  const l = bot._mealLater;
  if (!l) return false;
  if ((bot.food ?? 20) >= l.food && (bot.health ?? 20) >= l.health) return true;
  delete bot._mealLater;
  return false;
}

module.exports = { mealWays, hungerSays, foodsCarried, laterHolds };
