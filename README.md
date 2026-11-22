# Here Lies

**A daily dungeon crossing where the dead carve arrows, and some of them lie.**

Every day, everyone on the subreddit gets the same dark dungeon to cross. You carry a torch that lights only the stones around you. Hidden pits wait in the dark. Numbers on the stones you step on tell you how many pits are close. When someone falls, a grave slab is set into the stone they last stood on, and they carve one arrow into it: *"I stepped this way and fell."* The arrow might save you. It might be a lie. You only find out when your run is over.

Built for Reddit's Game of the Day Hackathon on Devvit Web.

---

## How to play

1. **Tap a stone next to the dwarf** to step onto it. Glowing corners show where you can step.
2. **Read the numbers.** A number tells you how many pits touch that stone, counting all 8 neighbours. A blank stone (with footprints) has no pits around it.
3. **Reach the door at the far wall** to cross.
4. You have **3 candles** a day. Falling into a pit costs one, and you start again from the stairs. The stones you already walked stay remembered.
5. **When you fall, carve an arrow.** Your grave slab goes on the stone you stood on just before you fell. Pick which way the arrow points: at the pit (the truth), or anywhere else (a lie). You always see which way you really fell, so a lie is a choice.
6. **Read the slabs in your torchlight.** A slab means *someone stepped off this stone into a pit next to it*, but which neighbour? Only the arrow says, and it may lie. Slabs are safe to stand on; stepping onto one reads it. Tap a lit slab from a distance to read it too.
   - **One arrow per stone:** the first person to fall from a stone carves it. Later falls from that stone only add to its count.
   - **One arrow per player per day:** you carve the first time you fall from an uncarved stone. Your other falls leave no new mark.
7. **You remember your own falls.** A pit you fell into stays open for you (and only you) for the rest of the day.
8. When you cross, or your candles run out, **the dark lifts**: every real pit appears and every arrow is stamped **true** (gold) or **a lie** (red). The game counts how many walkers each arrow **saved** or **fooled**, and your end screen tells you what your own arrow did. You can also choose to share your result as a comment or join the community.

### The numbers, explained

The number on a stone is a count, never random: it is exactly how many pits touch that stone.

```
 ?  ?  ?
 ?  2  ?    ← exactly 2 of these 8 neighbours are pits
 ?  ?  ?
```

Compare numbers as you walk. If you stand on a **1** and the stone you came from was blank, the one pit must be among the 1's neighbours that the blank one does not touch.

### Every board can be solved without guessing

Each day's dungeon is checked by a solver that plays like a careful person: it only steps onto stones it can prove are safe from the numbers, and it never uses graves. A board is published only if that solver reaches the door. **Luck is never required.** Graves are a shortcut: trusting a truthful one saves time, trusting a liar costs a candle.

### Pioneer score: cross early, earn glory

Graves make the board easier as the day goes on, so crossing late is not the same as crossing at dawn. When you cross, your **Pioneer score** is the share of the day's pits that other players had **not** yet found. Your own falls and the seeded forgotten graves never count against you.

| Pioneer | Title |
|---|---|
| 90–100% | Trailblazer |
| 60–89% | Pathfinder |
| 30–59% | Wayfarer |
| under 30% | Grave-walker |

Late players can still cross and enjoy reading the graves; they just can't claim to have blazed the trail.

After crossing you can choose to **wear your title as subreddit flair** (for example *Trailblazer · Here Lies day 2*). It is never set without pressing the button.

### Difficulty rises through the week

| Day | Tier | What it means |
|---|---|---|
| Monday, Tuesday | Gentle | Fewer pits; reading single numbers is mostly enough |
| Wednesday, Thursday | Tricky | You will need to compare neighbouring numbers |
| Friday, Saturday | Cruel | More pits, more cross-checking |
| Sunday | Brutal | The hardest crossing of the week |

The day's tier is shown at the top of the game and in the post preview.

---

## Why it's built for Reddit

- **The community is the content.** Every player who falls leaves an arrow, true or false, for everyone after them. Graves never reveal pits by themselves: the only clue is an arrow you have to decide to trust.
- **Your arrow has a reputation.** The game tracks who it saved and who it fooled, so players come back to see what their lie (or warning) did to the rest of the subreddit.
- **Same board for everyone, every day**, so the comments become a place to compare notes and argue about who lied.
- **Optional sharing:** after your crossing you can post a spoiler-free result as a comment (you see the exact text first), and join the subreddit. Neither is ever required.
- **Fresh days never start empty:** each new day begins with a few *forgotten graves*, nameless dead from the dungeon's past, so the first players of the day already meet words to doubt. These are clearly labelled and never counted as real players.

---

## For moderators: setup

1. Install the app on your subreddit from its listing on developers.reddit.com.
2. Installing creates today's post automatically.
3. A new crossing is posted every day at **00:00 UTC**.
4. You can also post today's crossing by hand from the subreddit menu: **"Post today's crossing"** (moderators only). It won't create a duplicate if one already exists.

No configuration is needed. Old posts stay playable as an archive of past days, but streaks only count on the current day's crossing.

---

## Fair play and safety

- **No free text.** Last words are a single carved arrow, so there is nothing to moderate.
- **Every walk is checked on the server.** A crossing or fall only counts if it is a real chain of single steps over the day's board.
- **One arrow per stone and per player,** and candle use, crossing, carving and sharing are protected against double-submission.
- Sharing and joining only happen when you press their buttons, following Devvit's user-action rules.

---

## For developers

**Stack:** Devvit Web · React 19 · Vite · Hono · TypeScript · Redis (Devvit) · Canvas 2D · Web Audio.

```
src/shared/   rules shared by client and server
  board.ts      daily board generation, weekly difficulty, run judging
  solver.ts     careful-human solver used to accept only no-guess boards
  engine.ts     game rules over a small key-value interface (Redis on the server)
  share.ts      spoiler-free result comment
src/server/   Hono routes: game API, daily post scheduler, menu, install trigger
src/client/   React UI, the pixel renderer (engine/scene.ts) and synthesized sound
tools/        build_atlas.py: packs the CC0 tileset frames into one sprite sheet
```

**Commands**

- `npm run build`: build client and server
- `npm run test:unit`: unit tests (board generation, solver, game rules)
- `npm run lint` and `npx tsc --build`: lint and type-check
- `npm run dev`: playtest live on Reddit (`devvit playtest`)
- `npx devvit upload`: upload a new private version

**Local preview without Reddit:** `npm run build`, then serve `dist/client` on `localhost` (for example `python -m http.server` inside `dist/client`) and open `/game.html`. On localhost the game runs the real rules in memory with simulated players.

---

## Credits

Dungeon art by **0x72**, *16x16 DungeonTileset II* (CC0). Torch, flame, gravestones, numbers, lighting and sound are original to Here Lies. Font: Pixelify Sans (SIL Open Font License). Full details in [CREDITS.md](CREDITS.md).
