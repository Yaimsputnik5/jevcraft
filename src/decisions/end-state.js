'use strict';

// Vanilla 26.1 EnderDragonPhase ids. Supply the mechanics explicitly rather
// than asking a general action classifier to infer them from an integer.
const PHASES = ['circling', 'strafing', 'approaching_landing', 'landing', 'taking_off',
  'perched_breathing_fire', 'perched_scanning', 'perched_attacking', 'charging', 'dying', 'hovering'];
const endDecisionInstructions = {
  task: 'Choose the most useful available action NOW in this Ender Dragon fight.',
  mechanics: [
    'Flying dragons can be hurt by arrows. Perched dragons deflect arrows; an offered sword strike can hurt their reachable head.',
    'Listed attacks already have safe footing, reach or a clear arrow trajectory checked by code. Reflexes interrupt any action if new danger appears.',
    'Healing crystals restore the dragon\'s health. When both attacks are available, destroy a healing crystal BEFORE shooting the dragon. Missing entity tracking alone does not prove a crystal is gone.',
  ],
  priorities: [
    'Preserve survival, remove healing crystals, then damage the dragon. At good health, prefer an available effective attack over waiting or changing position for its own sake.',
    'Move when it gains a needed attack opportunity, investigates an unresolved crystal, or escapes danger. A route being new is not itself a combat benefit.',
    'Wait when there is a concrete reason: necessary healing at safe footing, or no useful attack or approach yet. Do not wait for a vulnerable phase when an effective attack is already offered.',
  ],
};

// The dragon's landing or take-off said as what it does to a body in the
// open by the fountain (note 1609): 'dragonPhase: 3' on an option says
// nothing a reader can weigh. 25588 (dragon-149, 2026-10-14 09:01Z, one
// crystal broken) stood on the island's ground 10 to 19 blocks from the
// fountain as the dragon came down on it (phase 3, 13 blocks off), took
// pillar_punch_78 at 0.37 with wait_in_hole at 0.11, was struck twice and
// thrown fifteen blocks by the body, dead at 16.6 health; dragon-121, 130
// and 136 the same at the take-off.
function dragonNow(dragon, position) {
  if (!dragon || !position || ![2, 3, 4].includes(dragon.phase)) return undefined;
  const byFountain = Math.hypot(position.x || 0, position.z || 0);
  if (byFountain > 24) return undefined;
  const off = dragon.position ? Math.round(Math.hypot(dragon.position.x - position.x, dragon.position.z - position.z)) : null;
  const what = dragon.phase === 4 ? 'taking off from the fountain' : 'coming down to land on the fountain';
  return `the dragon is ${what} now${off === null ? '' : `, ${off} blocks off`}, and the bot stands ${Math.round(byFountain)} blocks from the fountain: its body comes down over the fountain and the ground within about twelve of it, and its wings push a body in the open there (4 over the squared distance a tick, 5 of hurt, the throw off the ground); 25588 standing in the open within twenty of the fountain at a landing or a take-off was struck and thrown each time, dead (dragon-121, 130, 136 and 149, 2026-10-14); two deep in a hole the body is below the wings, and the dragon keeps its perch while a player is within twenty of it`;
}

function endDecisionState({ request, health, food, arrows, position, safe, dragon, head, crystals, combat }) {
  const known = Object.values(combat.knownCrystals || {});
  return {
    request, task: 'Defeat the Ender Dragon and remain alive.', health, food, arrows, position,
    dragonNow: dragonNow(dragon, position),
    survival: { maximumHealth: 20, currentFootingSafe: safe, needsHealing: health < 16,
      naturalRegenerationPossible: health < 20 && food >= 18, immediateEmergenciesHandledByCode: true },
    dragon: dragon && { ...dragon, phaseName: PHASES[dragon.phase] || 'unknown',
      arrowsDeflected: [5, 6, 7].includes(dragon.phase) },
    perchedHead: head, crystals,
    crystalEvidence: { observed: crystals.length, confirmedExplosions: known.filter(c => c.status === 'destroyed').length,
      absentOnLoadedRevisit: known.filter(c => c.status === 'absent_on_revisit').length },
    unresolvedCrystalLocations: known.filter(c => c.status === 'unresolved'),
    noProgress: combat.noProgress, pausesWithoutProgress: combat.idleObservations || 0,
    recentShots: combat.shots.slice(-3).map(s => ({ at: s.at, target: s.target, outcome: s.outcome || 'launch_confirmed_hit_unverified' })),
    lastDamage: combat.lastDamage,
    // Old hazards are history, not current threats. The current safety facts
    // above and offered actions determine what can be done now.
    previousInterruption: combat.lastInterrupted,
  };
}

module.exports = { endDecisionInstructions, endDecisionState, dragonNow };
