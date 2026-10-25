# The goal

jevcraft is built toward one demonstration: a decision model can play Minecraft Survival and make the decisions. Starting with an empty inventory in a fresh natural world on Normal difficulty, the bot should gather, craft, eat, shelter, fight, mine and build its way through the Overworld and the Nether, craft Eyes of Ender, find a stronghold, enter the End, defeat the Ender Dragon and return alive. Code owns the rules of the game and carries actions out; every judgment along the way is [Jev](https://typesafe.ai/)'s, asked as a choice among options code has checked, with the facts that bear on it.

It is also a companion: chat requests ("Jev build a house", "get me 32 purple concrete", "find a way to the Nether") are carried out in the same survival conditions, preserved across interruptions for food, shelter and danger, and resumed after a stop, a disconnect or a death.

## The bar for a result

- A run counts only from a fresh natural world, empty inventory, Normal difficulty, with no item grants, teleports, Creative mode, time or difficulty changes, privileged locating commands, or help from a player. Controlled worlds are fine for debugging and are labeled as such.
- An outcome is verified against the world: blocks placed, items in the recipient's inventory, the dimension actually entered, the dragon actually dead. Recognizing a request or reaching an intermediate step is not the outcome.
- Failed runs are kept and reported as failures, never relabeled.

## Where it stands

On 2026-10-24 the run full-2 met the bar up to the dragon: from a fresh natural world on Normal difficulty with an empty inventory, and no grants, teleports, commands or help, it went through the Overworld and the Nether, made its eyes of ender, found the stronghold and killed the Ender Dragon after about 107 hours of play, dying along the way and carrying on from where it respawned ([the win](docs/wins/full-2.md)). The kill is verified by the server's own advancement, [Free the End]. One step of the demonstration is still open: it did not find its way back out through the exit portal.

The goal now is the time: fresh runs measured by their own clocks, a death counted only by the time it costs. The [roadmap](ROADMAP.md) has the order of work.

Earlier milestones, all passed: the first three in-game days done well (`scripts/first-days.js`, first passed by trial 50 on 2026-09-25), and the companion's house, concrete delivery, day and night cycles, and stop, status, resume and restart. [docs/trial-notes.md](docs/trial-notes.md) records the trials to note 943 and [docs/notes-index.md](docs/notes-index.md) lists every note since with its commit.
