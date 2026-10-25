# Lessons, episode by episode

The [README](../README.md#what-we-learned) gives the six lessons in short. These are the episodes they came from, roughly in the order they happened. "Note N" is a trial note: notes to 943 are in [trial-notes.md](trial-notes.md), and every note is listed with its commit in [notes-index.md](notes-index.md).

### Loops

Deaths are easy to spot. Trials that stay busy without progressing are not: pacing a bridge for 70 minutes, or sitting in a sealed pocket for half an hour. Each feature used to keep its own list of what had failed, and none saw the others; one question was answered the same way 4,423 times. We replaced them with one shared record of what has been tried and what came of it, the *ledger* ([src/tried.js](../src/tried.js), note 571). An option that came to nothing twice rests for five minutes. When every option rests, the parent question is asked instead and told what failed. Waiting and holding a stance are recorded the same way, so a wait that changed nothing counts as a failure (notes 599, 611).

### Judging trials by deaths

Judging by deaths alone missed some of the worst trials, which never died. The progress audit and trail maps now flag trials that aren't getting anywhere.

### Wrong facts caused most bad choices

When Jev chooses badly, the cause is almost always a wrong price, a false fact or a missing option, and a new threshold does not fix it. In note 614, Jev kept choosing cover with a blaze four blocks away. The charge was offered only when the bot had a shield, which it didn't; other options' text assumed the shield it didn't have; and no option said what it gained toward the rods. Fixing those changed the answers.

### Confidence gates

At first, a low-confidence pick was handed to hand-written rules. In practice the rules then played most of the hard moments. We now take Jev's pick at any confidence on play questions. Confidence bars remain only for requests from a person (chat, server commands, builds that replace something).

### Reflexes

Lava escapes, fire escapes, creeper dodges and shield use used to run before Jev was asked. Several deaths started with a reflex (note 548). They are now questions, such as `body_way` for lava, fire and suffocation (note 549). When Jev cannot answer in time, the body's own physics (`body_way`, and `shot_answer` for a shot about to land) is answered by a safety rule; nothing else is (note 707).

### Turn priority

Survival, eating and work each used to take control by their own rules. Now each states a claim and Jev picks one (`turn_priority`, [src/arbiter.js](../src/arbiter.js)). The question can hang, so the arbiter falls back if the bot is hurt while waiting or five seconds pass.

### Time limits per goal

Each step of the game, such as "obtain blaze rods", gets ten minutes without progress. Then Jev is asked whether to keep going, change plan, or set it aside for a while.

### Fight prices

Quoting an arena average against three distant blazes to a bot facing four at a spawner made charging in look cheap (note 602). Prices now come from the fight at hand.

### Blaze tactics

We built boxing in, lighting the spawner, a corner ambush and retreating to heal, and measured them in an arena (below). At a live spawner none beat walking in and fighting. The safe ones produce no rods. They are still offered, with their measured numbers (note 606).

### Deaths were not the whole story

For weeks each fix started from a death. Measuring a run's minutes by what they went on showed more time lost to walks, waits and stalls than to dying, and a death costs only the time it takes to get the kit back. The goal is now the time to the dragon, and a death counts only by the time it loses.

### Code that decided, quietly

Some code still chose for Jev without asking. The routine meal ate whatever the code ranked first at hunger 16: about 298 of 303 meals on the fresh runs, 260 of them raw meat with a furnace's makings carried. It is now a question (note 2103): each food, cooking the raw meat first, or eating later, each with its points and seconds.

### Facts from the game itself

Several prices came from our own small samples or from trials a month old. A barter was said to cost nine gold ingots a pearl, from one lucky measure; the server's own loot table says about 15.6 (note 2106). The rods' risk was quoted from trials that died ten times as often as today's (note 2105). What a bed does to the dragon was "not measured" until it was read from the server's code: 46 to 60 damage beside the head, about one bed a perch (note 2108). Where the game has a number, Jev is now told the game's number, and our own records beside it.

### A second opinion from an LLM

A generative LLM reviewing recovery decisions agreed with Jev, took 14 seconds per decision, and cost about a hundred times more. We removed it.
