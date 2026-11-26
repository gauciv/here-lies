# Here Lies

**A daily dungeon crossing where the dead carve arrows, and some of them lie.**

Every day, everyone on the subreddit gets the same dark dungeon to cross. You carry a torch that lights only the stones around you. Hidden pits wait in the dark. Numbers on the stones you step on tell you how many pits are close. When someone falls, a grave slab is set into the stone they last stood on, and they carve one arrow into it: *"I stepped this way and fell."* The arrow might save you. It might be a lie. You only find out when your run is over.

Built for Reddit's Game of the Day Hackathon on Devvit Web.

**Play it:** [r/here_lies_daily_dev](https://www.reddit.com/r/here_lies_daily_dev/), where a new crossing is posted every day. One run takes two to five minutes.

**What makes it different:** the hint system is the community. Every clue left on the board was carved by another player, and any of them may be lying. The board is still always solvable by logic alone; the slabs are a gamble on trust.

---

## The camp

Every visit starts in the dark. A dwarf rests by a campfire, the only light there is, and the shadows at the edge of its glow shift as the flames move. The game's name hangs above in old blackletter, with the day's room beneath it (*The Gilded Narrows*).

**Enter the dungeon** sets him moving: he takes up an unlit torch, lights it in the fire and carries it into the dark. A door appears only when his torch reaches it, and he steps through into the day's room. **Your map** unrolls the dwarf's hand-drawn map, also from the scroll button in the game bar. **Today** sketches the room (walls and rock, a red **X** where the door is, *you* at the entrance) and inks in each of your runs as its own line, solid, dashed or dotted, with a skull wherever you died; it shows no one else's graves and no pits you haven't found. **This week** shows each day's room with what you did there (your time, a skull for a lost day), and tapping a finished day opens its full answer: every pit, and every arrow marked gold for the truth or red for a lie. Tap the map to see it full screen. Once you've finished, **Review your run** shows the room in daylight with your own path and the pits you fell into. The full answer waits for tomorrow: once the day is over, **Review the room** on that day's post reveals every pit and every arrow's truth. The camp has its own calm music; the dungeon's is tense.

### First time in

New players don't have to read anything. The first time you press **Enter the dungeon**, a short comic tells the story: Brom and his brother Kett kept the last fire before the Deep, until one night Kett took a torch through the door and never came back, leaving only a slab with an arrow carved in it. The Deep grows a new room every day, and the fallen carve arrows, some true, some lies. Brom lights his torch: one room a day, he'll find Kett. Then a one-minute practice room teaches one thing per line, with a pointer on the stone to tap: stepping, blank stones, numbers, slabs that may lie, and the door. Both can be skipped, and both can be replayed from **Settings** (the gear on the camp), which also has separate music and sound-effect volumes.

## How to play

1. **Tap a stone next to the dwarf** to step onto it. Glowing corners show where you can step.
2. **Read the numbers.** A number tells you how many pits touch that stone, counting all 8 neighbours. A blank stone (with footprints) has no pits around it.
3. **Find the door hidden in the far wall** and step onto the stone in front of it to cross. The door is somewhere different every day, and you only see it when your torch reaches the wall.
4. You have **3 candles** a day. Falling into a pit costs one, and you start again from the entrance. The stones you already walked stay remembered.
5. **When you fall, carve an arrow.** Your grave slab goes on the stone you stood on just before you fell. Pick which way the arrow points: at the pit (the truth), or anywhere else (a lie). You always see which way you really fell, so a lie is a choice.
6. **Read the slabs in your torchlight.** A slab means *someone stepped off this stone into a pit next to it*, but which neighbour? Only the arrow says, and it may lie. Slabs are safe to stand on; stepping onto one reads it. Tap a lit slab from a distance to read it too.
   - **One arrow shows per stone:** the first person to fall from a stone carves the arrow you see. Anyone who falls from that stone later can still carve, but their arrow waits hidden beneath the one on top.
   - **One arrow per player per day,** and carving is always your choice: **skip** on any fall, keep your arrow for a later death, or never carve at all.
   - **Graves crumble, and quietly change hands.** Every walker who stands on a slab cracks it a little more; after **5 walkers** the arrow crumbles. If another arrow was waiting beneath it, that one silently takes its place, so the slab you trusted this morning may carry someone else's word by noon. Nothing breaks in front of you: the board just updates after your run. Every arrow gets the same five tests no matter when it was carved, and at most 6 arrows are ever on the board.
7. When you die, your ghost lingers in its pit, lit in the dark; **Respawn** sends you back to the entrance. When your last candle goes out, **Back to camp** ends the day's run: your soul rises out of its pit and floats straight to the entrance steps, over pits and rock alike. At camp it drifts out of the dark doorway to the fire, your soulless body (a dim, grey-green husk with hollow eyes) staggers after it, and the two become one again before anything else appears. When you reach the door, your dwarf walks through it and out into the camp, still dark: no fire yet, only his torch. He hops for joy, golden sparks around him, while **You crossed.** shows your time, standing and streak. **Share result** lets you write a caption, then posts your result to the subreddit as a new post with your game card under it. **Continue** sends him walking on through the dark for a couple of seconds, until the camp's walls and fire come into view around him and he walks over to his place beside it. When you review your run, the room is in daylight but only what you learned yourself shows: your path, the pits you fell into and your own arrow's verdict. **The full answer is revealed tomorrow**, so nobody can screenshot today's pits for people who haven't played: once the day is over, that day's post shows every real pit and stamps every arrow **true** (gold) or **a lie** (red). The game counts how many walkers each arrow **saved** or **fooled**, and your end screen tells you what your own arrow did. You can also join the community from the result screen.

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

### Your time and standing

Your clock starts the first time you step into the day's room and stops when you reach the door. It doesn't pause for deaths, carving or trips back to camp. The bar at the top shows the day's tier and your running time.

When you cross, your time is ranked against everyone who crossed the same room that day. Standings stay live, so your title can change as others cross:

| Standing | Title |
|---|---|
| top 20% (and the fastest, always) | Pioneer |
| top 50% | Pathfinder |
| top 80% | Wayfarer |
| the rest | Grave-walker |

After crossing you can choose to **show your title next to your name** in the subreddit (Reddit calls this user flair), for example *Pioneer · Here Lies day 2*. It is never set without pressing the button.

### A new room every day

Every day is a different room, the same for everyone. Each week the dungeon deals seven floor plans in a fresh order, so no shape repeats within a week:

- a plain hall
- a narrow gallery
- pillars
- walls that pinch in at the middle
- a wall down the middle
- a caved-in corner
- rubble from a collapse

Every room also gets a name, like *The Drowned Gallery* or *The Weeping Narrows*. The name is shown on the camp screen and in shared results, so players can talk about "yesterday's Drowned Gallery". Solid rock is never a pit and never a step. The rules never change; the floor plan does.

### A gentle weekly rhythm

The game is meant to be bite-sized, so even the hardest day never needs more than five two-number deductions.

| Day | Tier | What it means |
|---|---|---|
| Monday, Tuesday | Gentle | Reading single numbers is mostly enough. |
| Wednesday, Thursday, Sunday | Tricky | You will need to compare neighbouring numbers. |
| Friday, Saturday | Cruel | More pits and more cross-checking. |

Every room is checked by a solver that thinks like a careful player: it can always be crossed on logic alone, with no guessing and no need to trust a slab. Anyone can carve a lie on any day; only the three *forgotten* slabs seeded each morning get less honest as the week gets harder. In the game, the bar at the top shows the tier and your running time.

---

## Why it's built for Reddit

- **The community is the content.** Every player who falls leaves an arrow, true or false, for everyone after them. Graves never reveal pits by themselves: the only clue is an arrow you have to decide to trust.
- **Your arrow has a reputation.** The game tracks who it saved and who it fooled, so players come back to see what their lie (or warning) did to the rest of the subreddit.
- **Same board for everyone, every day**, so the comments become a place to compare notes and argue about who lied, and times can be compared fairly.
- **Results become posts:** after your run you can share it as a new post in the subreddit. Your own caption is the title, and the post shows a game card with the room, your time, your standing and a button to try the same room. Spoiler-free, and never required.
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
- **One arrow shown per stone, one carving per player per day,** and candle use, crossing, carving and sharing are protected against double-submission.
- Sharing and joining only happen when you press their buttons, following Devvit's user-action rules.

---

## For developers

**Stack:** Devvit Web · React 19 · Vite · Hono · TypeScript · Redis (Devvit) · Canvas 2D · Web Audio.

```
src/shared/   rules shared by client and server
  board.ts      daily board generation, weekly difficulty, run judging
  solver.ts     careful-human solver used to accept only no-guess boards
  engine.ts     game rules over a small key-value interface (Redis on the server)
  share.ts      result posts: default caption and the game card's data
  pioneer.ts    time standings and titles
src/server/   Hono routes: game API, daily post scheduler, menu, install trigger
src/client/   React UI, the pixel renderer (engine/scene.ts) and synthesized sound
tools/        build_atlas.py packs the CC0 tileset frames into one sprite sheet;
              build_extras.py, build_scroll.py and build_icon.py prepare the
              campfire, the map scroll and the app icon from CC0 art
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

Dungeon art by **0x72**, *16x16 DungeonTileset II* (CC0). Campfire by **Idylwild** and map scroll by **Chloe Wolfe** (both CC0). Torch, flame, grave slabs, arrows, ghost, candles, numbers, lighting and all sound are original to Here Lies. Fonts: Pixelify Sans, Jacquard 24 and Caveat (SIL Open Font License). Full details in [CREDITS.md](CREDITS.md).

---

## Notes for judges

- **Sharing and joining:** Devvit runs user actions as the player only once an app is approved, and hackathon apps must stay unpublished. Until then, a shared result post is created by the app's account (the game card names the player, so it reads correctly either way), and **Join** opens the subreddit so you can join with one tap there.
- **The board is the same for everyone today.** Arrows you meet were carved by other players (and by the three nameless *forgotten* dead seeded each morning, so the first visitor of the day still has slabs to doubt).
