// Low-resolution pixel scene (112×192) scaled up with nearest-neighbour.
// Art: 0x72 "16x16 DungeonTileset II" (CC0) plus a few hand-made sprites.
// Each frame: draw the dungeon at full brightness → multiply by banded, dithered
// torchlight (nothing else lights the dark) → draw emissive bits (flame, sparks).
import { COLS, ROWS, clue, idx, mulberry32, neighbors, type Board, type Cell } from '../../shared/board';
import atlasUrl from '../assets/dungeon.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from './atlas';
import { C, type ColorKey } from './palette';
import { getSprites } from './sprites';

export const TILE = 16;
export const TOP = 32;
export const BOTTOM = 16;
export const SCENE_W = COLS * TILE;
export const SCENE_H = TOP + ROWS * TILE + BOTTOM;

export type GraveView = {
  falls: number;
  honest: number;
  liar: number;
  carved: boolean;
  mine: boolean;
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
};

/** How far the torch reaches, in tiles (centre to centre). Drawing and tapping share it. */
export const TORCH_REACH = 2.9;
const TORCH_RADIUS = TORCH_REACH + 0.6;

export const isLit = (player: Cell, cell: Cell): boolean =>
  Math.hypot(player.c - cell.c, player.r - cell.r) <= TORCH_REACH;

export const isKnownLiar = (g: GraveView): boolean => g.honest + g.liar >= 3 && g.liar > g.honest * 1.5;

export type SceneEvents = {
  onFallDone?: () => void;
  onCrossDone?: () => void;
};

