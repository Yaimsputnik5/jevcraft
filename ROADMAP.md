# Roadmap

The first goal, to beat Minecraft from a fresh Survival world with an empty inventory, with Jev making the judgment calls and no help from commands, kits or a person ([GOAL.md](GOAL.md)), was met on 2026-10-24 ([the win](docs/wins/full-2.md)). The goal now is the time it takes. The items are in order of priority, without dates.

## Done

- The first three in-game days (`scripts/first-days.js`), the Nether, blaze rods, ender pearls, the stronghold and the dragon, in one continuous run from a fresh world: full-2, about 107 hours of play.
- The dragon killed from a staged world in one life (2026-10-19).
- Most reflexes and hand-written rules handed to Jev as questions ([rule audit](docs/rule-audit.md)), the routine meal among them (note 2103).

## Now: the time to the dragon

A death counts only by the time it costs. full-2's two big losses were 49 hours from the stronghold to the kill (getting the End kit, dying in the End, re-kitting) and 25 hours from the Nether to the eyes (blaze rods and pearls). `scripts/trials/time-lost.js` splits a run's minutes into work, travel, fights, waiting and stuck. The work:

- Every route a speedrun uses, on Jev's menu with the game's own numbers: bartering for pearls with gold from bastions (notes 2106, 2107), beds against the perched dragon (note 2108).
- Prices in minutes toward the goal, so unlike options compare: cooking against raw food, banking rods against hunting on, a bed carried against nights waited out awake.
- Facts from the run itself and the server's code, not from old trials.
- Fewer deaths in the End, where each one meant a long walk back with a new kit.

The measure is the clock of fresh runs started after each round of changes (full-5 to full-7 from 2026-10-24).

## After: the exit portal

After the kill the bot does not yet find its way out of the End through the exit portal.

## Later: netherite

The bot does not aim for netherite. It counts ancient debris as worth picking up and knows netherite gear is stronger, but nothing searches for debris, smelts scrap, crafts ingots or uses a smithing table. Netherite armor would help against fireball pushes (it resists knockback). The chain is long and dangerous: debris at y 8 to 22 in lava-rich caves with a diamond pickaxe, four scrap and four gold ingots plus a diamond piece and a template for each upgrade, and the templates come from bastion chests. It would come after the time to the dragon is short. When it does, Jev chooses whether to go for it, with the prices in front of it.

## Companion

The chat companion runs on the same code, so the game work improves it too. Open items: longer multi-item requests without repeated work, keeping a request through a death or disconnect, oriented blocks (stairs, slabs, doors) in builds, and farming, breeding and trading as ways to get items.

## Tooling

- Faster, more reliable trial infrastructure on one machine.
- More replay cases from real failures, so changes to what Jev is told are checked before they ship.
- Better camera paths for rendered replays (the camera sometimes clips into blocks).

Contributions are most useful when they turn a concrete failure into a small test and a general fix; see [CONTRIBUTING.md](CONTRIBUTING.md).
