// Low-resolution pixel scene (112×192) scaled up with nearest-neighbour.
// Art: 0x72 "16x16 DungeonTileset II" (CC0) plus a few hand-made sprites.
// Each frame: draw the dungeon at full brightness → multiply by banded, dithered
// torchlight (nothing else lights the dark) → draw emissive bits (flame, sparks).
import { COLS, ROWS, START as START_CELL, clue, idx, mulberry32, neighbors, type Board, type Cell } from '../../shared/board';
import atlasUrl from '../assets/dungeon.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from './atlas';
import { C, type ColorKey } from './palette';
import { getSprites } from './sprites';
import { pointedCell } from '../../shared/epitaphs';

export const TILE = 16;
export const TOP = 32;
export const BOTTOM = 16;
export const SCENE_W = COLS * TILE;
export const SCENE_H = TOP + ROWS * TILE + BOTTOM;

export type GraveView = {
  /** the slab's arrow, or null if nobody carved it */
  arrow: number | null;
  falls: number;
  mine: boolean;
  /** only once the dark lifts: did the arrow tell the truth? */
  truth: boolean | null;
  /** walkers who have stood on it so far; it cracks as they add up */
  wear: number;
};

export type Phase = 'walking' | 'falling' | 'fallen' | 'crossing' | 'crossed' | 'idle';

export type SceneState = {
  board: Board;
  revealed: ReadonlySet<number>;
  player: Cell;
  graves: ReadonlyMap<number, GraveView>;
  phase: Phase;
  /** the dark has lifted (crossed, or out of candles): show the whole board */
  revealAll: boolean;
  /** just died: the hero stands on their slab as a ghost while carving */
  ghost: boolean;
  /** carving preview: the slab's stone and the arrow being considered */
  carvePreview: { stone: number; dir: number | null } | null;
  /** fading to black before a respawn */
  fading: boolean;
  /** game over: the soul rises from its pit and drifts to the entrance, ignoring the stones */
  soulLeaving: boolean;
  /** crossed: the dwarf cheers before the door, still in the dark */
  celebrating: boolean;
  /** 'Continue' after crossing: the dwarf walks out through the door */
  exiting: boolean;
};

/** How far the torch reaches, in tiles (centre to centre). Drawing and tapping share it. */
export const TORCH_REACH = 2.9;
const TORCH_RADIUS = TORCH_REACH + 0.6;

export const isLit = (player: Cell, cell: Cell): boolean =>
  Math.hypot(player.c - cell.c, player.r - cell.r) <= TORCH_REACH;


export type SceneEvents = {
  onFallDone?: () => void;
  onCrossDone?: () => void;
  /** the departing soul has reached the stairs */
  onSoulGone?: () => void;
  /** the dwarf has walked out through the far door */
  onExitDone?: () => void;
};

type Mote = { x: number; y: number; vx: number; vy: number; life: number; seed: number };
type Shatter = { x: number; y: number; t0: number };
const REVIVE_MS = 1500;
const LEAVE_MS = 2000;
const EXIT_MS = 1500;
const SHATTER_MS = 1100;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const FALL_MS = 900;
const CROSS_MS = 1200;
const HOP_MS = 180;
const IDLE_FRAME_MS = 140;
/** hero sprite is 16×28; feet sit on sprite row 27 */
const HERO_W = 16;
const HERO_H = 28;
/** where the hero's front hand is on the (right-facing) sprite */
const HAND = { x: 14, y: 17 };
/** the door leaf (32 px) is centred on the door's column */
const doorX = (board: Board): number => board.door.c * TILE - 8;

const FLOORS: readonly FrameName[] = ['floor_1', 'floor_2', 'floor_3', 'floor_4', 'floor_5', 'floor_6', 'floor_7', 'floor_8'];
const heroFrame = (running: boolean, n: number): FrameName =>
  (running ? HERO_RUN : HERO_IDLE)[n] ?? HERO_IDLE[0] ?? 'floor_1';

const hash2 = (a: number, b: number): number => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let atlasImage: HTMLImageElement | null = null;
const loadAtlas = (): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (atlasImage?.complete) return resolve(atlasImage);
    const img = new Image();
    img.onload = () => { atlasImage = img; resolve(img); };
    img.onerror = () => reject(new Error('dungeon atlas failed to load'));
    img.src = atlasUrl;
  });

