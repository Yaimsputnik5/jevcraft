# Chat companion

The same bot takes requests in game chat. Setup is under [Playing with Jev](../README.md#playing-with-jev). Start messages with "Jev":

| Request | What it does |
| --- | --- |
| `Jev follow me` | Follow until stopped. |
| `Jev get me a pumpkin` | Find, collect and deliver one. |
| `Jev give me full diamond armor and a bed` | Plan all items together, sharing materials. |
| `Jev find a cherry biome` | Explore. |
| `Jev build a small cherry mansion` | Design and build. |
| `Jev remember this as home` / `Jev go home` | Named places. |
| `Jev status` / `stop` / `resume` | Control the current task. |

A new request replaces the current one, and tasks survive restarts (state is in `.bot-state/`). When a request is ambiguous, Jev asks, for example "Did you mean short grass or grass block?" Server commands work only for players listed in `MC_COMMAND_USERS`, and are never used on the bot's own initiative. Settings are in [.env.example](../.env.example).

## Dreams

A dream is something Jev works toward whenever nobody has asked it for anything. Two are standing goals, and a dream can also be any single request:

- `Jev your dream is to beat the game`: Jev climbs the game ladder, from wood and stone tools through iron, a shield, a bucket, a home with a bed, iron armor, then the Nether, blaze rods, ender pearls, the stronghold and the dragon. This is the same ladder the trials run: every trial starts with this dream set, and "obtain blaze rods" in the example above is one of its steps.
- `Jev your dream is to build a village`: Jev looks at what already stands and picks the next building from the designs it has, until it judges the village complete.
- `Jev your dream is to build a castle by the lake` or `Jev your dream is to get me a stack of diamonds`: any one thing you could ask for as a request. Jev checks it would understand the text as a request (if not, it says so and keeps no dream), does it once when nothing else needs it, says so in chat when it is done, and then the dream ends. If the request keeps failing, Jev sets the dream aside and says so.

A chat request always comes first; the dream picks up again when the request is done. `Jev set your dream aside` pauses it, `Jev chase your dream` resumes it, and `Jev what is your dream` reports progress. Progress is read from the world (what is carried, worn and built), never from a counter, so a dream survives restarts.

## Building and Creative mode

In Survival, Jev builds from templates (cottage, mansion, tower) that it configures, or picks from about 30 ready-made designs, and gathers the materials first.

In Creative mode the bot has every block. There you can connect a generative LLM as the designer: set `OPENROUTER_API_KEY` and `BUILD_DESIGNER=openrouter` (or `auto`), and choose the model with `OPENROUTER_BUILD_MODEL` (default `anthropic/claude-opus-5.5`). The LLM draws a schematic from the request and a survey of the terrain. Code checks that it is valid (up to 25 × 16 × 25 blocks, at most 16 materials), and Jev judges whether it matches the request before any block is placed. Jev never builds over a structure it did not place. Without a key, or with `BUILD_DESIGNER=jev`, it uses the templates.