type Mote = { x: number; y: number; vx: number; vy: number; life: number; seed: number };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const FALL_MS = 900;
const CROSS_MS = 2400;
const HOP_MS = 180;
const IDLE_FRAME_MS = 140;
/** hero sprite is 16×28; feet sit on sprite row 27 */
const HERO_W = 16;
const HERO_H = 28;
/** where the hero's front hand is on the (right-facing) sprite */
const HAND = { x: 14, y: 17 };
const DOOR_X = 40;

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
  private raf = 0;
  private torchGlow = 1;
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
      }
    }
    if (next.phase !== this.lastPhase) {
      this.phaseT0 = now;
      this.lastPhase = next.phase;
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
    let key = `${s.board.day}|${doorOpen ? 1 : 0}|${[...s.revealed].sort((a, b) => a - b).join(',')}|`;
    s.graves.forEach((g, i) => { key += `${i}:${g.falls}:${g.honest}:${g.liar}:${g.carved ? 1 : 0}:${g.mine ? 1 : 0};`; });
    if (key === this.layerKey) return;
    this.layerKey = key;
    const x = this.lctx;
    x.fillStyle = C.void0;
    x.fillRect(0, 0, SCENE_W, SCENE_H);
    this.drawWall(x, doorOpen);
    const rand = mulberry32(s.board.day * 977 + 13);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const variant = rand() < 0.6 ? 0 : 1 + Math.floor(rand() * 7);
        this.frameOf(x, FLOORS[variant] ?? 'floor_1', c * TILE, TOP + r * TILE);
        if (s.revealed.has(idx(c, r))) this.drawClue(x, s.board, c, r);
      }
    // entrance stairs below the start stone
    this.frameOf(x, 'floor_stairs', 3 * TILE, TOP + ROWS * TILE);
    s.graves.forEach((g, i) => this.drawGrave(x, i, g));
  }

  private drawWall(x: CanvasRenderingContext2D, doorOpen: boolean): void {
    for (let c = 0; c < COLS; c++) {
      this.frameOf(x, 'wall_top_mid', c * TILE, 0);
      this.frameOf(x, 'wall_mid', c * TILE, 16);
    }
    this.frameOf(x, 'wall_banner_red', 0, 16);
    this.frameOf(x, 'wall_banner_red', 6 * TILE, 16);
    this.frameOf(x, doorOpen ? 'doors_leaf_open' : 'doors_leaf_closed', DOOR_X, 0);
    this.frameOf(x, 'doors_frame_left', DOOR_X - 16, 0);
    this.frameOf(x, 'doors_frame_right', DOOR_X + 32, 0);
  }

  private drawClue(x: CanvasRenderingContext2D, board: Board, c: number, r: number): void {
    const n = clue(board, c, r);
    if (n === 0) return;
    const X = c * TILE, Y = TOP + r * TILE;
    const sp = getSprites();
    const col: ColorKey = n >= 4 ? 'red2' : n === 3 ? 'warm4' : 'bone3';
    const dark = sp.digit(n, 'ink').canvas;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) x.drawImage(dark, X + 6 + ox, Y + 5 + oy);
    x.drawImage(sp.digit(n, col).canvas, X + 6, Y + 5);
  }

  private drawGrave(x: CanvasRenderingContext2D, i: number, g: GraveView): void {
    const c = i % COLS, r = Math.floor(i / COLS);
    const X = c * TILE, Y = TOP + r * TILE;
    this.frameOf(x, 'hole', X, Y);
    const sp = getSprites();
    x.drawImage((g.mine ? sp.stoneMine : sp.stone).canvas, X + 3, Y + 2);
    if (g.falls > 1) this.frameOf(x, 'skull', X - 4, Y + 4);
    if (isKnownLiar(g)) {
      for (let k = 0; k < 4; k++) {
        this.px(x, 'red2', X + 5 + k, Y + 5 + k);
        this.px(x, 'red2', X + 8 - k, Y + 5 + k);
      }
    }
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

    // walking through the door while crossing
    const walkK = Math.min(1, crossP / 0.5);
    const walkY = crossP > 0 ? s.player.r - walkK * 1.5 : this.pos.y;
    const walkX = crossP > 0 ? this.pos.x + (3 - this.pos.x) * walkK : this.pos.x;

    const ctx = this.ctx;
    ctx.drawImage(this.layer, 0, 0);

    // the floor opening under a falling hero
    if (fallP > 0 && s.phase !== 'walking') {
      const fx = s.player.c * TILE + 8, fy = TOP + s.player.r * TILE + 9;
      const rr = 2 + Math.min(1, fallP / 0.5) * 6;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.ellipse(fx, fy, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }

    // hero
    const hx = Math.round(walkX * TILE + (TILE - HERO_W) / 2);
    let hy = Math.round(TOP + walkY * TILE + 14 - (HERO_H - 1) - hop);
    const showHero = s.phase !== 'fallen' && s.phase !== 'idle' && crossP <= 0.6;
    const running = hopP >= 0 || (crossP > 0 && crossP < 0.6);
    const frameNo = running
      ? Math.floor(((hopP >= 0 ? hopP : crossP * 6) * 4) % 4)
      : this.reduced ? 0 : Math.floor(now / IDLE_FRAME_MS) % 4;
    const flip = this.facing < 0;
    if (showHero) {
      ctx.save();
      if (fallP > 0) {
        hy += Math.round(fallP * fallP * 14);
        ctx.beginPath();
        ctx.rect(0, 0, SCENE_W, TOP + s.player.r * TILE + 12);
        ctx.clip();
      }
      if (crossP > 0) { // the doorway swallows the hero
        ctx.beginPath();
        ctx.rect(0, 12, SCENE_W, SCENE_H);
        ctx.clip();
      }
      this.frameOf(ctx, heroFrame(running, frameNo), hx, hy, flip);
      ctx.restore();
    }

    // ── lighting: the torch is the only light until the dark lifts ──
    // torch held out beside the head, so the flame never merges with the sprite
    const out = flip ? -1 : 1;
    const hand = { x: hx + (flip ? HERO_W - 1 - HAND.x : HAND.x) + out, y: hy + HAND.y };
    const torch = { x: hand.x, y: hand.y - 11 };
    const flick = this.reduced ? 1 : 1 + 0.06 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 15.7 + 1.3) + 0.025 * Math.sin(t * 37.0);
    const targetGlow = s.phase === 'fallen' || s.phase === 'idle' ? 0 : 1;
    this.torchGlow += (targetGlow - this.torchGlow) * 0.08;
    const LR = Math.max(1, TORCH_RADIUS * TILE * flick * this.torchGlow * (1 - 0.75 * fallP));
    const targetDawn = s.revealAll ? 1 : crossP > 0.35 ? Math.min(1, (crossP - 0.35) / 0.65) : 0;
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
          lr += f; lg += 0.68 * f; lb += 0.38 * f;
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
    const blink = (seed: number, rate: number) => hash2(Math.floor(t * rate), Math.floor(seed * 1000));

    // step markers: corner brackets on stones you can step to
    if (s.phase === 'walking' && this.hopT0 < 0) {
      const pulse = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 4);
      const col: ColorKey = pulse > 0.5 ? 'warm5' : 'warm3';
      for (const n of neighbors(s.player.c, s.player.r)) {
        const g = s.graves.get(idx(n.c, n.r));
        if (g && g.carved) continue;
        const X = n.c * TILE, Y = TOP + n.r * TILE, e = TILE - 2;
        this.px(ctx, col, X + 1, Y + 1, 2, 1); this.px(ctx, col, X + 1, Y + 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + 1, 2, 1); this.px(ctx, col, X + e, Y + 1, 1, 2);
        this.px(ctx, col, X + 1, Y + e, 2, 1); this.px(ctx, col, X + 1, Y + e - 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + e, 2, 1); this.px(ctx, col, X + e, Y + e - 1, 1, 2);
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
  }
}