export class Scene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly events: SceneEvents;
  private readonly reduced: boolean;
  private atlas: HTMLImageElement | null = null;
  private state: SceneState | null = null;
  private layerKey = '';
  private pos = { x: 0, y: 0 };
  private hopFrom = { x: 0, y: 0 };
  private hopT0 = -1;
  private facing: 1 | -1 = 1;
  private phaseT0 = 0;
  private lastPhase: Phase = 'idle';
  private motes: Mote[] = [];
  private embers: Mote[] = [];
  private shatters: Shatter[] = [];
  private fade = 0;
  private reviveT0 = -1;
  private raf = 0;
  private torchGlow = 1;
  private leaveT0 = -1;
  private exitT0 = -1;
  private dawn = 0;

  constructor(canvas: HTMLCanvasElement, events: SceneEvents = {}) {
    this.canvas = canvas;
    this.events = events;
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.layer = document.createElement('canvas');
    this.layer.width = SCENE_W;
    this.layer.height = SCENE_H;
    const lctx = this.layer.getContext('2d');
    if (!lctx) throw new Error('2d context unavailable');
    lctx.imageSmoothingEnabled = false;
    this.lctx = lctx;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < 18; i++) this.motes.push({ x: 0, y: 0, vx: 0, vy: 0, life: -1, seed: i * 7.3 });
    for (let i = 0; i < 5; i++) this.embers.push({ x: 0, y: 0, vx: 0, vy: 0, life: -1, seed: 900 + i * 13 });
    loadAtlas()
      .then((img) => { this.atlas = img; this.layerKey = ''; })
      .catch((e: unknown) => console.error(e));
  }

  setState(next: SceneState): void {
    const prev = this.state;
    this.state = next;
    const now = performance.now();
    if (!prev) {
      this.pos = { x: next.player.c, y: next.player.r };
    } else if (prev.player.c !== next.player.c || prev.player.r !== next.player.r) {
      const dc = next.player.c - prev.player.c;
      if (dc !== 0) this.facing = dc > 0 ? 1 : -1;
      const dist = Math.max(Math.abs(dc), Math.abs(prev.player.r - next.player.r));
      if (dist === 1 && !this.reduced) {
        this.hopFrom = { ...this.pos };
        this.hopT0 = now;
      } else {
        this.pos = { x: next.player.c, y: next.player.r };
        this.hopT0 = -1;
        this.facing = 1;
        // back at the stairs after dying: revive
        if (next.player.c === START_CELL.c && next.player.r === START_CELL.r && prev.phase !== 'walking' && !this.reduced) {
          this.reviveT0 = now;
          this.torchGlow = 0;
        }
      }
    }
    if (next.soulLeaving && !prev?.soulLeaving) this.leaveT0 = now;
    if (next.exiting && !prev?.exiting) this.exitT0 = now;
    if (!next.exiting) this.exitT0 = -1;
    if (!next.soulLeaving) this.leaveT0 = -1;
    if (next.phase !== this.lastPhase) {
      this.phaseT0 = now;
      this.lastPhase = next.phase;
    }
    // a slab that just vanished mid-walk crumbled under someone's feet
    if (prev && next.phase === 'walking' && !this.reduced) {
      prev.graves.forEach((g, i) => {
        if (g.arrow !== null && !next.graves.has(i)) {
          this.shatters.push({ x: (i % COLS) * TILE + 8, y: TOP + Math.floor(i / COLS) * TILE + 8, t0: now });
        }
      });
    }
  }

  start(): void {
    const loop = (t: number) => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Map a pointer position to a board cell, or null when outside the floor. */
  tileAt(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * SCENE_W;
    const y = ((clientY - rect.top) / rect.height) * SCENE_H - TOP;
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }

  private frameOf(x: CanvasRenderingContext2D, name: FrameName, dx: number, dy: number, flip = false): void {
    if (!this.atlas) return;
    const [sx, sy, w, h] = FRAMES[name];
    if (!flip) {
      x.drawImage(this.atlas, sx, sy, w, h, dx, dy, w, h);
      return;
    }
    x.save();
    x.translate(dx + w, dy);
    x.scale(-1, 1);
    x.drawImage(this.atlas, sx, sy, w, h, 0, 0, w, h);
    x.restore();
  }

  private px(x: CanvasRenderingContext2D, color: ColorKey, px: number, py: number, w = 1, h = 1): void {
    x.fillStyle = C[color];
    x.fillRect(px, py, w, h);
  }

  // ── static layer: walls, floor, numbers, graves (rebuilt only on change) ───
  private ensureLayer(s: SceneState, doorOpen: boolean): void {
    if (!this.atlas) return;
    let key = `${s.board.day}|${doorOpen ? 1 : 0}|${[...s.revealed].sort((a, b) => a - b).join(',')}|${s.ghost ? idx(s.player.c, s.player.r) : '-'}|`;
    key += s.revealAll ? 'R|' : '';
    s.graves.forEach((g, i) => { key += `${i}:${g.arrow}:${g.truth}:${g.wear}:${g.mine ? 1 : 0};`; });
    if (key === this.layerKey) return;
    this.layerKey = key;
    const x = this.lctx;
    x.fillStyle = C.void0;
    x.fillRect(0, 0, SCENE_W, SCENE_H);
    this.drawWall(x, s.board, doorOpen);
    const rand = mulberry32(s.board.day * 977 + 13);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const variant = rand() < 0.6 ? 0 : 1 + Math.floor(rand() * 7);
        this.frameOf(x, FLOORS[variant] ?? 'floor_1', c * TILE, TOP + r * TILE);
      }
    this.drawRock(x, s.board);
    // the doorway you came in through, below the start stone: the far door's
    // open leaf seen from inside the room (upside down), dark beyond
    this.drawEntrance(x);
    // pits stay hidden, even ones you fell into; they only appear when the dark lifts
    // while you're a ghost, the pit you died in gapes beneath you
    if (s.ghost && !s.revealAll) this.frameOf(x, 'hole', s.player.c * TILE, TOP + s.player.r * TILE);
    if (s.revealAll) {
      s.board.pits.forEach((isPit, p) => {
        if (isPit) this.frameOf(x, 'hole', (p % COLS) * TILE, TOP + Math.floor(p / COLS) * TILE);
      });
    }
    s.graves.forEach((g, i) => this.drawGrave(x, i, g));
    // numbers last; on a slab they move to the corner so the arrow stays clear
    for (const i of s.revealed) this.drawClue(x, s.board, i % COLS, Math.floor(i / COLS), s.graves.has(i));
  }

  /** Today's solid rock: a brick face where it meets the floor below, dark stone on top, a lit lip on its upper edge. */
  private drawRock(x: CanvasRenderingContext2D, board: Board): void {
    const rock = (c: number, r: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && board.walls[idx(c, r)] === true;
    const lip = FRAMES.wall_top_mid;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!rock(c, r)) continue;
        const X = c * TILE, Y = TOP + r * TILE;
        if (rock(c, r + 1)) {
          // the rock's flat top: dark stone, speckled so it never reads as unlit floor or a pit
          this.px(x, 'ink', X, Y, TILE, TILE);
          for (let k = 0; k < 7; k++) {
            const sx = Math.floor(hash2(c * 31 + k, r) * 15), sy = Math.floor(hash2(r * 17 + k, c) * 15);
            this.px(x, 'pst1', X + sx, Y + sy, k % 3 === 0 ? 2 : 1, 1);
          }
        } else {
          this.frameOf(x, 'wall_mid', X, Y);
        }
        // the stone lip along the top, unless the rock carries on upward (row 0 meets the wall)
        if (r > 0 && !rock(c, r - 1) && this.atlas) x.drawImage(this.atlas, lip[0], lip[1] + 11, TILE, 5, X, Y, TILE, 5);
      }
  }

  /** The room's near edge, open below the start stone: steps lead up toward the camp. */
  private drawEntrance(x: CanvasRenderingContext2D): void {
    if (!this.atlas) return;
    const dy = TOP + ROWS * TILE;
    const [lx, ly] = FRAMES.wall_top_mid;
    for (let c = 0; c < COLS; c++) {
      if (c === START_CELL.c) continue;
      x.drawImage(this.atlas, lx, ly + 11, TILE, 5, c * TILE, dy, TILE, 5);
    }
    const [sx, sy, w, h] = FRAMES.floor_stairs;
    x.save();
    x.translate(START_CELL.c * TILE, dy + h);
    x.scale(1, -1); // the steps climb toward you: up and out, back to the camp
    x.drawImage(this.atlas, sx, sy, w, h, 0, 0, w, h);
    x.restore();
  }

  private drawWall(x: CanvasRenderingContext2D, board: Board, doorOpen: boolean): void {
    for (let c = 0; c < COLS; c++) {
      this.frameOf(x, 'wall_top_mid', c * TILE, 0);
      this.frameOf(x, 'wall_mid', c * TILE, 16);
    }
    // banners hang wherever the door isn't
    const dc = board.door.c;
    for (const c of [0, COLS - 1]) if (Math.abs(c - dc) >= 2) this.frameOf(x, 'wall_banner_red', c * TILE, 16);
    const dx = doorX(board);
    // the open leaf's doorway is see-through: black it out, or the wall shows through
    if (doorOpen) this.px(x, 'void0', dx + 3, 3, 26, 27);
    this.frameOf(x, doorOpen ? 'doors_leaf_open' : 'doors_leaf_closed', dx, 0);
    this.frameOf(x, 'doors_frame_left', dx - 16, 0);
    this.frameOf(x, 'doors_frame_right', dx + 32, 0);
  }

  private drawClue(x: CanvasRenderingContext2D, board: Board, c: number, r: number, onSlab: boolean): void {
    const n = clue(board, c, r);
    if (n === 0) return;
    const X = c * TILE + (onSlab ? -5 : 0), Y = TOP + r * TILE + (onSlab ? -4 : 0);
    const sp = getSprites();
    const col: ColorKey = n >= 4 ? 'red2' : n === 3 ? 'warm4' : 'bone3';
    const dark = sp.digit(n, 'ink').canvas;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) x.drawImage(dark, X + 6 + ox, Y + 5 + oy);
    x.drawImage(sp.digit(n, col).canvas, X + 6, Y + 5);
  }

  /** A flat slab on the stone a wanderer fell from, carved with their arrow. */
  private drawGrave(x: CanvasRenderingContext2D, i: number, g: GraveView): void {
    const c = i % COLS, r = Math.floor(i / COLS);
    const X = c * TILE + 2, Y = TOP + r * TILE + 2;
    const sp = getSprites();
    x.drawImage((g.mine ? sp.slabMine : sp.slab).canvas, X, Y);
    // wear: every walker who stands here cracks it a little more
    if (g.wear >= 1) { this.px(x, 'ink', X + 8, Y + 1); this.px(x, 'ink', X + 9, Y + 2); }
    if (g.wear >= 2) { this.px(x, 'ink', X + 9, Y + 3); this.px(x, 'ink', X + 8, Y + 4); this.px(x, 'ink', X + 8, Y + 5); }
    if (g.wear >= 3) { this.px(x, 'ink', X + 1, Y + 8); this.px(x, 'ink', X + 2, Y + 9); this.px(x, 'ink', X + 3, Y + 9); this.px(x, 'ink', X + 4, Y + 10); }
    if (g.wear >= 4) { // about to go: chipped corners
      this.px(x, 'void0', X + 10, Y, 2, 1); this.px(x, 'void0', X + 11, Y + 1, 1, 1);
      this.px(x, 'void0', X, Y + 10, 1, 2); this.px(x, 'void0', X + 1, Y + 11, 1, 1);
      this.px(x, 'pst2', X + 9, Y + 1, 2, 1);
    }
    if (g.arrow !== null) {
      // plain carving while you walk; gold for truth, red for a lie once the dark lifts
      const col: ColorKey = g.truth === true ? 'warm4' : g.truth === false ? 'red2' : 'pst1';
      if (col !== 'pst1') x.drawImage(sp.arrow(g.arrow, 'ink').canvas, X + 3, Y + 3); // outline for coloured arrows
      x.drawImage(sp.arrow(g.arrow, col).canvas, X + 2, Y + 2);
    }
  }

  /** The dwarf's spirit hovering over the pit where it died (drawn after lighting, so it glows). */
  private drawGhost(ctx: CanvasRenderingContext2D, hx: number, hy: number, flip: boolean, t: number, alpha = 1): void {
    const frames = getSprites().ghost;
    const sprite = frames[this.reduced ? 0 : Math.floor(t * 2.5) % 2]!;
    const bob = this.reduced ? 0 : Math.round(Math.sin(t * 2.2) * 1.5);
    const gx = hx + Math.round((HERO_W - sprite.w) / 2);
    const gy = hy + HERO_H - sprite.h - 3 + bob;
    ctx.save();
    ctx.globalAlpha = 0.82 * alpha;
    if (flip) {
      ctx.translate(gx + sprite.w, gy);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite.canvas, 0, 0);
    } else {
      ctx.drawImage(sprite.canvas, gx, gy);
    }
    ctx.restore();
  }

  /** The slab with the chosen arrow, a dotted line, and the stone it points at. */
  private drawCarvePreview(ctx: CanvasRenderingContext2D, stone: number, dir: number | null, t: number): void {
    const sc = stone % COLS, sr = Math.floor(stone / COLS);
    const X = sc * TILE, Y = TOP + sr * TILE;
    const sp = getSprites();
    ctx.save();
    ctx.drawImage(sp.slab.canvas, X + 2, Y + 2);
    ctx.restore();
    if (dir === null) return;
    const pulse = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 5);
    ctx.drawImage(sp.arrow(dir, 'ink').canvas, X + 5, Y + 5);
    ctx.drawImage(sp.arrow(dir, 'warm4').canvas, X + 4, Y + 4);
    const to = pointedCell({ c: sc, r: sr }, dir);
    if (to.c < 0 || to.r < 0 || to.c >= COLS || to.r >= ROWS) return;
    // the stone it points at gets red corner marks on the floor, under any character
    const TX = to.c * TILE, TY = TOP + to.r * TILE, e = TILE - 2;
    const col: ColorKey = pulse > 0.5 ? 'red2' : 'red1';
    this.px(ctx, col, TX + 1, TY + 1, 3, 1); this.px(ctx, col, TX + 1, TY + 1, 1, 3);
    this.px(ctx, col, TX + e - 2, TY + 1, 3, 1); this.px(ctx, col, TX + e, TY + 1, 1, 3);
    this.px(ctx, col, TX + 1, TY + e, 3, 1); this.px(ctx, col, TX + 1, TY + e - 2, 1, 3);
    this.px(ctx, col, TX + e - 2, TY + e, 3, 1); this.px(ctx, col, TX + e, TY + e - 2, 1, 3);
  }

  // ── per frame ────────────────────────────────────────────────────────────
  private frame(now: number): void {
    const s = this.state;
    if (!s || !this.atlas) return;
    const t = now / 1000;
    const phaseP = (ms: number) => Math.min(1, (now - this.phaseT0) / ms);

    let hop = 0;
    let hopP = -1;
    if (this.hopT0 >= 0) {
      hopP = Math.min(1, (now - this.hopT0) / HOP_MS);
      const e = hopP < 0.5 ? 2 * hopP * hopP : 1 - Math.pow(-2 * hopP + 2, 2) / 2;
      this.pos.x = this.hopFrom.x + (s.player.c - this.hopFrom.x) * e;
      this.pos.y = this.hopFrom.y + (s.player.r - this.hopFrom.y) * e;
      hop = Math.sin(hopP * Math.PI) * 3;
      if (hopP >= 1) this.hopT0 = -1;
    }

    let fallP = 0, crossP = 0;
    if (s.phase === 'falling') {
      fallP = phaseP(FALL_MS);
      if (fallP >= 1 && this.lastPhase === 'falling') { this.lastPhase = 'fallen'; this.events.onFallDone?.(); }
    }
    if (s.phase === 'fallen') fallP = 1;
    if (s.phase === 'crossing') {
      crossP = phaseP(CROSS_MS);
      if (crossP >= 1 && this.lastPhase === 'crossing') { this.lastPhase = 'crossed'; this.events.onCrossDone?.(); }
    }
    if (s.phase === 'crossed') crossP = 1;

    this.ensureLayer(s, crossP > 0.08);

    // the door opens as you reach it; you only walk through it on 'Continue'
    let exitP = 0;
    if (this.exitT0 >= 0) {
      exitP = Math.min(1, (now - this.exitT0) / EXIT_MS);
      if (exitP >= 1) { this.exitT0 = -2; this.events.onExitDone?.(); }
    } else if (this.exitT0 === -2) exitP = 1;
    const walkK = Math.min(1, exitP / 0.6);
    let walkY = exitP > 0 ? s.player.r - walkK * 1.5 : this.pos.y;
    let walkX = exitP > 0 ? this.pos.x + (s.board.door.c - this.pos.x) * walkK : this.pos.x;
    // the soul's way home: straight to the stairs it came up, over pits and rock alike
    let soulAlpha = 1;
    if (s.ghost && this.leaveT0 !== -1) {
      const raw = this.leaveT0 === -2 ? 1 : Math.min(1, (now - this.leaveT0) / LEAVE_MS);
      const k = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      walkX = this.pos.x + (START_CELL.c - this.pos.x) * k;
      walkY = this.pos.y + (ROWS + 0.35 - this.pos.y) * k - Math.sin(raw * Math.PI) * 0.6;
      soulAlpha = 1 - Math.max(0, (raw - 0.82) / 0.18);
      if (raw >= 1 && this.leaveT0 !== -2) { this.leaveT0 = -2; this.events.onSoulGone?.(); }
    }
    if (this.leaveT0 === -2) soulAlpha = 0;

    const ctx = this.ctx;
    ctx.drawImage(this.layer, 0, 0);

    // the floor opening under a falling hero
    if (s.phase === 'falling') {
      const fx = s.player.c * TILE + 8, fy = TOP + s.player.r * TILE + 9;
      const rr = 2 + Math.min(1, fallP / 0.5) * 6;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.ellipse(fx, fy, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }

    // shattering slabs: fragments burst out and fall, dust drifts and settles
    this.shatters = this.shatters.filter((sh) => now - sh.t0 < SHATTER_MS);
    for (const sh of this.shatters) {
      const p = (now - sh.t0) / SHATTER_MS;
      if (p < 0.12) { // the instant it gives: a bright crack across the slab
        this.px(ctx, 'pst4', sh.x - 5, sh.y - 1, 10, 1);
        this.px(ctx, 'pst4', sh.x - 1, sh.y - 5, 1, 10);
      }
      for (let k = 0; k < 12; k++) { // chunks of slab burst out, arc and fall
        const a = (k / 12) * Math.PI * 2 + hash2(k, 7) * 0.6;
        const v = 7 + hash2(k, 3) * 8;
        const fx = sh.x + Math.cos(a) * v * p;
        const fy = sh.y + Math.sin(a) * v * p * 0.7 - Math.sin(p * Math.PI) * 4 + p * p * 12;
        const col: ColorKey = k % 3 === 0 ? 'pst4' : k % 3 === 1 ? 'pst3' : 'pst2';
        const size = k % 3 === 2 ? 1 : 2;
        if (p < 0.9) this.px(ctx, col, Math.round(fx), Math.round(fy), size, size);
      }
      for (let k = 0; k < 16; k++) { // a dust cloud that swells, rises and thins
        if (hash2(k, Math.floor(p * 14)) > 1.05 - p) continue;
        const dx = (hash2(k, 11) - 0.5) * 16 * (0.3 + p), dy = -p * 7 + (hash2(k, 13) - 0.5) * 8;
        this.px(ctx, k % 2 ? 'pst2' : 'pst1', Math.round(sh.x + dx), Math.round(sh.y + dy));
      }
    }

    // hero
    const hx = Math.round(walkX * TILE + (TILE - HERO_W) / 2);
    let hy = Math.round(TOP + walkY * TILE + 14 - (HERO_H - 1) - hop);
    const showHero = !s.ghost && s.phase !== 'fallen' && s.phase !== 'idle' && exitP <= 0.6;
    const running = hopP >= 0 || (exitP > 0 && exitP < 0.6);
    const frameNo = running
      ? Math.floor(((hopP >= 0 ? hopP : exitP * 6) * 4) % 4)
      : this.reduced ? 0 : Math.floor(now / IDLE_FRAME_MS) % 4;
    const flip = this.facing < 0;
    // cheering at the door: hopping for joy, the torch thrust up high
    const cheering = s.phase === 'crossed' && s.celebrating && exitP === 0;
    if (cheering && !this.reduced) hy -= Math.round(Math.abs(Math.sin(t * 5.5)) * 5);
    if (showHero) {
      ctx.save();
      if (fallP > 0) {
        hy += Math.round(fallP * fallP * 14);
        ctx.beginPath();
        ctx.rect(0, 0, SCENE_W, TOP + s.player.r * TILE + 12);
        ctx.clip();
      }
      if (exitP > 0) { // the doorway swallows the hero
        ctx.beginPath();
        ctx.rect(0, 12, SCENE_W, SCENE_H);
        ctx.clip();
      }
      const reviveP = this.reviveT0 >= 0 ? (now - this.reviveT0) / REVIVE_MS : 1;
      if (reviveP < 0.45) ctx.globalAlpha = Math.max(0, (reviveP - 0.1) / 0.35);
      this.frameOf(ctx, heroFrame(running, frameNo), hx, hy, flip);
      ctx.restore();
    }

    // ── lighting: the torch is the only light until the dark lifts ──
    // torch held out beside the head, so the flame never merges with the sprite
    const out = flip ? -1 : 1;
    // cheering, the torch is thrust up high; otherwise it's held out beside the head
    const hand = { x: hx + (flip ? HERO_W - 1 - HAND.x : HAND.x) + out, y: hy + HAND.y - (cheering ? 7 : 0) };
    // a ghost carries no torch: a cold glow of its own lights the stones instead
    const torch = s.ghost ? { x: hx + 8, y: hy + 16 } : { x: hand.x, y: hand.y - 11 };
    const tint = s.ghost ? [0.62, 0.8, 1.05] : [1, 0.68, 0.38];
    const flick = this.reduced ? 1 : 1 + 0.06 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 15.7 + 1.3) + 0.025 * Math.sin(t * 37.0);
    const targetGlow = s.ghost ? 0.8 * soulAlpha : s.phase === 'fallen' || s.phase === 'idle' ? 0 : 1;
    this.torchGlow += (targetGlow - this.torchGlow) * 0.08;
    const LR = Math.max(1, TORCH_RADIUS * TILE * (s.ghost ? 1 : flick) * this.torchGlow * (s.ghost ? 1 : 1 - 0.75 * fallP));
    const [tr, tg, tb] = tint as [number, number, number];
    const targetDawn = s.revealAll ? 1 : 0;
    this.dawn += (targetDawn - this.dawn) * 0.05;
    const dawn = this.dawn;
    const ambR = dawn * 1.05, ambG = dawn * 0.98, ambB = dawn * 0.9;
    const LR2 = LR * LR;

    const img = ctx.getImageData(0, 0, SCENE_W, SCENE_H);
    const d = img.data;
    for (let y = 0; y < SCENE_H; y++) {
      const dy = y - torch.y;
      for (let x = 0; x < SCENE_W; x++) {
        const dx = x - torch.x;
        let lr = ambR, lg = ambG, lb = ambB;
        const dd = (dx * dx + dy * dy) / LR2;
        if (dd < 1) {
          // near the flame: bright and warm; toward the edge: dim, then nothing
          const f = (1 - dd) * (1 - dd) * 1.9;
          lr += tr * f; lg += tg * f; lb += tb * f;
        }
        const th = BAYER[(x & 3) | ((y & 3) << 2)]!;
        const o = (y * SCENE_W + x) * 4;
        d[o] = Math.min(255, d[o]! * Math.min(1.25, Math.floor(lr * 6 + th) / 6));
        d[o + 1] = Math.min(255, d[o + 1]! * Math.min(1.25, Math.floor(lg * 6 + th) / 6));
        d[o + 2] = Math.min(255, d[o + 2]! * Math.min(1.25, Math.floor(lb * 6 + th) / 6));
      }
    }

    // screen shake when the floor gives way
    let sx = 0, sy = 0;
    if (s.phase === 'falling' && fallP > 0.15 && fallP < 0.5 && !this.reduced) {
      sx = Math.round(Math.sin(now * 0.09) * 1.2); sy = Math.round(Math.cos(now * 0.11));
    }
    if (sx || sy) { ctx.fillStyle = C.void0; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    ctx.putImageData(img, sx, sy);
    ctx.save();
    ctx.translate(sx, sy);

    // ── emissive layer ──
    // a faint warmth spills down the steps from the camp fire above
    {
      const ex = START_CELL.c * TILE, ey = TOP + ROWS * TILE;
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = `rgba(255, 150, 60, ${(0.05 + 0.025 * k).toFixed(3)})`;
        ctx.fillRect(ex + 1, ey + 8 + k, TILE - 2, 1);
      }
    }
    const blink = (seed: number, rate: number) => hash2(Math.floor(t * rate), Math.floor(seed * 1000));

    // once the dark lifts, slabs pulse gently so it's clear they can be read
    if (s.revealAll && !this.reduced && Math.sin(t * 3) > 0.2) {
      s.graves.forEach((g, i) => {
        if (g.arrow === null) return;
        const X = (i % COLS) * TILE + 2, Y = TOP + Math.floor(i / COLS) * TILE + 2;
        const col: ColorKey = g.truth ? 'warm5' : 'red2';
        this.px(ctx, col, X, Y, 12, 1); this.px(ctx, col, X, Y + 11, 12, 1);
        this.px(ctx, col, X, Y, 1, 12); this.px(ctx, col, X + 11, Y, 1, 12);
      });
    }

        // carving: your ghost on the slab, and a preview of the arrow being considered
    if (s.carvePreview) this.drawCarvePreview(ctx, s.carvePreview.stone, s.carvePreview.dir, t);
    if (s.ghost && soulAlpha > 0) this.drawGhost(ctx, hx, hy, flip, t, soulAlpha);

    // step markers: corner brackets on stones you can step to
    if (s.phase === 'walking' && this.hopT0 < 0) {
      const pulse = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 4);
      const col: ColorKey = pulse > 0.5 ? 'warm5' : 'warm3';
      for (const n of neighbors(s.player.c, s.player.r)) {
        if (s.board.walls[idx(n.c, n.r)]) continue;
        const X = n.c * TILE, Y = TOP + n.r * TILE, e = TILE - 2;
        this.px(ctx, col, X + 1, Y + 1, 2, 1); this.px(ctx, col, X + 1, Y + 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + 1, 2, 1); this.px(ctx, col, X + e, Y + 1, 1, 2);
        this.px(ctx, col, X + 1, Y + e, 2, 1); this.px(ctx, col, X + 1, Y + e - 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + e, 2, 1); this.px(ctx, col, X + e, Y + e - 1, 1, 2);
      }
    }

    // a crossing: golden sparks burst up and drift around the cheering dwarf
    if (cheering && !this.reduced) {
      for (let k = 0; k < 12; k++) {
        const q = (t * 0.8 + hash2(k, 21)) % 1;
        if (q > 0.85) continue;
        const ang = hash2(k, 5) * Math.PI * 2;
        const r = 4 + q * 13;
        const px = Math.round(hx + 8 + Math.cos(ang) * r);
        const py = Math.round(hy + 12 + Math.sin(ang) * r * 0.6 - q * 10);
        this.px(ctx, q < 0.3 ? 'warm6' : q < 0.6 ? 'warm5' : 'warm4', px, py);
      }
    }

    // torch: handle, flame, sparks, dust
    if (showHero && fallP < 0.7) {
      const fx = torch.x, fy = torch.y;
      // handle (outlined so it reads against the floor)
      this.px(ctx, 'ink', hand.x - 1, fy + 2, 3, hand.y - fy - 1);
      this.px(ctx, 'warm2', hand.x, fy + 3, 1, hand.y - fy - 3);
      this.px(ctx, 'ink', fx - 2, fy + 1, 5, 3);
      this.px(ctx, 'warm1', fx - 1, fy + 2, 3, 1); // wrapped torch head
      this.px(ctx, 'warm3', fx - 1, fy + 1, 3, 1);
      // flame: white-hot core, yellow body, orange licks that dance
      const lean = blink(2, 9) > 0.5 ? 1 : -1;
      this.px(ctx, 'warm4', fx - 1, fy - 2, 3, 3);
      this.px(ctx, 'warm5', fx, fy - 3, 1, 4);
      this.px(ctx, 'warm5', fx - 1, fy - 1, 3, 1);
      this.px(ctx, blink(1, 14) > 0.3 ? 'warm6' : 'warm5', fx, fy - 1, 1, 2);
      this.px(ctx, 'warm4', fx + lean, fy - 3);
      if (blink(3, 8) > 0.25) this.px(ctx, 'warm5', fx + (lean > 0 ? 0 : 1) * lean, fy - 4);
      if (blink(5, 7) > 0.55) this.px(ctx, 'warm3', fx + lean, fy - 5);
      if (!this.reduced) {
        for (const e of this.embers) {
          e.life -= 1 / 60;
          if (e.life < 0) {
            e.x = fx + (hash2(Math.floor(t * 20), e.seed) - 0.5) * 2;
            e.y = fy - 1;
            e.vx = (hash2(e.seed, Math.floor(t * 7)) - 0.5) * 0.25;
            e.vy = -0.25 - hash2(Math.floor(t * 9), e.seed) * 0.3;
            e.life = 0.4 + hash2(e.seed * 3, Math.floor(t * 5)) * 0.6;
          }
          e.x += e.vx; e.y += e.vy;
          this.px(ctx, e.life > 0.35 ? 'warm5' : 'warm3', Math.round(e.x), Math.round(e.y));
        }
        for (const m of this.motes) {
          m.life -= 1 / 60;
          if (m.life < 0 || Math.hypot(m.x - fx, m.y - fy) > LR) {
            const a = hash2(Math.floor(t * 10), Math.floor(m.seed * 100)) * Math.PI * 2;
            const rr = Math.sqrt(hash2(Math.floor(m.seed * 77), Math.floor(t * 13))) * LR * 0.8;
            m.x = fx + Math.cos(a) * rr; m.y = fy + Math.sin(a) * rr;
            m.vx = (hash2(m.seed, Math.floor(t)) - 0.5) * 0.08; m.vy = -0.03 - hash2(Math.floor(t * 3), m.seed) * 0.06;
            m.life = 2 + hash2(Math.floor(m.seed), Math.floor(t * 5)) * 3;
          }
          m.x += m.vx + Math.sin(t * 1.3 + m.seed) * 0.03; m.y += m.vy;
          const dist = Math.hypot(m.x - fx, m.y - fy);
          if (dist < LR * 0.8 && blink(m.seed, 6) > 0.25) this.px(ctx, dist < LR * 0.4 ? 'warm5' : 'warm3', Math.round(m.x), Math.round(m.y));
        }
      }
    }

    // revival at the stairs: a shaft of light, rising sparks, a ring at the feet
    if (this.reviveT0 >= 0) {
      const p = (now - this.reviveT0) / REVIVE_MS;
      if (p >= 1) this.reviveT0 = -1;
      else {
        const cx = hx + 8, foot = hy + HERO_H - 2;
        const beam = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
        for (let y = 0; y < foot; y++) {
          const w = y > foot - 30 ? 3 : 2;
          for (let k = -w; k <= w; k++) {
            if (hash2(y * 7 + k, Math.floor(t * 20)) > beam * (1 - Math.abs(k) / (w + 1)) * 0.9) continue;
            this.px(ctx, Math.abs(k) <= 1 ? 'warm6' : 'warm5', cx + k, y);
          }
        }
        if (p < 0.4) { // a ring of light spreading at the feet
          const rr = 2 + p * 22;
          for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            this.px(ctx, 'warm5', Math.round(cx + Math.cos(ang) * rr), Math.round(foot + Math.sin(ang) * rr * 0.35));
          }
        }
        for (let k = 0; k < 14; k++) { // sparks drifting up
          const sp = (p * 1.4 + hash2(k, 5)) % 1;
          const sx = cx + Math.round((hash2(k, 9) - 0.5) * 18 + Math.sin(t * 3 + k) * 2);
          const sy = Math.round(foot - sp * 34);
          if (p < 0.85) this.px(ctx, sp < 0.5 ? 'warm6' : 'warm4', sx, sy);
        }
      }
    }

    // debris falling into the pit
    if (s.phase === 'falling' && fallP < 0.8) {
      const fx = s.player.c * TILE + 8, fy = TOP + s.player.r * TILE + 9;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = 3 + fallP * 6;
        this.px(ctx, k % 2 ? 'lit4' : 'lit3', Math.round(fx + Math.cos(a) * rr), Math.round(fy + Math.sin(a) * rr * 0.6 + fallP * fallP * 8));
      }
    }
    ctx.restore();

    // fade to black between death and rebirth
    this.fade += ((s.fading ? 1 : 0) - this.fade) * (s.fading ? 0.16 : 0.07);
    if (this.fade > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.fade);
      ctx.fillStyle = C.void0;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.restore();
    }
  }
}
